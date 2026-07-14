// gap-fill-stage — runs between Pass 1 and Pass 2 of the Deep validation
// pipeline. The reviewer found claims whose own cited sources did not entail
// them (verdict: not_entailed or insufficient_evidence). Instead of letting
// those claims die and propagate as `unsupported` / `conflicted`, this stage
// issues a *single* targeted retrieval per such claim, bound exclusively to
// that claim (origin: independent_retrieval, claimIds: [claim.id]), and
// returns an updated ledger + the targetedClaimIds so Pass 1/2/3 can rerun
// only for that slice.
//
// Why this is a separate stage instead of more queries inside Pass 2:
//   - Pass 2 currently runs ONE query per claim against independent sources.
//     We want one additional query phrased specifically for "find me a
//     primary source that states this bounded figure" -- different intent,
//     different phrasing, different result distribution.
//   - Running it as a separate work unit keeps the durable execution model
//     honest: each unit is observable, retryable, and visible in the UI.
//   - It is also a no-op when no claims failed Pass 1 (the most common case
//     after the recent improvements), so well-prepared runs pay zero cost.

import type { RetrievalProvider, RetrievedSource } from "@/lib/providers/retrieval.types";
import {
  canonicalizeSafeExternalUrl,
} from "@/lib/security/safe-external-url";
import { buildGapFillQuery } from "@/lib/research/evidence-ledger";
import { registerTrustedReviewSources } from "@/lib/research/deep-validation";
import type {
  AgentId,
  ClaimReviewSource,
  ResearchClaim,
  ResearchSession,
  ValidationLedgerV2,
} from "@/lib/schema/research-schema";
import { DeepWorkExecutionError } from "./service";

const GAP_FILL_TIMEOUT_MS = 60_000;
const GAP_FILL_RESULTS_PER_CLAIM = 3;
const GAP_FILL_MIN_SCORE = 0.3;
const GAP_FILL_MAX_CLAIMS = 16; // hard ceiling to bound the stage's latency

export interface RunGapFillOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface GapFillOutcome {
  /** Whether the stage added new trusted sources to the ledger. */
  executed: boolean;
  /** Claims that received new sources and whose evidence will be re-reviewed. */
  targetedClaimIds: readonly string[];
  /** Count of new sources registered into the ledger (origin=independent_retrieval). */
  sourcesAdded: number;
  /** Total gap-eligible claims identified at Pass 1 review time. */
  targetedClaimCount: number;
}

/**
 * Inspect Pass 1 findings and identify "gap" claims whose own cited sources
 * did not entail the bounded claim. Pure: no I/O, just ledger inspection.
 */
export function identifyGapClaims(ledger: ValidationLedgerV2): ResearchClaim[] {
  const passOneByClaim = new Map<string, { verdict: string }>();
  for (const finding of ledger.findings) {
    if (finding.pass !== "claim_source_entailment") continue;
    passOneByClaim.set(finding.claimId, { verdict: finding.verdict });
  }
  const gaps: ResearchClaim[] = [];
  for (const claim of ledger.claims) {
    const f = passOneByClaim.get(claim.id);
    if (!f) continue;
    if (f.verdict === "not_entailed" || f.verdict === "insufficient_evidence") {
      gaps.push(claim);
    }
  }
  return gaps.slice(0, GAP_FILL_MAX_CLAIMS);
}

/**
 * Run the targeted gap-fill pass:
 *  1. identify gap claims from Pass 1 findings
 *  2. issue a single targeted retrieval per claim
 *  3. register the new sources as independent_retrieval bound to the claim
 *  4. stamp the ledger with gapFill metadata so the executor can rerun Pass 1/2/3
 *     only for the targeted slice.
 *
 * Idempotent: if the stage has already executed for this session (gapFill
 * field present), the existing ledger is returned untouched.
 */
export async function runGapFillStage(
  sourceSession: ResearchSession,
  retrieval: RetrievalProvider,
  options: RunGapFillOptions = {},
): Promise<ResearchSession> {
  if (retrieval.isMock) {
    throw new DeepWorkExecutionError(
      "mock_retrieval_forbidden",
      false,
      "Gap-fill requires a real retrieval provider.",
    );
  }
  const session = structuredClone(sourceSession);
  const ledger = requirePassOneCompleted(session.validation);
  if (ledger.gapFill) {
    return session;
  }
  const gapClaims = identifyGapClaims(ledger);
  if (gapClaims.length === 0) {
    // Still stamp the ledger so the executor knows the stage ran (no-op).
    const next = stampNoOp(session, ledger);
    return next;
  }

  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(new DOMException("Gap-fill deadline reached", "AbortError")),
    clampTimeout(options.timeoutMs ?? GAP_FILL_TIMEOUT_MS),
  );
  const signal = options.signal
    ? AbortSignal.any([options.signal, controller.signal])
    : controller.signal;

  let newSources: ClaimReviewSource[] = [];
  try {
    newSources = await retrieveGapSources(gapClaims, session.query, retrieval, signal);
  } finally {
    clearTimeout(timer);
  }

  if (newSources.length === 0) {
    const next = stampNoOp(session, ledger, gapClaims.length);
    return next;
  }

  const nextLedger = registerTrustedReviewSources(ledger, newSources);
  const stamped = stampGapFill(nextLedger, gapClaims, newSources.length);
  session.validation = stamped;
  session.updatedAt = new Date().toISOString();
  return session;
}

function clampTimeout(ms: number): number {
  if (!Number.isFinite(ms) || ms <= 0) return GAP_FILL_TIMEOUT_MS;
  return Math.min(ms, GAP_FILL_TIMEOUT_MS);
}

function requirePassOneCompleted(
  validation: ResearchSession["validation"],
): ValidationLedgerV2 {
  if (!validation || validation.version !== 2) {
    throw new DeepWorkExecutionError(
      "validation_protocol_out_of_order",
      false,
      "Gap-fill requires a completed Deep semantic_pass_1.",
    );
  }
  const completed = validation.protocol.completedPassKinds;
  if (!completed.includes("claim_source_entailment")) {
    throw new DeepWorkExecutionError(
      "validation_protocol_out_of_order",
      false,
      "Gap-fill must run after semantic_pass_1 completes.",
    );
  }
  return validation;
}

function stampNoOp(
  session: ResearchSession,
  ledger: ValidationLedgerV2,
  targetedClaimCount = 0,
): ResearchSession {
  const next = structuredClone(session);
  next.validation = {
    ...ledger,
    gapFill: {
      completedAt: new Date().toISOString(),
      targetedClaimIds: [],
      sourcesAdded: 0,
      targetedClaimCount,
    },
  };
  next.updatedAt = new Date().toISOString();
  return next;
}

function stampGapFill(
  ledger: ValidationLedgerV2,
  gapClaims: readonly ResearchClaim[],
  sourcesAdded: number,
): ValidationLedgerV2 {
  return {
    ...ledger,
    gapFill: {
      completedAt: new Date().toISOString(),
      targetedClaimIds: gapClaims.map((claim) => claim.id),
      sourcesAdded,
      targetedClaimCount: gapClaims.length,
    },
  };
}

async function retrieveGapSources(
  gapClaims: readonly ResearchClaim[],
  query: string,
  retrieval: RetrievalProvider,
  signal: AbortSignal,
): Promise<ClaimReviewSource[]> {
  const byAgent = groupByAgent(gapClaims);
  const allSources: ClaimReviewSource[] = [];
  for (const [agentId, claims] of byAgent) {
    if (signal.aborted) break;
    const retrievedSets = await Promise.all(
      claims.map((claim) =>
        retrieval.search({
          query: buildGapFillQuery(query, agentId, claim.text),
          agentId,
          maxResults: GAP_FILL_RESULTS_PER_CLAIM,
          searchDepth: "advanced",
          minScore: GAP_FILL_MIN_SCORE,
          signal,
        }).catch(() => [] as RetrievedSource[]),
      ),
    );
    for (let claimIndex = 0; claimIndex < claims.length; claimIndex += 1) {
      const claim = claims[claimIndex];
      const sources = retrievedSets[claimIndex] ?? [];
      for (const source of sources) {
        const claimReviewSource = toClaimReviewSource(source, agentId, claim);
        if (claimReviewSource) allSources.push(claimReviewSource);
      }
    }
  }
  return dedupeSources(allSources);
}

function groupByAgent(
  claims: readonly ResearchClaim[],
): Map<Exclude<AgentId, "synthesis">, ResearchClaim[]> {
  const groups = new Map<Exclude<AgentId, "synthesis">, ResearchClaim[]>();
  for (const claim of claims) {
    const list = groups.get(claim.agentId) ?? [];
    list.push(claim);
    groups.set(claim.agentId, list);
  }
  return groups;
}

function toClaimReviewSource(
  source: RetrievedSource,
  agentId: AgentId,
  claim: ResearchClaim,
): ClaimReviewSource | null {
  const canonicalUrl = canonicalizeSafeExternalUrl(source.url);
  if (!canonicalUrl) return null;
  const title = (source.title ?? "").trim().slice(0, 512) || canonicalUrl;
  const snippet = (source.snippet ?? "").trim().slice(0, 2000);
  const confidence = source.confidence;
  if (confidence !== "low" && confidence !== "medium" && confidence !== "high") {
    return null;
  }
  const baseId = String(source.id ?? canonicalUrl)
    .replace(/[\u0000-\u001F\u007F]/g, "-")
    .trim()
    .slice(0, 80) || "source";
  return {
    id: `gap-${agentId}-${claim.id}-${baseId}`.slice(0, 160),
    title,
    url: canonicalUrl,
    snippet,
    accessedAt: source.accessedAt,
    confidence,
    agent: agentId,
    origin: "independent_retrieval",
    claimIds: [claim.id],
  };
}

function dedupeSources<T extends { id: string }>(sources: readonly T[]): T[] {
  const unique = new Map<string, T>();
  for (const source of sources) {
    if (!unique.has(source.id)) unique.set(source.id, source);
  }
  return [...unique.values()];
}

/**
 * Strip findings and adjudications for the targeted claim IDs so the
 * downstream Pass 1/2/3 rerun can produce fresh entries. Other claims'
 * findings/adjudications are preserved. Returns the updated ledger so the
 * caller can pass it back into the executor.
 *
 * This is exported so the executor / semantic reviewer can rewind the
 * protocol exactly once: after gap-fill sources are registered, the
 * targeted slice needs a clean slate.
 */
export function stripTargetedPassOutputs(
  ledger: ValidationLedgerV2,
  targetedClaimIds: readonly string[],
): ValidationLedgerV2 {
  if (targetedClaimIds.length === 0) return ledger;
  const targeted = new Set(targetedClaimIds);
  return {
    ...ledger,
    findings: ledger.findings.filter((finding) => !targeted.has(finding.claimId)),
    adjudications: ledger.adjudications.filter(
      (adjudication) => !targeted.has(adjudication.claimId),
    ),
  };
}
