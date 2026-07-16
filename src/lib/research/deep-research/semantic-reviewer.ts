import type { RetrievalProvider } from "@/lib/providers/retrieval.types";
import { buildDeepRetrievalQueries } from "@/lib/research/evidence-ledger";
import {
  serializeUntrustedResearchData,
  StructuredCompletionError,
  type StructuredCompletionProvider,
} from "@/lib/providers/structured-completion";
import {
  applyClaimAdjudicationPass,
  applyClaimReviewPass,
  initializeDeepValidation,
  registerTrustedReviewSources,
} from "@/lib/research/deep-validation";
import { isValidationLedgerV2 } from "@/lib/research/ledger-guards";
import type {
  ClaimReviewFinding,
  ClaimReviewPassKind,
  ClaimReviewSource,
  ClaimReviewerIdentity,
  DeepValidationPassKind,
  ResearchClaim,
  ResearchSession,
  ValidationLedgerV2,
} from "@/lib/schema/research-schema";
import { DeepWorkExecutionError } from "./service";

const REVIEW_PROMPT_VERSION = "deep-claim-review-v1";
const REVIEW_TIMEOUT_MS = 90_000;
const MAX_REVIEW_ATTEMPTS = 2;
const MAX_PROMPT_SOURCES = 80;
const ADJUDICATION_BATCH_SIZE = 7;
const ADJUDICATION_BATCH_CONCURRENCY = 3;
const ADJUDICATION_BATCH_ATTEMPTS = 1;
const ADJUDICATION_STAGE_TIMEOUT_MS = 220_000;

interface ReviewEnvelope {
  findings: unknown[];
}

interface AdjudicationEnvelope {
  adjudications: unknown[];
}

export interface DeepSemanticReviewerOptions {
  provider: StructuredCompletionProvider;
  retrieval: RetrievalProvider;
  sleep?: (milliseconds: number, signal?: AbortSignal) => Promise<void>;
}

/** Executes one real semantic pass; ordering and durable retries stay in the coordinator. */
export class DeepSemanticReviewer {
  private readonly sleep: (milliseconds: number, signal?: AbortSignal) => Promise<void>;

  constructor(private readonly options: DeepSemanticReviewerOptions) {
    this.sleep = options.sleep ?? abortableSleep;
  }

  get providerId(): string {
    return this.options.provider.id;
  }

  get retrievalProviderId(): string {
    return this.options.retrieval.id;
  }

  async runPass(
    session: ResearchSession,
    pass: DeepValidationPassKind,
    signal?: AbortSignal,
  ): Promise<ResearchSession> {
    this.assertRuntimeCapability();
    throwIfAborted(signal);
    const next = structuredClone(session);
    let ledger = this.ledgerForPass(next, pass);
    if (ledger.protocol.completedPassKinds.includes(pass)) return next;
    if (ledger.claims.length === 0) {
      throw new DeepWorkExecutionError(
        "no_decision_critical_claims",
        false,
        "Deep Research produced no bounded decision-critical claims to validate.",
      );
    }

    if (pass === "independent_corroboration_conflict") {
      const independentSources = await this.retrieveIndependentEvidence(next, ledger, signal);
      ledger = registerTrustedReviewSources(ledger, independentSources);
      assertIndependentRetrievalCoverage(ledger, groupClaimsByAgent(ledger.claims).keys());
    }

    const reviewer = reviewerIdentity(this.options.provider, pass);
    if (pass === "adjudication") {
      const adjudications = await this.completeAdjudicationBatches(ledger, reviewer, signal);
      const controlled = overwriteAdjudicationAuthority(adjudications, reviewer);
      ledger = applyClaimAdjudicationPass(ledger, controlled);
      assertCompleteAdjudicationCoverage(ledger);
    } else {
      const response = await this.completeWithRetry<ReviewEnvelope>(
        requestForClaimReview(ledger, pass, reviewer, signal),
        isReviewEnvelope,
        signal,
      );
      const controlled = overwriteFindingAuthority(response.findings, pass, reviewer);
      ledger = applyClaimReviewPass(ledger, pass, controlled);
      assertCompleteFindingCoverage(ledger, pass);
    }

    next.validation = ledger;
    next.updatedAt = new Date().toISOString();
    return next;
  }

  /**
   * Keep terminal adjudication inside the durable-work lease without weakening
   * all-claim coverage. Each provider request sees only its claim-scoped
   * findings and sources; the ledger is committed once, after every batch has
   * settled successfully.
   */
  private async completeAdjudicationBatches(
    ledger: ValidationLedgerV2,
    reviewer: ClaimReviewerIdentity,
    signal?: AbortSignal,
  ): Promise<unknown[]> {
    const batches = chunkValues(ledger.claims, ADJUDICATION_BATCH_SIZE);
    const adjudications: unknown[] = [];
    const stageController = new AbortController();
    let stageTimedOut = false;
    const abortFromCaller = () => stageController.abort(signal?.reason);
    signal?.addEventListener("abort", abortFromCaller, { once: true });
    if (signal?.aborted) abortFromCaller();
    const stageTimer = setTimeout(() => {
      stageTimedOut = true;
      stageController.abort(new DOMException("Adjudication stage timed out", "TimeoutError"));
    }, ADJUDICATION_STAGE_TIMEOUT_MS);

    try {
      for (let offset = 0; offset < batches.length; offset += ADJUDICATION_BATCH_CONCURRENCY) {
        throwIfAborted(stageController.signal);
        const wave = batches.slice(offset, offset + ADJUDICATION_BATCH_CONCURRENCY);
        const settled = await Promise.allSettled(
          wave.map((claims) =>
            this.completeWithRetry<AdjudicationEnvelope>(
              requestForAdjudication(ledger, claims, reviewer, stageController.signal),
              adjudicationEnvelopeValidator(claims),
              stageController.signal,
              ADJUDICATION_BATCH_ATTEMPTS,
            )
          ),
        );
        const failure = settled.find(
          (result): result is PromiseRejectedResult => result.status === "rejected",
        );
        if (failure) throw failure.reason;

        settled.forEach((result) => {
          if (result.status === "fulfilled") {
            adjudications.push(...result.value.adjudications);
          }
        });
      }
      return adjudications;
    } catch (error) {
      if (stageTimedOut) {
        throw new DeepWorkExecutionError(
          "semantic_reviewer_timeout",
          true,
          "The bounded adjudication stage exceeded its execution budget.",
          { cause: error },
        );
      }
      throw error;
    } finally {
      clearTimeout(stageTimer);
      signal?.removeEventListener("abort", abortFromCaller);
    }
  }

  private ledgerForPass(
    session: ResearchSession,
    pass: DeepValidationPassKind,
  ): ValidationLedgerV2 {
    if (session.validation !== undefined) {
      if (!isValidationLedgerV2(session.validation)) {
        throw new DeepWorkExecutionError(
          "validation_protocol_out_of_order",
          false,
          "Deep semantic validation cannot resume from a non-canonical validation ledger.",
        );
      }
      return session.validation;
    }
    if (pass !== "claim_source_entailment") {
      throw new DeepWorkExecutionError(
        "validation_protocol_out_of_order",
        false,
        "Deep semantic validation passes must execute in order.",
      );
    }
    // Five claims per specialist keeps the reviewer prompt bounded while
    // guaranteeing all five research dimensions enter the semantic ledger.
    return initializeDeepValidation(session, { maxClaims: 25, maxClaimsPerAgent: 5 });
  }

  private assertRuntimeCapability(): void {
    if (this.options.provider.isMock) {
      throw new DeepWorkExecutionError(
        "mock_reviewer_forbidden",
        false,
        "Deep Research requires a real structured-completion reviewer.",
      );
    }
    if (this.options.retrieval.isMock) {
      throw new DeepWorkExecutionError(
        "mock_retrieval_forbidden",
        false,
        "Deep Research requires a real retrieval provider.",
      );
    }
  }

  private async retrieveIndependentEvidence(
    session: ResearchSession,
    ledger: ValidationLedgerV2,
    signal?: AbortSignal,
  ): Promise<ClaimReviewSource[]> {
    const groups = groupClaimsByAgent(ledger.claims);
    const sources: ClaimReviewSource[] = [];
    for (const [agentId, claims] of groups) {
      throwIfAborted(signal);
      const retrievedSets = await Promise.all(
        claims.map((claim, claimIndex) =>
          this.options.retrieval.search({
            query: buildIndependentQuery(
              session.query,
              session.keywords,
              claim,
              claimIndex,
            ),
            agentId,
            maxResults: 3,
            searchDepth: "advanced",
            minScore: 0.35,
            signal,
          }),
        ),
      );
      throwIfAborted(signal);
      const agentSources = dedupeSources(
        retrievedSets.flatMap((retrieved, claimIndex) => {
          const claim = claims[claimIndex];
          if (!claim) return [];
          return retrieved.map((source) => ({
            ...source,
            id: scopeIndependentSourceId(source.id, claim),
            agent: agentId,
            origin: "independent_retrieval" as const,
            claimIds: [claim.id],
          }));
        }),
      ).slice(0, 15);
      sources.push(...agentSources);
    }

    return dedupeSources(sources);
  }

  private async completeWithRetry<T>(
    request: Omit<Parameters<StructuredCompletionProvider["complete"]>[0], "validate">,
    validate: (value: unknown) => value is T,
    signal?: AbortSignal,
    maxAttempts: number = MAX_REVIEW_ATTEMPTS,
  ): Promise<T> {
    const attempts = Math.max(1, Math.trunc(maxAttempts));
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      throwIfAborted(signal);
      try {
        return await this.options.provider.complete<T>({ ...request, validate });
      } catch (error) {
        const retryable = error instanceof StructuredCompletionError && error.retryable;
        if (!retryable || attempt === attempts) {
          throw toReviewExecutionError(error);
        }
        await this.sleep(250 * attempt, signal);
      }
    }
    throw new DeepWorkExecutionError(
      "semantic_reviewer_exhausted",
      true,
      "The semantic reviewer exhausted its bounded attempts.",
    );
  }
}

function requestForClaimReview(
  ledger: ValidationLedgerV2,
  pass: ClaimReviewPassKind,
  reviewer: ClaimReviewerIdentity,
  signal?: AbortSignal,
) {
  const passOne = pass === "claim_source_entailment";
  const slices = buildClaimEvidenceSlices(ledger, {
    pass,
    maxTotalSources: MAX_PROMPT_SOURCES,
    minSourcesPerClaim: 1,
  });
  const sources = uniqueSourcesFromSlices(slices);
  const task = passOne
    ? [
        "For every claim, determine whether its own cited source snippets entail the full bounded claim.",
        "Do not use outside knowledge. A source ID is usable only when it appears in that claim's sourceIds.",
        "Use verdict: entailed, partially_entailed, not_entailed, or insufficient_evidence.",
      ]
    : [
        "For every claim, compare the original evidence with independently retrieved sources.",
        "Identify corroboration and material conflict; absence of evidence is not corroboration.",
        "A corroborating or contradicting source must have origin independent_retrieval and list that exact claim ID in claimIds.",
        "Never use an original citation or another agent's retrieval as pass-two evidence.",
        "Use verdict: corroborated, contradicted, mixed, or insufficient_evidence.",
      ];
  return {
    schemaName: `deep_${pass}`,
    systemPrompt: [
      "You are a conservative claim-to-evidence reviewer.",
      ...task,
      "Return one finding per claim. Copy claimId and claimValueHash exactly.",
      "Reference only supplied source IDs. Keep rationale concise and do not reveal hidden reasoning.",
      "Output: {\"findings\":[{claimId,claimValueHash,verdict,confidence,supportingSourceIds,contradictingSourceIds,rationale}]}",
    ].join("\n"),
    userPrompt: serializeUntrustedResearchData({
      reviewScope: "claim_evidence_support_not_factual_truth",
      reviewer,
      claims: ledger.claims,
      sources,
      priorFindings: passOne ? [] : ledger.findings,
    }),
    signal,
    timeoutMs: REVIEW_TIMEOUT_MS,
    maxOutputTokens: 8_192,
    maxOutputChars: 90_000,
    temperature: 0,
  } as const;
}

function requestForAdjudication(
  ledger: ValidationLedgerV2,
  claims: readonly ResearchClaim[],
  reviewer: ClaimReviewerIdentity,
  signal?: AbortSignal,
) {
  const claimIds = new Set(claims.map((claim) => claim.id));
  const slices = buildClaimEvidenceSlicesForClaims(ledger, claims, {
    pass: "adjudication",
    maxTotalSources: MAX_PROMPT_SOURCES,
    minSourcesPerClaim: 1,
  });
  assertAllClaimsHaveAtLeastOneSource(slices, "adjudication");
  const sources = uniqueSourcesFromSlices(slices);
  return {
    schemaName: "deep_adjudication",
    systemPrompt: [
      "You are the final conservative adjudicator for a bounded claim-evidence review.",
      "Adjudicate every claim using only the two supplied review passes and allowlisted source IDs.",
      "Use disposition: supported, partially_supported, conflicted, unsupported, or insufficient_evidence.",
      "Decision policy: entailed plus corroborated is supported; one supported pass is partially_supported; contradiction is conflicted; not_entailed without corroboration is unsupported; otherwise evidence is insufficient.",
      "A supported disposition requires at least one supporting source; conflicted requires a contradicting source.",
      "Copy claimId and claimValueHash exactly. Preserve material qualifications in limitations.",
      "Output: {\"adjudications\":[{claimId,claimValueHash,disposition,confidence,supportingSourceIds,contradictingSourceIds,limitations}]}",
    ].join("\n"),
    userPrompt: serializeUntrustedResearchData({
      reviewScope: "claim_evidence_support_not_factual_truth",
      reviewer,
      claims,
      findings: ledger.findings.filter((finding) => claimIds.has(finding.claimId)),
      sourceCatalog: sources.map((source) => ({
        id: source.id,
        title: source.title,
        origin: source.origin,
        claimIds: source.claimIds?.filter((claimId) => claimIds.has(claimId)),
      })),
    }),
    signal,
    timeoutMs: REVIEW_TIMEOUT_MS,
    maxOutputTokens: 4_096,
    maxOutputChars: 30_000,
    temperature: 0,
  } as const;
}

function chunkValues<T>(values: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let offset = 0; offset < values.length; offset += size) {
    chunks.push(values.slice(offset, offset + size));
  }
  return chunks;
}

export interface ClaimEvidenceSlice {
  claim: ResearchClaim;
  sources: ClaimReviewSource[];
}

export interface BuildClaimEvidenceSlicesOptions {
  pass: ClaimReviewPassKind | "adjudication";
  maxTotalSources: number;
  minSourcesPerClaim: number;
  /** Soft per-claim cap before round-robin filler distribution. */
  maxSourcesPerClaim?: number;
}

/**
 * Allocate sources fairly across claims under a hard total ceiling.
 *
 * Guarantees:
 *   - Every claim in `ledger.claims` receives at least `minSourcesPerClaim`
 *     of its own `claim.sourceIds` (Pass 1) or its own `claimIds` binding
 *     (Pass 2 / adjudication) so the prompt can never starve a claim because
 *     it happens to sort late in the global source array.
 *   - The reserved set is itself bounded: no single claim can reserve more
 *     than `maxSourcesPerClaim` entries; this is what makes the global
 *     `maxTotalSources` an honest cap. (Before R2B a claim with 50 sources
 *     would reserve all 50 and bypass the cap entirely.)
 *   - The union of all slices fits inside `maxTotalSources`; the cap is
 *     enforced by trimming BOTH the per-claim reserved set and the
 *     round-robin filler.
 *   - Source ids are unique across the entire prompt payload.
 */
/** @deprecated Kept temporarily for compatibility with serialized test fixtures. */
export function buildClaimEvidenceSlicesLegacy(
  ledger: ValidationLedgerV2,
  options: BuildClaimEvidenceSlicesOptions,
): ClaimEvidenceSlice[] {
  const sourcesById = new Map(ledger.reviewSources.map((source) => [source.id, source]));
  const slices: ClaimEvidenceSlice[] = [];
  const reserved = new Set<string>();
  // R2B: per-claim ceiling applies to the reserved set as well as the
  // filler, so a single heavy claim cannot exhaust the global budget.
  const perClaimCap = options.maxSourcesPerClaim ?? 6;
  const minPerClaim = Math.max(0, options.minSourcesPerClaim);

  // 1) Reserved set per claim — every id in claim.sourceIds first, bounded
  //    by `perClaimCap` and by the remaining global `maxTotalSources` budget.
  for (const claim of ledger.claims) {
    const slice: ClaimEvidenceSlice = { claim, sources: [] };
    for (const id of claim.sourceIds) {
      if (slice.sources.length >= perClaimCap) break;
      if (reserved.size >= options.maxTotalSources) break;
      const source = sourcesById.get(id);
      if (!source) continue;
      if (reserved.has(source.id)) continue;
      reserved.add(source.id);
      slice.sources.push(source);
    }
    slices.push(slice);
  }

  // 2) For Pass 2 (independent_corroboration_conflict) and adjudication, additionally
  //    reserve per-claim independent sources whose claimIds include the claim,
  //    subject to the same per-claim and global caps.
  if (options.pass !== "claim_source_entailment") {
    for (const claim of ledger.claims) {
      const slice = slices.find((entry) => entry.claim.id === claim.id);
      if (!slice) continue;
      for (const source of ledger.reviewSources) {
        if (slice.sources.length >= perClaimCap) break;
        if (reserved.size >= options.maxTotalSources) break;
        if (source.origin !== "independent_retrieval") continue;
        if (!source.claimIds?.includes(claim.id)) continue;
        if (reserved.has(source.id)) continue;
        reserved.add(source.id);
        slice.sources.push(source);
      }
    }
  }

  // R2B: enforce the `minSourcesPerClaim` floor on the reserved set so
  // a claim with zero of its own sources is still guaranteed at least
  // one admissible entry before any filler runs. We pick from the
  // independent_retrieval pool whose `claimIds` includes the claim
  // (so a source that wasn't retrieved for the claim cannot be used
  // to satisfy its floor). If the claim still has zero entries after
  // that pass, we fall back to the legacy round-robin filler below.
  if (minPerClaim > 0) {
    for (const slice of slices) {
      if (slice.sources.length >= minPerClaim) continue;
      for (const source of ledger.reviewSources) {
        if (slice.sources.length >= minPerClaim) break;
        if (slice.sources.length >= perClaimCap) break;
        if (reserved.size >= options.maxTotalSources) break;
        if (source.origin !== "independent_retrieval") continue;
        if (!source.claimIds?.includes(slice.claim.id)) continue;
        if (reserved.has(source.id)) continue;
        reserved.add(source.id);
        slice.sources.push(source);
      }
    }
  }

  // 3) Filler pool — anything not yet reserved, independent_retrieval first.
  const filler = [
    ...ledger.reviewSources.filter((source) => source.origin === "independent_retrieval" && !reserved.has(source.id)),
    ...ledger.reviewSources.filter((source) => source.origin !== "independent_retrieval" && !reserved.has(source.id)),
  ];

  // 4) Distribute filler round-robin across claims (in claim order) up to maxTotalSources.
  let cursor = 0;
  for (const slice of slices) {
    if (reserved.size >= options.maxTotalSources) break;
    while (slice.sources.length < perClaimCap && cursor < filler.length) {
      if (reserved.size >= options.maxTotalSources) break;
      const next = filler[cursor++];
      if (!next) break;
      if (reserved.has(next.id)) continue;
      reserved.add(next.id);
      slice.sources.push(next);
    }
  }

  return slices;
}

/**
 * Build a claim-to-source mapping with a de-duplicated global catalog budget.
 * Minimum evidence is admitted for every claim as one atomic round before
 * filler is distributed. A shared source may therefore appear in multiple
 * slices while counting only once toward `maxTotalSources`.
 */
export function buildClaimEvidenceSlices(
  ledger: ValidationLedgerV2,
  options: BuildClaimEvidenceSlicesOptions,
): ClaimEvidenceSlice[] {
  return buildClaimEvidenceSlicesForClaims(ledger, ledger.claims, options);
}

function buildClaimEvidenceSlicesForClaims(
  ledger: ValidationLedgerV2,
  claims: readonly ResearchClaim[],
  options: BuildClaimEvidenceSlicesOptions,
): ClaimEvidenceSlice[] {
  const sourcesById = new Map(ledger.reviewSources.map((source) => [source.id, source]));
  const perClaimCap = Math.max(0, options.maxSourcesPerClaim ?? 6);
  const minPerClaim = Math.min(perClaimCap, Math.max(0, options.minSourcesPerClaim));
  const maxTotalSources = Math.max(0, options.maxTotalSources);
  const catalogIds = new Set<string>();

  const bindings = claims.map((claim) => {
    const original = claim.sourceIds
      .map((id) => sourcesById.get(id))
      .filter((source): source is ClaimReviewSource => Boolean(source))
      .filter((source) => source.agent === claim.agentId);
    const independent = ledger.reviewSources.filter(
      (source) =>
        source.origin === "independent_retrieval" &&
        source.agent === claim.agentId &&
        source.claimIds?.includes(claim.id),
    );
    const minimumCandidates = options.pass === "independent_corroboration_conflict"
      ? independent
      : options.pass === "claim_source_entailment"
        ? original
        : dedupeReviewSources([...original, ...independent]);
    const allCandidates = options.pass === "claim_source_entailment"
      ? original
      : dedupeReviewSources([...independent, ...original]);
    return {
      slice: { claim, sources: [] } as ClaimEvidenceSlice,
      minimumCandidates,
      allCandidates,
      cursor: 0,
    };
  });

  for (let round = 0; round < minPerClaim; round += 1) {
    const proposed = bindings.map((binding) => {
      const selected = new Set(binding.slice.sources.map((source) => source.id));
      return binding.minimumCandidates.find((source) => !selected.has(source.id));
    });
    const proposedCatalog = new Set([
      ...catalogIds,
      ...proposed.filter((source): source is ClaimReviewSource => Boolean(source)).map((source) => source.id),
    ]);
    if (proposedCatalog.size > maxTotalSources) {
      throw new DeepWorkExecutionError(
        "claim_evidence_budget_exhausted",
        false,
        `The ${maxTotalSources}-source prompt budget cannot admit the required per-claim evidence floor.`,
      );
    }
    proposed.forEach((source, index) => {
      if (!source) return;
      bindings[index].slice.sources.push(source);
      catalogIds.add(source.id);
    });
  }

  let progressed = true;
  while (progressed) {
    progressed = false;
    for (const binding of bindings) {
      if (binding.slice.sources.length >= perClaimCap) continue;
      const selected = new Set(binding.slice.sources.map((source) => source.id));
      while (
        binding.cursor < binding.allCandidates.length &&
        selected.has(binding.allCandidates[binding.cursor].id)
      ) {
        binding.cursor += 1;
      }
      const next = binding.allCandidates[binding.cursor++];
      if (!next) continue;
      if (!catalogIds.has(next.id) && catalogIds.size >= maxTotalSources) continue;
      binding.slice.sources.push(next);
      catalogIds.add(next.id);
      progressed = true;
    }
  }

  return bindings.map((binding) => binding.slice);
}

function dedupeReviewSources(sources: readonly ClaimReviewSource[]): ClaimReviewSource[] {
  const seen = new Set<string>();
  return sources.filter((source) => {
    if (seen.has(source.id)) return false;
    seen.add(source.id);
    return true;
  });
}

export function uniqueSourcesFromSlices(
  slices: readonly ClaimEvidenceSlice[],
): ClaimReviewSource[] {
  return dedupeReviewSources(slices.flatMap((slice) => slice.sources));
}

export function assertAllClaimsHaveAtLeastOneSource(
  slices: ClaimEvidenceSlice[],
  pass: ClaimReviewPassKind | "adjudication",
): void {
  const empty = slices.filter((slice) => slice.sources.length === 0);
  if (empty.length === 0) return;
  const ids = empty.map((slice) => slice.claim.id).join(", ");
  throw new DeepWorkExecutionError(
    "claim_evidence_empty",
    false,
    `Pass ${pass} cannot review ${empty.length} claim(s) with zero sources in the prompt context: ${ids}. ` +
      "Each claim must have at least one allowed source id (own sourceIds for Pass 1, " +
      "or an independent_retrieval source whose claimIds binding includes the claim for Pass 2/adjudication).",
  );
}

function assertIndependentRetrievalCoverage(
  ledger: ValidationLedgerV2,
  requiredAgents: Iterable<ResearchClaim["agentId"]>,
): void {
  const agents = [...new Set(requiredAgents)];
  const requiredAgentSet = new Set<ResearchClaim["agentId"]>(agents);
  const independentSources = ledger.reviewSources.filter(
    (source) =>
      source.origin === "independent_retrieval" &&
      requiredAgentSet.has(source.agent as ResearchClaim["agentId"]),
  );
  const coveredAgents = new Set(independentSources.map((source) => source.agent));
  const missingAgents = agents.filter((agentId) => !coveredAgents.has(agentId));
  const minimumTotal = Math.max(2, agents.length);

  if (missingAgents.length === 0 && independentSources.length >= minimumTotal) return;

  throw new DeepWorkExecutionError(
    "independent_retrieval_insufficient",
    true,
    [
      `Independent retrieval admitted ${independentSources.length} usable unique source(s) for ${coveredAgents.size}/${agents.length} research agent(s).`,
      `Each reviewed agent requires its own source and at least ${minimumTotal} total source(s) are required.`,
      ...(missingAgents.length > 0 ? [`Missing agent coverage: ${missingAgents.join(", ")}.`] : []),
    ].join(" "),
  );
}

function reviewerIdentity(
  provider: StructuredCompletionProvider,
  pass: DeepValidationPassKind,
): ClaimReviewerIdentity {
  return {
    reviewerId:
      pass === "claim_source_entailment"
        ? "deep-entailment-reviewer"
        : pass === "independent_corroboration_conflict"
          ? "deep-corroboration-reviewer"
          : "deep-adjudicator",
    providerId: provider.id,
    model: provider.model,
    promptVersion: `${REVIEW_PROMPT_VERSION}:${pass}`,
  };
}

function overwriteFindingAuthority(
  values: readonly unknown[],
  pass: ClaimReviewPassKind,
  reviewer: ClaimReviewerIdentity,
): unknown[] {
  return values.flatMap((value) =>
    isRecord(value)
      ? [{
          ...value,
          confidence: normalizeReviewerConfidence(value.confidence),
          pass,
          reviewer: { ...reviewer },
        }]
      : [],
  );
}

function overwriteAdjudicationAuthority(
  values: readonly unknown[],
  reviewer: ClaimReviewerIdentity,
): unknown[] {
  return values.flatMap((value) =>
    isRecord(value)
      ? [{
          ...value,
          confidence: normalizeReviewerConfidence(value.confidence),
          reviewer: { ...reviewer },
        }]
      : [],
  );
}

/** Map common numeric model confidence to the ledger's bounded enum. */
function normalizeReviewerConfidence(value: unknown): unknown {
  if (value === "low" || value === "medium" || value === "high") return value;
  if (typeof value !== "number" || !Number.isFinite(value)) return value;
  const normalized = value > 1 && value <= 100 ? value / 100 : value;
  if (normalized < 0 || normalized > 1) return value;
  if (normalized >= 0.8) return "high";
  if (normalized >= 0.5) return "medium";
  return "low";
}

function assertCompleteFindingCoverage(
  ledger: ValidationLedgerV2,
  pass: ClaimReviewPassKind,
): void {
  const reviewed = new Set(
    ledger.findings.filter((finding) => finding.pass === pass).map((finding) => finding.claimId),
  );
  if (reviewed.size !== ledger.claims.length) {
    throw new DeepWorkExecutionError(
      "semantic_review_incomplete",
      true,
      `${pass} reviewed ${reviewed.size}/${ledger.claims.length} bounded claims.`,
    );
  }
}

function assertCompleteAdjudicationCoverage(ledger: ValidationLedgerV2): void {
  if (ledger.adjudications.length !== ledger.claims.length) {
    throw new DeepWorkExecutionError(
      "semantic_adjudication_incomplete",
      true,
      `Adjudication covered ${ledger.adjudications.length}/${ledger.claims.length} bounded claims.`,
    );
  }
}

function groupClaimsByAgent(claims: readonly ResearchClaim[]) {
  const groups = new Map<ResearchClaim["agentId"], ResearchClaim[]>();
  for (const claim of claims) {
    const group = groups.get(claim.agentId) ?? [];
    group.push(claim);
    groups.set(claim.agentId, group);
  }
  return groups;
}

function buildIndependentQuery(
  query: string,
  keywords: readonly string[] | undefined,
  claim: ResearchClaim,
  claimIndex: number,
): string {
  const planned = buildDeepRetrievalQueries(query, claim.agentId, keywords ?? []);
  const topic = planned[claimIndex % Math.max(1, planned.length)] ?? query;
  return truncateSearchText(
    topic + " Claim to check: " + claim.text,
    280,
  );
}

function scopeIndependentSourceId(sourceId: string, claim: ResearchClaim): string {
  const bounded = String(sourceId)
    .replace(/[\u0000-\u001F\u007F]/g, "-")
    .trim()
    .slice(0, 80) || "source";
  return `ind-${claim.agentId}-${claim.id}-${bounded}`.slice(0, 160);
}

function truncateSearchText(value: string, maxChars: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxChars) return normalized;
  const clipped = normalized.slice(0, maxChars);
  const boundary = clipped.lastIndexOf(" ");
  return (boundary >= Math.floor(maxChars * 0.75) ? clipped.slice(0, boundary) : clipped).trim();
}

function dedupeSources<T extends { id: string }>(sources: readonly T[]): T[] {
  const unique = new Map<string, T>();
  for (const source of sources) {
    if (!unique.has(source.id)) unique.set(source.id, source);
  }
  return [...unique.values()];
}

function isReviewEnvelope(value: unknown): value is ReviewEnvelope {
  return isRecord(value) && Array.isArray(value.findings);
}

function isAdjudicationEnvelope(value: unknown): value is AdjudicationEnvelope {
  return isRecord(value) && Array.isArray(value.adjudications);
}

function adjudicationEnvelopeValidator(
  claims: readonly ResearchClaim[],
): (value: unknown) => value is AdjudicationEnvelope {
  const expectedClaims = new Map(claims.map((claim) => [claim.id, claim.valueHash]));
  return (value: unknown): value is AdjudicationEnvelope => {
    if (!isAdjudicationEnvelope(value) || value.adjudications.length !== claims.length) {
      return false;
    }
    const seen = new Set<string>();
    for (const adjudication of value.adjudications) {
      if (!isRecord(adjudication) || typeof adjudication.claimId !== "string") return false;
      if (seen.has(adjudication.claimId)) return false;
      if (expectedClaims.get(adjudication.claimId) !== adjudication.claimValueHash) return false;
      seen.add(adjudication.claimId);
    }
    return seen.size === expectedClaims.size;
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toReviewExecutionError(error: unknown): DeepWorkExecutionError {
  if (error instanceof DeepWorkExecutionError) return error;
  if (error instanceof StructuredCompletionError && error.code === "aborted") {
    return new DeepWorkExecutionError(
      "execution_aborted",
      true,
      "Deep semantic review was interrupted and will be retried.",
      { cause: error },
    );
  }
  if (error instanceof StructuredCompletionError) {
    return new DeepWorkExecutionError(
      `semantic_reviewer_${error.code}`,
      error.retryable,
      "The semantic reviewer could not return a valid bounded result.",
      { cause: error },
    );
  }
  if (error instanceof DOMException && error.name === "AbortError") {
    return new DeepWorkExecutionError(
      "execution_aborted",
      true,
      "Deep semantic review was interrupted and will be retried.",
      { cause: error },
    );
  }
  return new DeepWorkExecutionError(
    "semantic_reviewer_failure",
    true,
    "The semantic reviewer failed unexpectedly.",
    { cause: error },
  );
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  throw new DeepWorkExecutionError(
    "execution_aborted",
    true,
    "Deep semantic review was interrupted and will be retried.",
  );
}

function abortableSleep(milliseconds: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const timer = setTimeout(resolve, milliseconds);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });
}

/** Useful for contract tests and progress summaries. */
export function findingsForPass(
  ledger: ValidationLedgerV2,
  pass: ClaimReviewPassKind,
): ClaimReviewFinding[] {
  return ledger.findings.filter((finding) => finding.pass === pass);
}
