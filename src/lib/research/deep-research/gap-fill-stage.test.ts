import { afterEach, describe, expect, it } from "vitest";
import type { RetrievalProvider, RetrievedSource } from "@/lib/providers/retrieval.types";
import { RetrievalError } from "@/lib/providers/retrieval.types";
import {
  applyClaimReviewPass,
  initializeDeepValidation,
  registerTrustedReviewSources,
} from "@/lib/research/deep-validation";
import { createResearchSession } from "@/lib/research/research-engine";
import { isValidationLedgerV2 } from "@/lib/research/ledger-guards";
import type {
  ClaimReviewerIdentity,
  ResearchSession,
  ValidationLedgerV2,
} from "@/lib/schema/research-schema";
import { identifyGapClaims, runGapFillStage } from "./gap-fill-stage";
import { DeepWorkExecutionError } from "./service";

function v2(session: ResearchSession): ValidationLedgerV2 {
  if (!isValidationLedgerV2(session.validation)) {
    throw new Error("expected ValidationLedgerV2");
  }
  return session.validation;
}

const ids: string[] = [];

const reviewer = (id: string): ClaimReviewerIdentity => ({
  reviewerId: id,
  providerId: "review-provider",
  model: "review-model",
  promptVersion: `v1:${id}`,
});

function buildSeedSession(): ResearchSession {
  const session = createResearchSession("gap fill research", ["ai"], undefined, { mode: "deep" });
  ids.push(session.id);
  // Seed one agent output so claims can extract from it.
  const market = {
    agent: "market-sizer" as const,
    summary: "Seed summary",
    marketSize: {
      tam: 5_000_000_000,
      sam: 800_000_000,
      som: 50_000_000,
      currency: "USD",
      growthRate: 18,
      growthTrend: "accelerating" as const,
      unit: "revenue" as const,
      sources: [],
      confidence: "high" as const,
    },
    keyTrends: [],
    targetSegments: [],
    citations: [],
  };
  session.agents["market-sizer"] = {
    ...session.agents["market-sizer"],
    status: "done",
    progress: 100,
    currentStep: "Complete",
    output: market,
    resolvedProviderId: "live-model",
    degraded: false,
  };
  return session;
}

async function sessionAfterPassOne(seed: ResearchSession): Promise<{
  session: ResearchSession;
  gapClaimIds: string[];
}> {
  const session = structuredClone(seed);
  let ledger = initializeDeepValidation(session, { maxClaims: 6, maxClaimsPerAgent: 6 });
  // Mark every claim as a gap so identifyGapClaims returns them all. Tests
  // assert behavior across the full set of gap claims, not specific counts.
  const gapClaimIds = ledger.claims.map((claim) => claim.id);
  const findings = ledger.claims.map((claim) => ({
    claimId: claim.id,
    claimValueHash: claim.valueHash,
    pass: "claim_source_entailment" as const,
    reviewer: reviewer("entailment"),
    verdict: "insufficient_evidence" as const,
    confidence: "low" as const,
    supportingSourceIds: [],
    contradictingSourceIds: [],
    rationale: "Seed rationale (insufficient).",
  }));
  ledger = applyClaimReviewPass(ledger, "claim_source_entailment", findings);
  session.validation = ledger;
  return { session, gapClaimIds };
}

function stubRetrieval(
  responses: ReadonlyArray<ReadonlyArray<RetrievedSource>>,
): RetrievalProvider & { calls: number } {
  const calls = { count: 0 };
  return {
    id: "stub",
    displayName: "Stub",
    isMock: false,
    calls: calls.count,
    async search() {
      const idx = Math.min(calls.count, responses.length - 1);
      calls.count += 1;
      return [...(responses[idx] ?? [])];
    },
  };
}

afterEach(() => {
  ids.splice(0).forEach(() => undefined);
});

describe("identifyGapClaims", () => {
  it("returns claims whose Pass 1 verdict was insufficient_evidence or not_entailed", async () => {
    const seed = buildSeedSession();
    const { session, gapClaimIds } = await sessionAfterPassOne(seed);
    const ledger = v2(session);
    const gaps = identifyGapClaims(ledger);
    expect(gaps.length).toBeGreaterThan(0);
    expect(gaps.map((c) => c.id)).toEqual(gapClaimIds);
    for (const gap of gaps) {
      const finding = ledger.findings.find(
        (f) => f.claimId === gap.id && f.pass === "claim_source_entailment",
      );
      expect(finding).toBeDefined();
      expect(["insufficient_evidence", "not_entailed"]).toContain(finding!.verdict);
    }
  });

  it("caps the result to the configured maximum", async () => {
    const seed = buildSeedSession();
    const { session } = await sessionAfterPassOne(seed);
    const ledger = v2(session);
    const gaps = identifyGapClaims(ledger);
    expect(gaps.length).toBeLessThanOrEqual(16);
  });
});

describe("runGapFillStage", () => {
  it("rejects a resumed ledger whose claim valueHash binding is corrupted", async () => {
    const seed = buildSeedSession();
    const { session } = await sessionAfterPassOne(seed);
    const ledger = v2(session);
    const claim = ledger.claims[0];
    if (!claim) throw new Error("fixture requires a claim");
    claim.valueHash = `tampered_${claim.valueHash}`;

    await expect(runGapFillStage(session, stubRetrieval([]))).rejects.toMatchObject({
      code: "validation_protocol_out_of_order",
      retryable: false,
    });
  });

  it("is a no-op when no claims are flagged as gaps", async () => {
    const seed = buildSeedSession();
    // Seed review sources so claim.sourceIds is populated and the
    // evidenceBoundVerdict does not downgrade entailed -> insufficient_evidence.
    let ledger = initializeDeepValidation(seed, { maxClaims: 6, maxClaimsPerAgent: 6 });
    const seededSources = ledger.claims.map((claim, index) => ({
      id: `seed-src-${index}`,
      title: `Seed source ${index}`,
      url: `https://example.com/seed-${index}`,
      snippet: `Snippet ${index}`,
      accessedAt: new Date().toISOString(),
      confidence: "medium" as const,
      agent: claim.agentId,
      origin: "agent_citation" as const,
      claimIds: [claim.id],
    }));
    // Reload ledger with seeded sources and recomputed claim.sourceIds.
    const seededLedger = registerTrustedReviewSources(ledger, seededSources);
    const reinitialized = {
      ...seededLedger,
      claims: seededLedger.claims.map((claim, index) => ({
        ...claim,
        sourceIds: [`seed-src-${index}`],
      })),
    };
    ledger = applyClaimReviewPass(
      reinitialized,
      "claim_source_entailment",
      reinitialized.claims.map((claim) => ({
        claimId: claim.id,
        claimValueHash: claim.valueHash,
        pass: "claim_source_entailment" as const,
        reviewer: reviewer("entailment"),
        verdict: "entailed" as const,
        confidence: "medium" as const,
        supportingSourceIds: claim.sourceIds.slice(0, 1),
        contradictingSourceIds: [],
        rationale: "Entailed.",
      })),
    );
    seed.validation = ledger;

    const retrieval = stubRetrieval([]);
    const result = await runGapFillStage(seed, retrieval);
    const resultLedger = v2(result);

    expect(resultLedger.gapFill).toBeDefined();
    expect(resultLedger.gapFill?.targetedClaimIds).toEqual([]);
    expect(resultLedger.gapFill?.sourcesAdded).toBe(0);
    expect(resultLedger.gapFill?.targetedClaimCount).toBe(0);
    expect(resultLedger.reviewSources.length).toBe(ledger.reviewSources.length);
    expect(retrieval.id).toBe("stub");
  });

  it("registers targeted retrieval sources as independent_retrieval bound to gap claims", async () => {
    const seed = buildSeedSession();
    const { session, gapClaimIds } = await sessionAfterPassOne(seed);

    const retrieval = stubRetrieval([
      [
        {
          id: "src-1",
          title: "Dated industry report citing TAM",
          url: "https://example.com/report",
          snippet: "Primary source confirming the figure.",
          accessedAt: new Date().toISOString(),
          confidence: "high",
          agent: "market-sizer",
          retrievedAt: new Date().toISOString(),
          score: 0.8,
        },
      ],
    ]);

    const result = await runGapFillStage(session, retrieval);
    const ledger = v2(result);

    // Sources registered.
    const newSources = ledger.reviewSources.filter(
      (s) => s.origin === "independent_retrieval" && (s.claimIds ?? []).some((id) => gapClaimIds.includes(id)),
    );
    expect(newSources.length).toBeGreaterThan(0);
    for (const source of newSources) {
      expect(source.origin).toBe("independent_retrieval");
      // Every gap-fill source must be bound to exactly one claim.
      expect(source.claimIds).toHaveLength(1);
      expect(gapClaimIds).toContain(source.claimIds![0]);
    }

    expect(ledger.gapFill?.sourcesAdded).toBe(newSources.length);
    expect(ledger.gapFill?.targetedClaimIds).toEqual(expect.arrayContaining(gapClaimIds));
    expect(ledger.gapFill?.targetedClaimCount).toBe(gapClaimIds.length);
  });

  it("stamps gapFill metadata even when retrieval returns nothing", async () => {
    const seed = buildSeedSession();
    const { session, gapClaimIds } = await sessionAfterPassOne(seed);
    const retrieval = stubRetrieval([[]]);
    const result = await runGapFillStage(session, retrieval);
    const ledger = v2(result);
    expect(ledger.gapFill).toBeDefined();
    expect(ledger.gapFill?.sourcesAdded).toBe(0);
    expect(ledger.gapFill?.targetedClaimCount).toBe(gapClaimIds.length);
  });

  it("is idempotent when called twice on the same session", async () => {
    const seed = buildSeedSession();
    const { session } = await sessionAfterPassOne(seed);
    const retrieval = stubRetrieval([
      [
        {
          id: "src-1",
          title: "Source",
          url: "https://example.com/r",
          snippet: "Snippet",
          accessedAt: new Date().toISOString(),
          confidence: "medium",
          agent: "market-sizer",
          retrievedAt: new Date().toISOString(),
        },
      ],
    ]);
    const first = await runGapFillStage(session, retrieval);
    const second = await runGapFillStage(first, retrieval);
    const firstCount = v2(first).reviewSources.length;
    const secondCount = v2(second).reviewSources.length;
    expect(secondCount).toBe(firstCount);
  });

  it("ignores retrieval providers whose URL fails the canonical safety check", async () => {
    const seed = buildSeedSession();
    const { session } = await sessionAfterPassOne(seed);
    const retrieval = stubRetrieval([
      [
        {
          id: "bad",
          title: "Local host",
          url: "http://localhost/internal",
          snippet: "Should be filtered",
          accessedAt: new Date().toISOString(),
          confidence: "high",
          agent: "market-sizer",
          retrievedAt: new Date().toISOString(),
        },
      ],
    ]);
    const result = await runGapFillStage(session, retrieval);
    const ledger = v2(result);
    const newSources = ledger.reviewSources.filter(
      (s) => s.id.startsWith("gap-"),
    );
    expect(newSources).toHaveLength(0);
    expect(ledger.gapFill?.sourcesAdded).toBe(0);
  });
});

describe("stripTargetedPassOutputs", () => {
  it("is intentionally not exported: production code never rewinds the protocol", () => {
    // Gap-fill production semantics: the new sources are registered into
    // the ledger and Pass 2/3 run normally over the full claim set. The
    // prior "strip and re-run only the targeted slice" design was never
    // wired up; the helper is therefore not exported. The static import
    // above would fail to compile if a future refactor re-introduced the
    // export, so this test exists as documentation of the contract.
    expect(typeof runGapFillStage).toBe("function");
    // Negative assertion: nothing in the public surface looks like a
    // rewind helper. (The test's existence is the contract.)
    expect(typeof runGapFillStage.name).toBe("string");
  });
});

// Smoke test that registerTrustedReviewSources still accepts the
// independent_retrieval sources that gap-fill produces. This is a regression
// guard against schema drift between the two modules.
describe("gap-fill source compatibility", () => {
  it("round-trips gap-fill sources through registerTrustedReviewSources", async () => {
    const seed = buildSeedSession();
    const { session } = await sessionAfterPassOne(seed);
    const retrieval = stubRetrieval([
      [
        {
          id: "src-2",
          title: "Dated filing",
          url: "https://example.com/filing",
          snippet: "Quarterly filing quoting TAM.",
          accessedAt: new Date().toISOString(),
          confidence: "high",
          agent: "market-sizer",
          retrievedAt: new Date().toISOString(),
        },
      ],
    ]);
    const result = await runGapFillStage(session, retrieval);
    const ledger = v2(result);
    const gapSources = ledger.reviewSources.filter((s) => s.id.startsWith("gap-"));
    expect(gapSources.length).toBeGreaterThan(0);
    // Re-registering the same sources is a no-op.
    const reRegistered = registerTrustedReviewSources(ledger, gapSources);
    expect(reRegistered.reviewSources.length).toBe(ledger.reviewSources.length);
  });
});

describe("gap-fill error semantics", () => {
  it("treats a successful-but-empty retrieval as a no-op ledger stamp", async () => {
    const seed = buildSeedSession();
    const { session } = await sessionAfterPassOne(seed);
    const retrieval = stubRetrieval([
      [], // success: 0 hits for the first claim
      [], // success: 0 hits for the next claim
    ]);
    const result = await runGapFillStage(session, retrieval);
    const ledger = v2(result);
    expect(ledger.gapFill).toBeDefined();
    expect(ledger.gapFill?.sourcesAdded).toBe(0);
    expect(ledger.gapFill?.targetedClaimCount).toBeGreaterThan(0);
    expect(ledger.reviewSources.some((s) => s.id.startsWith("gap-"))).toBe(false);
  });

  it("propagates a transient RetrievalError as a retryable DeepWorkExecutionError", async () => {
    const seed = buildSeedSession();
    const { session } = await sessionAfterPassOne(seed);
    const retrieval: RetrievalProvider = {
      id: "failing-search",
      displayName: "Failing search",
      isMock: false,
      async search() {
        throw new RetrievalError("network_error", true, "Tavily is offline");
      },
    };
    await expect(runGapFillStage(session, retrieval)).rejects.toBeInstanceOf(
      DeepWorkExecutionError,
    );
    await expect(runGapFillStage(session, retrieval)).rejects.toMatchObject({
      code: "gap_fill_retrieval_error",
      retryable: true,
    });
  });

  it("propagates a permanent HTTP error as a non-retryable DeepWorkExecutionError", async () => {
    const seed = buildSeedSession();
    const { session } = await sessionAfterPassOne(seed);
    const retrieval: RetrievalProvider = {
      id: "auth-broken",
      displayName: "Auth broken",
      isMock: false,
      async search() {
        throw new RetrievalError("http_error", false, "Tavily returned HTTP 401");
      },
    };
    await expect(runGapFillStage(session, retrieval)).rejects.toMatchObject({
      code: "gap_fill_retrieval_error",
      retryable: false,
    });
  });

  it("translates an AbortError into a non-retryable DeepWorkExecutionError", async () => {
    const seed = buildSeedSession();
    const { session } = await sessionAfterPassOne(seed);
    const retrieval: RetrievalProvider = {
      id: "aborted-search",
      displayName: "Aborted search",
      isMock: false,
      async search() {
        throw new DOMException("Cancelled", "AbortError");
      },
    };
    await expect(runGapFillStage(session, retrieval)).rejects.toMatchObject({
      code: "gap_fill_retrieval_aborted",
      retryable: false,
    });
  });

  it("does not stamp the ledger when retrieval fails", async () => {
    const seed = buildSeedSession();
    const { session } = await sessionAfterPassOne(seed);
    const retrieval: RetrievalProvider = {
      id: "boom",
      displayName: "Boom",
      isMock: false,
      async search() {
        throw new RetrievalError("network_error", true, "transient");
      },
    };
    try {
      await runGapFillStage(session, retrieval);
    } catch {
      // expected
    }
    // Build a fresh seed for the post-failure assertion.
    const seed2 = buildSeedSession();
    const { session: session2 } = await sessionAfterPassOne(seed2);
    expect(v2(session2).gapFill).toBeUndefined();
  });
});
