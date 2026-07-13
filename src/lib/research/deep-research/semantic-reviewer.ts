import type { RetrievalProvider, RetrievedSource } from "@/lib/providers/retrieval.types";
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
import type {
  ClaimReviewFinding,
  ClaimReviewPassKind,
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
const MAX_SOURCE_SNIPPET_CHARS = 800;

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
      const response = await this.completeWithRetry<AdjudicationEnvelope>(
        requestForAdjudication(ledger, reviewer, signal),
        isAdjudicationEnvelope,
        signal,
      );
      const controlled = overwriteAdjudicationAuthority(response.adjudications, reviewer);
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

  private ledgerForPass(
    session: ResearchSession,
    pass: DeepValidationPassKind,
  ): ValidationLedgerV2 {
    if (session.validation?.version === 2) return session.validation;
    if (pass !== "claim_source_entailment") {
      throw new DeepWorkExecutionError(
        "validation_protocol_out_of_order",
        false,
        "Deep semantic validation passes must execute in order.",
      );
    }
    return initializeDeepValidation(session, { maxClaims: 24, maxClaimsPerAgent: 6 });
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
  ) {
    const groups = groupClaimsByAgent(ledger.claims);
    const sources: Array<RetrievedSource & { origin: "independent_retrieval" }> = [];
    for (const [agentId, claims] of groups) {
      throwIfAborted(signal);
      const query = buildIndependentQuery(session.query, claims);
      const retrieved = await this.options.retrieval.search({
        query,
        keywords: session.keywords.slice(0, 8),
        agentId,
        maxResults: 6,
        signal,
      });
      throwIfAborted(signal);
      for (const source of retrieved) {
        sources.push({
          ...source,
          id: scopeIndependentSourceId(source.id, agentId),
          agent: agentId,
          origin: "independent_retrieval",
        });
      }
    }

    return dedupeSources(sources);
  }

  private async completeWithRetry<T>(
    request: Omit<Parameters<StructuredCompletionProvider["complete"]>[0], "validate">,
    validate: (value: unknown) => value is T,
    signal?: AbortSignal,
  ): Promise<T> {
    for (let attempt = 1; attempt <= MAX_REVIEW_ATTEMPTS; attempt += 1) {
      throwIfAborted(signal);
      try {
        return await this.options.provider.complete<T>({ ...request, validate });
      } catch (error) {
        const retryable = error instanceof StructuredCompletionError && error.retryable;
        if (!retryable || attempt === MAX_REVIEW_ATTEMPTS) {
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
  const sources = promptSources(ledger, passOne);
  const task = passOne
    ? [
        "For every claim, determine whether its own cited source snippets entail the full bounded claim.",
        "Do not use outside knowledge. A source ID is usable only when it appears in that claim's sourceIds.",
        "Use verdict: entailed, partially_entailed, not_entailed, or insufficient_evidence.",
      ]
    : [
        "For every claim, compare the original evidence with independently retrieved sources.",
        "Identify corroboration and material conflict; absence of evidence is not corroboration.",
        "A corroborating or contradicting source must have origin independent_retrieval and the same agent as the claim.",
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
  reviewer: ClaimReviewerIdentity,
  signal?: AbortSignal,
) {
  return {
    schemaName: "deep_adjudication",
    systemPrompt: [
      "You are the final conservative adjudicator for a bounded claim-evidence review.",
      "Adjudicate every claim using only the two supplied review passes and allowlisted source IDs.",
      "Use disposition: supported, partially_supported, conflicted, unsupported, or insufficient_evidence.",
      "A supported disposition requires at least one supporting source; conflicted requires a contradicting source.",
      "Copy claimId and claimValueHash exactly. Preserve material qualifications in limitations.",
      "Output: {\"adjudications\":[{claimId,claimValueHash,disposition,confidence,supportingSourceIds,contradictingSourceIds,limitations}]}",
    ].join("\n"),
    userPrompt: serializeUntrustedResearchData({
      reviewScope: "claim_evidence_support_not_factual_truth",
      reviewer,
      claims: ledger.claims,
      findings: ledger.findings,
      sourceCatalog: ledger.reviewSources.slice(0, MAX_PROMPT_SOURCES).map((source) => ({
        id: source.id,
        title: source.title,
        origin: source.origin,
      })),
    }),
    signal,
    timeoutMs: REVIEW_TIMEOUT_MS,
    maxOutputTokens: 8_192,
    maxOutputChars: 90_000,
    temperature: 0,
  } as const;
}

function promptSources(ledger: ValidationLedgerV2, claimOwnedOnly: boolean) {
  const allowed = claimOwnedOnly
    ? new Set(ledger.claims.flatMap((claim) => claim.sourceIds))
    : undefined;
  const candidates = ledger.reviewSources.filter(
    (source) => !allowed || allowed.has(source.id),
  );
  const prioritized = claimOwnedOnly
    ? candidates
    : [
        ...candidates.filter((source) => source.origin === "independent_retrieval"),
        ...candidates.filter((source) => source.origin !== "independent_retrieval"),
      ];
  return prioritized
    .slice(0, MAX_PROMPT_SOURCES)
    .map((source) => ({
      id: source.id,
      title: source.title,
      url: source.url,
      snippet: source.snippet.slice(0, MAX_SOURCE_SNIPPET_CHARS),
      accessedAt: source.accessedAt,
      confidence: source.confidence,
      agent: source.agent,
      origin: source.origin,
    }));
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

function buildIndependentQuery(query: string, claims: readonly ResearchClaim[]): string {
  const agentId = claims[0]?.agentId ?? "specialist";
  const claimText = claims
    .slice(0, 3)
    .map((claim) => claim.text)
    .join(" | ");
  return truncateSearchText(
    `Independent evidence for ${agentId}: ${claimText}. Product context: ${query}`,
    280,
  );
}

function scopeIndependentSourceId(sourceId: string, agentId: ResearchClaim["agentId"]): string {
  const bounded = String(sourceId)
    .replace(/[\u0000-\u001F\u007F]/g, "-")
    .trim()
    .slice(0, 120) || "source";
  return `ind-${agentId}-${bounded}`.slice(0, 160);
}

function truncateSearchText(value: string, maxChars: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxChars) return normalized;
  const clipped = normalized.slice(0, maxChars);
  const boundary = clipped.lastIndexOf(" ");
  return (boundary >= Math.floor(maxChars * 0.75) ? clipped.slice(0, boundary) : clipped).trim();
}

function dedupeSources<T extends RetrievedSource>(sources: readonly T[]): T[] {
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toReviewExecutionError(error: unknown): DeepWorkExecutionError {
  if (error instanceof DeepWorkExecutionError) return error;
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
