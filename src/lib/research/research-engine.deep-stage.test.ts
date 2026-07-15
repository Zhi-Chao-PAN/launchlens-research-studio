// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentId, AgentOutput } from "@/lib/schema/research-schema";
import type {
  ProviderContext,
  ResearchProvider,
} from "@/lib/providers/provider.types";
import type {
  RetrievalProvider,
  RetrievalQuery,
  RetrievedSource,
} from "@/lib/providers/retrieval.types";
import { RetrievalError } from "@/lib/providers/retrieval.types";

const mocks = vi.hoisted(() => ({
  provider: undefined as ResearchProvider | undefined,
  retrieval: undefined as RetrievalProvider | undefined,
  generate: vi.fn<
    (agentId: AgentId, context: ProviderContext) => Promise<AgentOutput>
  >(),
  search: vi.fn<(query: RetrievalQuery) => Promise<RetrievedSource[]>>(),
  providerSequence: 0,
}));

vi.mock("@/lib/providers/provider-registry", () => ({
  selectProvider: () => mocks.provider,
}));

vi.mock("@/lib/providers/retrieval-registry", () => ({
  selectRetrievalProvider: () => mocks.retrieval,
}));

import { generateMockAgentOutput } from "@/lib/providers/mock-provider";
import { clearBreakers } from "@/lib/utils/circuit-breaker";
import {
  cancelSession,
  createResearchSession,
  deleteSession,
  getResearchSession,
  listSessions,
  runResearchAgentStage,
  subscribeToSession,
} from "./research-engine";

const AGENT_ID = "market-sizer" as const;

function source(index: number, hostname = "evidence.example"): RetrievedSource {
  const now = "2026-07-13T10:00:00.000Z";
  return {
    id: `raw-source-${index}`,
    title: `Independent source ${index}`,
    url: `https://${hostname}/source-${index}`,
    snippet: `Evidence excerpt ${index}`,
    accessedAt: now,
    retrievedAt: now,
    confidence: "high",
    agent: AGENT_ID,
    score: 0.9,
  };
}

function realProvider(): ResearchProvider {
  mocks.providerSequence += 1;
  return {
    id: `deep-stage-test-${mocks.providerSequence}`,
    displayName: "Deep Stage Test (test-model)",
    isMock: false,
    supportsStreaming: false,
    generate: mocks.generate,
  };
}

function realRetrieval(): RetrievalProvider {
  return {
    id: "deep-stage-search",
    displayName: "Deep Stage Search",
    isMock: false,
    search: mocks.search,
  };
}

function mockRetrieval(): RetrievalProvider {
  return {
    id: "mock-retrieval",
    displayName: "Mock Retrieval",
    isMock: true,
    search: mocks.search,
  };
}

function groundedOutput(agentId: AgentId, context: ProviderContext): AgentOutput {
  const output = generateMockAgentOutput(
    agentId,
    context.query,
    context.keywords,
    context.upstream,
  );
  output.citations = (context.retrievedSources ?? []).map((item) => ({ ...item }));
  return output;
}

describe("runResearchAgentStage", () => {
  beforeEach(() => {
    vi.useRealTimers();
    clearBreakers();
    mocks.generate.mockReset();
    mocks.search.mockReset();
    mocks.provider = realProvider();
    mocks.retrieval = realRetrieval();
    mocks.search.mockResolvedValue([source(1), source(2)]);
    mocks.generate.mockImplementation(async (agentId, context) =>
      groundedOutput(agentId, context),
    );
  });

  afterEach(() => {
    for (const sessionId of listSessions()) deleteSession(sessionId);
  });

  it("preserves compatible fallback behavior when strict mode is disabled", async () => {
    mocks.generate.mockImplementation(async (agentId, context) => {
      context.onFallback?.("network_error", { message: "test fallback" });
      return generateMockAgentOutput(
        agentId,
        context.query,
        context.keywords,
        context.upstream,
      );
    });
    const session = createResearchSession("standard-compatible stage", ["fallback"]);

    await expect(
      runResearchAgentStage(session.id, AGENT_ID, {
        strict: false,
        stepDelayMs: 0,
      }),
    ).resolves.toBeDefined();

    expect(getResearchSession(session.id)?.agents[AGENT_ID]).toMatchObject({
      status: "done",
      degraded: true,
      degradedReason: "network_error",
    });
    expect(getResearchSession(session.id)?.evidence?.agents[AGENT_ID]).toMatchObject({
      allowlist: { policy: "compatible" },
      grounding: "ungrounded",
    });
  });

  it("runs a fenced snapshot without sharing or projecting mutable session state", async () => {
    const session = createResearchSession("isolated deep stage", ["fencing"]);
    const inputSnapshot = structuredClone(session);
    const listener = vi.fn();
    const unsubscribe = subscribeToSession(session.id, listener);

    const result = await runResearchAgentStage(session.id, AGENT_ID, {
      sessionSnapshot: inputSnapshot,
      stepDelayMs: 0,
    });
    unsubscribe();

    expect(result.output.agent).toBe(AGENT_ID);
    expect(result.session.agents[AGENT_ID]).toMatchObject({
      status: "done",
      output: expect.objectContaining({ agent: AGENT_ID }),
    });
    expect(inputSnapshot.agents[AGENT_ID].status).toBe("idle");
    expect(getResearchSession(session.id)?.agents[AGENT_ID].status).toBe("idle");
    expect(listener).not.toHaveBeenCalled();
  });

  it("fails closed before generation when the selected model provider is mock", async () => {
    mocks.provider = {
      id: "mock",
      displayName: "Mock",
      isMock: true,
      supportsStreaming: false,
      generate: mocks.generate,
    };
    const session = createResearchSession("strict mock rejection", []);

    await expect(
      runResearchAgentStage(session.id, AGENT_ID, { stepDelayMs: 0 }),
    ).rejects.toMatchObject({ code: "model_provider_unavailable" });
    expect(mocks.generate).not.toHaveBeenCalled();
    expect(getResearchSession(session.id)?.agents[AGENT_ID].output).toBeUndefined();
  });

  it("rejects a real-provider fallback without committing mock output", async () => {
    mocks.generate.mockImplementation(async (agentId, context) => {
      context.onFallback?.("network_error", { message: "upstream unavailable" });
      return generateMockAgentOutput(agentId, context.query, context.keywords);
    });
    const session = createResearchSession("strict fallback rejection", []);

    await expect(
      runResearchAgentStage(session.id, AGENT_ID, { stepDelayMs: 0 }),
    ).rejects.toMatchObject({ code: "provider_degraded" });
    expect(getResearchSession(session.id)?.agents[AGENT_ID].status).toBe("error");
    expect(getResearchSession(session.id)?.agents[AGENT_ID].output).toBeUndefined();
  });

  it("rejects an unexpected provider failure without generating fallback output", async () => {
    mocks.generate.mockRejectedValue(new Error("upstream request failed"));
    const session = createResearchSession("strict provider failure", []);

    await expect(
      runResearchAgentStage(session.id, AGENT_ID, { stepDelayMs: 0 }),
    ).rejects.toMatchObject({ code: "provider_degraded" });
    expect(getResearchSession(session.id)?.agents[AGENT_ID].output).toBeUndefined();
  });

  it("requires a real retrieval provider", async () => {
    mocks.retrieval = mockRetrieval();
    const session = createResearchSession("strict retrieval provider", []);

    await expect(
      runResearchAgentStage(session.id, AGENT_ID, { stepDelayMs: 0 }),
    ).rejects.toMatchObject({
      code: "retrieval_unavailable",
      message: expect.stringContaining("not_configured"),
      retryable: false,
    });
    expect(mocks.search).not.toHaveBeenCalled();
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it.each([
    { label: "permanent", retryable: false },
    { label: "transient", retryable: true },
  ])("preserves a typed $label retrieval retry decision", async ({ retryable }) => {
    mocks.search.mockRejectedValue(
      new RetrievalError("http_error", retryable, "safe test retrieval failure"),
    );
    const session = createResearchSession(
      "typed retrieval failure",
      [],
      undefined,
      { mode: "deep" },
    );

    await expect(
      runResearchAgentStage(session.id, AGENT_ID, { stepDelayMs: 0 }),
    ).rejects.toMatchObject({
      code: "retrieval_unavailable",
      message: expect.stringContaining("http_error"),
      retryable,
    });
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it.each([
    { label: "empty", sources: [] },
    { label: "single-source", sources: [source(1)] },
  ])("rejects $label retrieval as insufficient", async ({ sources }) => {
    mocks.search.mockResolvedValue(sources);
    const session = createResearchSession("strict retrieval depth", []);

    await expect(
      runResearchAgentStage(session.id, AGENT_ID, { stepDelayMs: 0 }),
    ).rejects.toMatchObject({ code: "retrieval_insufficient" });
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it("stops bounded diversity rescue once the Deep evidence contract is met", async () => {
    mocks.search.mockImplementation(async (query) => {
      if (query.excludeDomains?.includes("dominant.example")) {
        return [
          source(2, "independent-a.example"),
          source(3, "independent-b.example"),
        ];
      }
      return [source(1, "dominant.example")];
    });
    const session = createResearchSession(
      "Deep market evidence for a bilingual APAC research workspace",
      [],
      undefined,
      { mode: "deep" },
    );

    const result = await runResearchAgentStage(session.id, AGENT_ID, {
      minimumRetrievedSources: 3,
      stepDelayMs: 0,
    });

    expect(mocks.search).toHaveBeenCalledTimes(4);
    const rescueCalls = mocks.search.mock.calls.slice(3).map(([query]) => query);
    expect(rescueCalls).toHaveLength(1);
    expect(rescueCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          excludeDomains: ["dominant.example"],
          maxResults: 8,
          minScore: 0.35,
          searchDepth: "advanced",
        }),
      ]),
    );
    expect(result.session.evidence?.agents[AGENT_ID]).toMatchObject({
      retrieval: {
        status: "retrieved",
        sourceCount: 3,
        focusedQueries: expect.arrayContaining([
          expect.stringContaining("Independent evidence"),
        ]),
      },
      grounding: "grounded",
    });
    expect(result.session.evidence?.agents[AGENT_ID]?.retrieval.focusedQueries).toHaveLength(4);
    expect(mocks.generate).toHaveBeenCalledTimes(1);
  });

  it("uses short category-first pricing queries shaped like the production request", async () => {
    const pricingAgent = "pricing-scout" as const;
    mocks.search.mockImplementation(async (retrievalQuery) => {
      expect(retrievalQuery.query.length).toBeLessThanOrEqual(200);
      expect(retrievalQuery.query).toMatch(
        /^bilingual AI research workspace serving APAC SaaS founders/,
      );
      if (retrievalQuery.query.includes("Official pricing")) {
        return [source(1, "official-pricing.example")];
      }
      if (retrievalQuery.query.includes("SaaS price benchmarks")) {
        return [source(2, "benchmark.example")];
      }
      return [source(3, "reviews.example")];
    });
    const session = createResearchSession(
      "Evaluate the market opportunity for a bilingual AI research workspace serving APAC SaaS founders, with emphasis on validated willingness to pay, incumbent gaps, operational risks, and a realistic 90-day go-to-market plan.",
      ["AI market research", "APAC SaaS", "bilingual founders", "willingness to pay"],
      undefined,
      { mode: "deep" },
    );

    const result = await runResearchAgentStage(session.id, pricingAgent, {
      minimumRetrievedSources: 3,
      stepDelayMs: 0,
    });

    expect(mocks.search).toHaveBeenCalledTimes(3);
    expect(result.session.evidence?.agents[pricingAgent]?.retrieval).toMatchObject({
      status: "retrieved",
      sourceCount: 3,
    });
    expect(mocks.generate).toHaveBeenCalledTimes(1);
  });

  it("updates excluded publishers between sequential rescue queries", async () => {
    const pricingAgent = "pricing-scout" as const;
    mocks.search.mockImplementation(async (retrievalQuery) => {
      const excluded = retrievalQuery.excludeDomains ?? [];
      if (!excluded.includes("dominant.example")) {
        return [source(1, "dominant.example")];
      }
      if (!excluded.includes("independent-a.example")) {
        return [source(2, "independent-a.example")];
      }
      return [source(3, "independent-b.example")];
    });
    const session = createResearchSession(
      "Deep pricing evidence for a bilingual APAC research workspace",
      ["AI market research", "APAC SaaS"],
      undefined,
      { mode: "deep" },
    );

    const result = await runResearchAgentStage(session.id, pricingAgent, {
      minimumRetrievedSources: 3,
      stepDelayMs: 0,
    });

    expect(mocks.search).toHaveBeenCalledTimes(5);
    expect(mocks.search.mock.calls[3][0]).toMatchObject({
      excludeDomains: ["dominant.example"],
    });
    expect(mocks.search.mock.calls[4][0]).toMatchObject({
      excludeDomains: ["dominant.example", "independent-a.example"],
    });
    expect(
      mocks.search.mock.calls.every(
        ([query]) => query.searchDepth === "advanced" && query.minScore === 0.35,
      ),
    ).toBe(true);
    expect(result.session.evidence?.agents[pricingAgent]?.retrieval).toMatchObject({
      status: "retrieved",
      sourceCount: 3,
    });
  });

  it("reports safe Deep retrieval coverage diagnostics after diversity rescue is exhausted", async () => {
    mocks.search.mockResolvedValue([]);
    const session = createResearchSession(
      "Deep evidence diagnostics for an APAC SaaS product",
      [],
      undefined,
      { mode: "deep" },
    );

    await expect(
      runResearchAgentStage(session.id, AGENT_ID, {
        minimumRetrievedSources: 3,
        stepDelayMs: 0,
      }),
    ).rejects.toMatchObject({
      code: "retrieval_insufficient",
      retryable: false,
      message: expect.stringMatching(
        /admitted 0\/3 usable sources from 0\/5 queries across 0\/3 publisher domains.*per-query admitted counts \[0,0,0,0,0\]/i,
      ),
    });
    expect(mocks.search).toHaveBeenCalledTimes(5);
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it("does not admit low-score or empty-snippet rescue candidates", async () => {
    mocks.search.mockResolvedValue([
      { ...source(1, "low-score.example"), score: 0.34 },
      { ...source(2, "empty-snippet.example"), snippet: "" },
    ]);
    const session = createResearchSession(
      "Deep source quality for an APAC market research workspace",
      [],
      undefined,
      { mode: "deep" },
    );

    await expect(
      runResearchAgentStage(session.id, AGENT_ID, {
        minimumRetrievedSources: 3,
        stepDelayMs: 0,
      }),
    ).rejects.toMatchObject({
      code: "retrieval_insufficient",
      message: expect.stringMatching(/admitted 0\/3 usable sources/i),
      retryable: false,
    });
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it("keeps sufficient later rescue evidence when an earlier rescue request fails", async () => {
    mocks.search.mockImplementation(async (query) => {
      if (query.query.includes("Independent evidence")) {
        throw new RetrievalError("http_error", true, "transient earlier rescue failure");
      }
      if (query.query.includes("Dated primary")) {
        return [
          source(2, "independent-a.example"),
          source(3, "independent-b.example"),
        ];
      }
      return [source(1, "dominant.example")];
    });
    const session = createResearchSession(
      "Deep partial rescue for an APAC market research workspace",
      [],
      undefined,
      { mode: "deep" },
    );

    const result = await runResearchAgentStage(session.id, AGENT_ID, {
      minimumRetrievedSources: 3,
      stepDelayMs: 0,
    });

    expect(mocks.search).toHaveBeenCalledTimes(5);
    expect(result.session.evidence?.agents[AGENT_ID]?.retrieval).toMatchObject({
      status: "retrieved",
      sourceCount: 3,
    });
    expect(mocks.generate).toHaveBeenCalledTimes(1);
  });

  it("counts publisher domains instead of allowing sibling subdomains to fake diversity", async () => {
    mocks.search.mockResolvedValue([
      source(1, "www.vendor.co.uk"),
      source(2, "blog.vendor.co.uk"),
      source(3, "docs.vendor.co.uk"),
    ]);
    const session = createResearchSession(
      "Deep publisher diversity for an APAC market research workspace",
      [],
      undefined,
      { mode: "deep" },
    );

    await expect(
      runResearchAgentStage(session.id, AGENT_ID, {
        minimumRetrievedSources: 3,
        stepDelayMs: 0,
      }),
    ).rejects.toMatchObject({
      code: "retrieval_insufficient",
      retryable: false,
      message: expect.stringMatching(
        /across 1\/3 publisher domains.*per-query admitted counts \[3,3,3,3,3\]/i,
      ),
    });
    const rescueCalls = mocks.search.mock.calls.slice(3).map(([query]) => query);
    expect(rescueCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ excludeDomains: ["vendor.co.uk"] }),
      ]),
    );
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it("rejects output that cites none of the retrieved evidence", async () => {
    mocks.generate.mockImplementation(async (agentId, context) =>
      generateMockAgentOutput(agentId, context.query, context.keywords),
    );
    const session = createResearchSession("strict grounding", []);

    await expect(
      runResearchAgentStage(session.id, AGENT_ID, { stepDelayMs: 0 }),
    ).rejects.toMatchObject({ code: "evidence_insufficient" });
    expect(getResearchSession(session.id)?.agents[AGENT_ID].output).toBeUndefined();
  });

  it("distinguishes caller abort from session cancellation", async () => {
    const session = createResearchSession("external abort", []);
    const controller = new AbortController();
    controller.abort(new DOMException("worker lease lost", "AbortError"));

    await expect(
      runResearchAgentStage(session.id, AGENT_ID, {
        signal: controller.signal,
        stepDelayMs: 0,
      }),
    ).rejects.toMatchObject({ code: "aborted" });

    const cancelled = createResearchSession("session cancel", []);
    expect(cancelSession(cancelled.id)).toBe(true);
    await expect(
      runResearchAgentStage(cancelled.id, AGENT_ID, { stepDelayMs: 0 }),
    ).rejects.toMatchObject({ code: "session_cancelled" });
  });

  it("returns a distinguishable deadline error without terminalizing the session", async () => {
    const session = createResearchSession("expired stage", []);

    await expect(
      runResearchAgentStage(session.id, AGENT_ID, {
        deadlineAt: Date.now() - 1,
        stepDelayMs: 0,
      }),
    ).rejects.toMatchObject({ code: "deadline_exceeded" });
    expect(getResearchSession(session.id)?.status).toBe("pending");
  });

  it("rejects synthesis at the public single-specialist boundary", async () => {
    const session = createResearchSession("invalid specialist", []);

    await expect(
      runResearchAgentStage(session.id, "synthesis", { stepDelayMs: 0 }),
    ).rejects.toMatchObject({ code: "invalid_agent" });
  });
});
