// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentId, AgentOutput } from "@/lib/schema/research-schema";
import type { ProviderContext } from "@/lib/providers/provider.types";
import type { RetrievalProvider, RetrievalQuery, RetrievedSource } from "@/lib/providers/retrieval.types";

const mocks = vi.hoisted(() => ({
  currentRetrievalProvider: undefined as RetrievalProvider | undefined,
  search: vi.fn<(query: RetrievalQuery) => Promise<RetrievedSource[]>>(),
  generate: vi.fn<(agentId: AgentId, context: ProviderContext) => Promise<AgentOutput>>(),
  contexts: [] as Array<{ agentId: AgentId; context: ProviderContext }>,
  llmIsMock: false,
}));

vi.mock("@/lib/providers/retrieval-registry", () => ({
  selectRetrievalProvider: () => mocks.currentRetrievalProvider,
}));

vi.mock("@/lib/providers/provider-registry", () => ({
  selectProvider: () => ({
    id: mocks.llmIsMock ? "mock" : "evidence-test-llm",
    displayName: "Evidence Test LLM (test-model)",
    isMock: mocks.llmIsMock,
    supportsStreaming: false,
    generate: mocks.generate,
  }),
}));

import { generateMockAgentOutput } from "@/lib/providers/mock-provider";
import { getResearchRun } from "./storage";
import {
  cancelSession,
  createResearchSession,
  deleteSession,
  getResearchSession,
  listSessions,
  runResearchSession,
} from "./research-engine";

const SPECIALISTS = [
  "market-sizer",
  "competitor-analyst",
  "pain-detective",
  "pricing-scout",
  "channel-scout",
] as const;

const RETRIEVED_URLS: Record<(typeof SPECIALISTS)[number], string[]> = {
  "market-sizer": [
    "https://example.com/report/ai-marketing-2026",
    "https://example.com/gartner/martech-forecast",
    "https://example.com/market/unused-retrieved-source",
  ],
  "competitor-analyst": ["https://example.com/g2/ai-marketing"],
  "pain-detective": [
    "https://example.com/reddit/missing-tools",
    "https://example.com/ph/ai-saas-comments",
  ],
  "pricing-scout": ["https://example.com/pricing/survey"],
  "channel-scout": ["https://example.com/indie-hackers/launch-channels"],
};

const FOCUS_MARKERS: Record<(typeof SPECIALISTS)[number], string> = {
  "market-sizer": "TAM SAM SOM",
  "competitor-analyst": "competitors alternatives",
  "pain-detective": "user reviews complaints",
  "pricing-scout": "pricing pages plans",
  "channel-scout": "customer acquisition channels",
};

function mockRetrievalProvider(isMock: boolean): RetrievalProvider {
  return {
    id: isMock ? "mock-retrieval" : "test-search",
    displayName: isMock ? "Mock Retrieval" : "Test Search",
    isMock,
    search: mocks.search,
  };
}

function retrievedSource(agentId: (typeof SPECIALISTS)[number], url: string, index: number): RetrievedSource {
  const now = "2026-07-13T10:00:00.000Z";
  return {
    id: `raw-${agentId}-${index}`,
    title: `${agentId} source ${index}`,
    url,
    snippet: `Retrieved evidence for ${agentId}`,
    accessedAt: now,
    retrievedAt: now,
    confidence: "high",
    agent: agentId,
    score: 0.9,
  };
}

describe("Standard evidence runtime", () => {
  beforeEach(() => {
    vi.useRealTimers();
    mocks.search.mockReset();
    mocks.generate.mockReset();
    mocks.contexts.length = 0;
    mocks.llmIsMock = false;
    mocks.currentRetrievalProvider = mockRetrievalProvider(true);
    mocks.generate.mockImplementation(async (agentId, context) => {
      mocks.contexts.push({ agentId, context });
      const output = generateMockAgentOutput(agentId, context.query, context.keywords, context.upstream);
      if (agentId === "market-sizer") {
        output.citations.push({
          id: "fabricated-citation",
          title: "Fabricated source",
          url: "https://fabricated.invalid/not-retrieved",
          snippet: "This URL was not in the retrieved source set.",
          accessedAt: "2026-07-13T10:00:00.000Z",
          confidence: "low",
          agent: "market-sizer",
        });
        output.citations.push({
          id: "missing-url-citation",
          title: "Citation without URL",
          snippet: "A citation without a URL cannot be matched to retrieved evidence.",
          accessedAt: "2026-07-13T10:00:00.000Z",
          confidence: "low",
          agent: "market-sizer",
        });
      }
      return output;
    });
  });

  afterEach(() => {
    for (const sessionId of listSessions()) deleteSession(sessionId);
  });

  it("keeps mock retrieval explicitly not configured and never marks it grounded", async () => {
    const session = createResearchSession("AI marketing platform", ["AI", "marketing"]);
    await runResearchSession(session.id, { speedMultiplier: 1000 });

    const completed = getResearchSession(session.id)!;
    expect(mocks.search).not.toHaveBeenCalled();
    for (const agentId of SPECIALISTS) {
      expect(completed.evidence?.agents[agentId]).toMatchObject({
        retrieval: { status: "not_configured", sourceOrigin: "none", sourceCount: 0 },
        allowlist: { policy: "compatible", matched: 0, rejected: 0 },
        grounding: "ungrounded",
      });
    }
    expect(completed.evidence?.agents.synthesis).toMatchObject({
      retrieval: { status: "not_requested", sourceOrigin: "none", sourceCount: 0 },
      grounding: "ungrounded",
    });
    expect(completed.validation).toMatchObject({
      stage: "final",
      protocol: { requestedMode: "standard", executedPasses: 1, deepMultiPassExecuted: false },
      urlAllowlist: { status: "not_run", strictAgentCount: 0 },
      semanticValidation: { status: "not_run", factualAccuracy: false },
    });
    expect(completed.citations.length).toBeGreaterThan(0);
  });

  it("does not request retrieval or claim grounding for a mock LLM route", async () => {
    mocks.llmIsMock = true;
    mocks.currentRetrievalProvider = mockRetrievalProvider(false);
    mocks.search.mockImplementation(async ({ agentId }) => {
      if (!agentId || agentId === "synthesis") return [];
      return RETRIEVED_URLS[agentId].map((url, index) => retrievedSource(agentId, url, index));
    });

    const session = createResearchSession("mock model route", ["demo"]);
    await runResearchSession(session.id, { speedMultiplier: 1000 });
    const completed = getResearchSession(session.id)!;

    expect(mocks.search).not.toHaveBeenCalled();
    for (const agentId of SPECIALISTS) {
      expect(completed.evidence?.agents[agentId]).toMatchObject({
        retrieval: { status: "not_requested", sourceOrigin: "none", sourceCount: 0 },
        allowlist: { policy: "compatible", matched: 0 },
        grounding: "ungrounded",
      });
    }
  });

  it("injects focused retrieved sources, strictly allowlists citations, and rejects fabricated URLs", async () => {
    mocks.currentRetrievalProvider = mockRetrievalProvider(false);
    mocks.search.mockImplementation(async ({ agentId }) => {
      if (!agentId || agentId === "synthesis") return [];
      return RETRIEVED_URLS[agentId].map((url, index) => retrievedSource(agentId, url, index));
    });

    const session = createResearchSession("AI marketing platform", ["AI", "marketing"]);
    await runResearchSession(session.id, { speedMultiplier: 1000 });
    const completed = getResearchSession(session.id)!;

    expect(mocks.search).toHaveBeenCalledTimes(5);
    for (const agentId of SPECIALISTS) {
      const call = mocks.search.mock.calls.find(([query]) => query.agentId === agentId)?.[0];
      expect(call?.query).toContain(FOCUS_MARKERS[agentId]);
      expect(call?.signal).toBeInstanceOf(AbortSignal);

      const providerContext = mocks.contexts.find((item) => item.agentId === agentId)?.context;
      expect(providerContext?.retrievedSources).toHaveLength(RETRIEVED_URLS[agentId].length);
      expect(completed.evidence?.agents[agentId]?.retrieval.status).toBe("retrieved");
      expect(completed.evidence?.agents[agentId]?.allowlist.policy).toBe("strict");
    }

    const marketEvidence = completed.evidence?.agents["market-sizer"];
    expect(marketEvidence?.allowlist).toMatchObject({
      total: 4,
      matched: 2,
      rejected: 2,
      missingUrl: 1,
      retained: 2,
    });
    expect(marketEvidence?.grounding).toBe("grounded");
    expect(marketEvidence?.retrieval.sourceCount).toBe(3);

    const marketOutput = completed.agents["market-sizer"].output;
    expect(marketOutput?.agent).toBe("market-sizer");
    if (marketOutput?.agent !== "market-sizer") throw new Error("market output missing");
    expect(marketOutput.citations.map((citation) => citation.url)).not.toContain(
      "https://fabricated.invalid/not-retrieved",
    );
    expect(marketOutput.citations.every((citation) => citation.id.startsWith("source_"))).toBe(true);
    expect(marketOutput.marketSize.sources).toEqual(marketOutput.citations.map((citation) => citation.id));

    const synthesisContext = mocks.contexts.find((item) => item.agentId === "synthesis")?.context;
    expect(synthesisContext?.retrievedSources).toHaveLength(7);
    expect(synthesisContext?.validationSummary).toMatch(/1 structural pass executed/i);
    expect(synthesisContext?.validationSummary).toMatch(/factual accuracy[\s\S]*NOT RUN/i);
    expect(completed.evidence?.agents.synthesis).toMatchObject({
      retrieval: {
        status: "not_requested",
        sourceOrigin: "specialist_union",
        sourceCount: 7,
      },
      allowlist: { policy: "strict", matched: 5, rejected: 0 },
      grounding: "grounded",
    });

    const citationIds = completed.citations.map((citation) => citation.id);
    expect(new Set(citationIds).size).toBe(citationIds.length);

    const persisted = getResearchRun(session.id);
    expect(Object.keys(persisted?.dossier?.agents ?? {})).toHaveLength(6);
    expect(persisted?.dossier?.agents["market-sizer"].evidence?.allowlist).toMatchObject({
      policy: "strict",
      matched: 2,
      rejected: 2,
      missingUrl: 1,
    });
    expect(persisted?.dossier?.agents.synthesis.output?.agent).toBe("synthesis");
    expect(persisted?.dossier?.validation).toMatchObject({
      stage: "final",
      protocol: { executedPasses: 1, deepMultiPassExecuted: false },
      semanticValidation: { status: "not_run" },
    });
  });

  it("keeps a real-provider fallback compatible and ungrounded after retrieval", async () => {
    mocks.currentRetrievalProvider = mockRetrievalProvider(false);
    mocks.search.mockImplementation(async ({ agentId }) => {
      if (!agentId || agentId === "synthesis") return [];
      return RETRIEVED_URLS[agentId].map((url, index) => retrievedSource(agentId, url, index));
    });
    mocks.generate.mockImplementation(async (agentId, context) => {
      mocks.contexts.push({ agentId, context });
      if (agentId === "market-sizer") {
        context.onFallback?.("network_error", { message: "test fallback" });
      }
      return generateMockAgentOutput(agentId, context.query, context.keywords, context.upstream);
    });

    const session = createResearchSession("fallback after retrieval", ["fallback"]);
    await runResearchSession(session.id, { speedMultiplier: 1000 });
    const completed = getResearchSession(session.id)!;

    expect(completed.evidence?.agents["market-sizer"]).toMatchObject({
      retrieval: { status: "retrieved", sourceCount: 3 },
      allowlist: { policy: "compatible", matched: 0, rejected: 0 },
      grounding: "ungrounded",
    });
    expect(completed.agents["market-sizer"]).toMatchObject({
      degraded: true,
      degradedReason: "network_error",
    });
    expect(completed.evidence?.agents.synthesis).toMatchObject({
      retrieval: { status: "not_requested", sourceOrigin: "specialist_union", sourceCount: 5 },
      allowlist: { policy: "strict", matched: 4, rejected: 1 },
      grounding: "grounded",
    });
  });

  it("keeps Standard output compatible when real retrieval is unavailable", async () => {
    mocks.currentRetrievalProvider = mockRetrievalProvider(false);
    mocks.search.mockRejectedValue(new Error("sensitive upstream detail"));

    const session = createResearchSession("AI marketing platform", ["AI", "marketing"]);
    await runResearchSession(session.id, { speedMultiplier: 1000 });
    const completed = getResearchSession(session.id)!;

    const marketEvidence = completed.evidence?.agents["market-sizer"];
    expect(marketEvidence).toMatchObject({
      retrieval: {
        status: "unavailable",
        sourceOrigin: "none",
        sourceCount: 0,
        unavailableReason: "retrieval_request_failed",
      },
      allowlist: { policy: "compatible", matched: 0, rejected: 0 },
      grounding: "ungrounded",
    });
    expect(completed.agents["market-sizer"].output?.citations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ url: "https://fabricated.invalid/not-retrieved" }),
      ]),
    );
  });

  it("propagates the session cancellation signal into retrieval", async () => {
    mocks.currentRetrievalProvider = mockRetrievalProvider(false);
    let signalObserved = false;
    let releaseStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      releaseStarted = resolve;
    });

    mocks.search.mockImplementation(({ signal }) => {
      signalObserved = signal instanceof AbortSignal;
      releaseStarted();
      return new Promise<RetrievedSource[]>((resolve, reject) => {
        if (!signal) {
          resolve([]);
          return;
        }
        if (signal.aborted) {
          reject(new DOMException("Aborted", "AbortError"));
          return;
        }
        signal.addEventListener(
          "abort",
          () => reject(new DOMException("Aborted", "AbortError")),
          { once: true },
        );
      });
    });

    const session = createResearchSession("cancel retrieval", ["abort"]);
    const running = runResearchSession(session.id, { speedMultiplier: 1000 });
    await started;
    expect(cancelSession(session.id)).toBe(true);
    await running;

    expect(signalObserved).toBe(true);
    expect(getResearchSession(session.id)?.status).toBe("cancelled");
  });
});
