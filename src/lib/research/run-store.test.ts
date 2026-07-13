// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ResearchRun } from "./storage";
import type { AgentId, AgentState, ResearchSession } from "@/lib/schema/research-schema";
import { createEvidenceLedger } from "./evidence-ledger";
import { buildResearchValidation } from "./validation-ledger";
import { generateMockAgentOutput } from "@/lib/providers/mock-provider";

const ORIGINAL_ENV = { ...process.env };

function setRedisEnv() {
  process.env.UPSTASH_REDIS_REST_URL = "https://test-redis.upstash.io";
  process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";
}

function makeRun(id: string, createdAt: number, query = "AI market research"): ResearchRun {
  return {
    id,
    query,
    keywords: ["ai", "market"],
    result: JSON.stringify({ summary: id }),
    provider: "minimax",
    model: "MiniMax-M3",
    createdAt,
    durationMs: 1000,
    status: "completed",
    sources: [{ title: "Source", url: "https://example.com" }],
  };
}

const DOSSIER_AGENT_IDS: readonly AgentId[] = [
  "market-sizer",
  "competitor-analyst",
  "pain-detective",
  "pricing-scout",
  "channel-scout",
  "synthesis",
];

function makeCompleteSession(id: string): ResearchSession {
  const now = "2026-07-13T10:00:00.000Z";
  const agents = {} as Record<AgentId, AgentState>;
  const specialistOutputs = DOSSIER_AGENT_IDS
    .filter((agentId) => agentId !== "synthesis")
    .map((agentId) => generateMockAgentOutput(agentId, "Evidence research", ["evidence"]));

  for (const agentId of DOSSIER_AGENT_IDS) {
    agents[agentId] = {
      id: agentId,
      status: "done",
      progress: 100,
      currentStep: "Complete",
      output: generateMockAgentOutput(
        agentId,
        "Evidence research",
        ["evidence"],
        specialistOutputs,
      ),
      resolvedProviderId: "openai",
      degraded: agentId === "pricing-scout",
      ...(agentId === "pricing-scout" ? { degradedReason: "network_error" as const } : {}),
    };
  }

  const evidence = createEvidenceLedger(now);
  const marketEvidence = evidence.agents["market-sizer"]!;
  marketEvidence.retrieval = {
    status: "retrieved",
    sourceOrigin: "agent_retrieval",
    providerId: "tavily",
    focusedQuery: "Evidence research — market size",
    sourceCount: 1,
    sources: [
      {
        id: "source_market",
        title: "Market source",
        url: "https://example.com/market",
        snippet: "Market evidence",
        accessedAt: now,
        retrievedAt: now,
        confidence: "high",
        agent: "market-sizer",
      },
    ],
  };
  marketEvidence.allowlist = {
    policy: "strict",
    total: 1,
    matched: 1,
    rejected: 0,
    missingUrl: 0,
    retained: 1,
  };
  marketEvidence.grounding = "grounded";

  const session: ResearchSession = {
    id,
    query: "Evidence research",
    keywords: ["evidence"],
    mode: "standard",
    providerId: "openai",
    providerModel: "test-model",
    createdAt: now,
    updatedAt: now,
    status: "completed",
    agents,
    citations: [],
    evidence,
  };
  session.validation = buildResearchValidation(session, now);
  return session;
}

describe("researchRunFromSession", () => {
  it("preserves mode in durable history and normalizes legacy sessions", async () => {
    const { researchRunFromSession } = await import("./run-store");
    const base = {
      id: "session-mode",
      query: "Mode persistence",
      keywords: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: "completed",
      agents: { synthesis: { status: "done" } },
      citations: [],
    } as unknown as ResearchSession;

    expect(researchRunFromSession({ ...base, mode: "deep" }).mode).toBe("deep");
    expect(researchRunFromSession(base).mode).toBe("standard");
  });

  it("derives duration from the terminal session timestamps instead of reconciliation time", async () => {
    const { researchRunFromSession } = await import("./run-store");
    const base = {
      id: "session-duration",
      query: "Deep duration",
      keywords: [],
      mode: "deep",
      createdAt: "2026-07-13T00:00:00.000Z",
      updatedAt: "2026-07-13T00:15:00.000Z",
      status: "completed",
      agents: { synthesis: { status: "done" } },
      citations: [],
    } as unknown as ResearchSession;

    expect(researchRunFromSession(base).durationMs).toBe(15 * 60 * 1_000);
  });

  it("builds a six-agent dossier with outputs, evidence, and degradation state", async () => {
    const { researchRunFromSession } = await import("./run-store");
    const run = researchRunFromSession(makeCompleteSession("session-dossier"));

    expect(Object.keys(run.dossier?.agents ?? {})).toEqual(DOSSIER_AGENT_IDS);
    for (const agentId of DOSSIER_AGENT_IDS) {
      expect(run.dossier?.agents[agentId].output?.agent).toBe(agentId);
    }
    expect(run.dossier?.agents["market-sizer"].evidence?.allowlist).toMatchObject({
      policy: "strict",
      matched: 1,
      rejected: 0,
    });
    expect(run.dossier?.agents["pricing-scout"]).toMatchObject({
      degraded: true,
      degradedReason: "network_error",
    });
    expect(run.dossier?.degraded).toBe(true);
    expect(run.dossier?.validation).toMatchObject({
      stage: "final",
      protocol: { executedPasses: 1, deepMultiPassExecuted: false },
      semanticValidation: { status: "not_run" },
    });
  });
});

describe("run-store — degraded without Redis", () => {
  beforeEach(() => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;
    vi.resetModules();
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("degrades to no-op/null when Redis is not configured", async () => {
    const { storePersistentResearchRun, getPersistentResearchRun, searchPersistentResearchRuns } =
      await import("./run-store");

    await expect(storePersistentResearchRun(makeRun("r1", 1))).resolves.toBeUndefined();
    await expect(getPersistentResearchRun("r1")).resolves.toBeNull();
    await expect(searchPersistentResearchRuns()).resolves.toEqual({ runs: [], total: 0 });
  });
});

describe("run-store — Redis configured", () => {
  const mockStore = new Map<string, string>();
  const mockExpiry = new Map<string, number>();

  beforeEach(() => {
    mockStore.clear();
    mockExpiry.clear();
    setRedisEnv();
    vi.resetModules();
    vi.doMock("@upstash/redis", () => ({
      Redis: class MockRedis {
        async set(key: string, value: unknown, opts?: { ex?: number }) {
          mockStore.set(key, typeof value === "string" ? value : JSON.stringify(value));
          if (opts?.ex) mockExpiry.set(key, Date.now() + opts.ex * 1000);
          return "OK";
        }

        async get<T = unknown>(key: string): Promise<T | null> {
          const expiresAt = mockExpiry.get(key);
          if (expiresAt !== undefined && expiresAt <= Date.now()) {
            mockStore.delete(key);
            mockExpiry.delete(key);
          }
          const value = mockStore.get(key);
          if (value === undefined) return null;
          try {
            return JSON.parse(value) as T;
          } catch {
            return value as T;
          }
        }

        async del(key: string) {
          mockExpiry.delete(key);
          return mockStore.delete(key) ? 1 : 0;
        }
      },
    }));
  });

  afterEach(() => {
    vi.doUnmock("@upstash/redis");
    process.env = { ...ORIGINAL_ENV };
  });

  it("stores a run and recovers it by id", async () => {
    const { storePersistentResearchRun, getPersistentResearchRun } = await import("./run-store");
    await storePersistentResearchRun(makeRun("r1", 1700000000000));

    await expect(getPersistentResearchRun("r1")).resolves.toMatchObject({
      id: "r1",
      query: "AI market research",
      status: "completed",
    });
  });

  it("round-trips the complete dossier through Redis persistence", async () => {
    const { researchRunFromSession, storePersistentResearchRun, getPersistentResearchRun } =
      await import("./run-store");
    const run = researchRunFromSession(makeCompleteSession("dossier-roundtrip"));

    await storePersistentResearchRun(run);

    const recovered = await getPersistentResearchRun("dossier-roundtrip");
    expect(Object.keys(recovered?.dossier?.agents ?? {})).toHaveLength(6);
    expect(recovered?.dossier?.agents.synthesis.output?.agent).toBe("synthesis");
    expect(recovered?.dossier?.evidence?.agents["market-sizer"]?.retrieval.sources).toHaveLength(1);
    expect(recovered?.dossier?.validation?.protocol.executedPasses).toBe(1);
    expect(recovered?.dossier?.agents["pricing-scout"].degradedReason).toBe("network_error");
  });

  it("lists newest Redis runs first and supports query filtering", async () => {
    const { storePersistentResearchRun, searchPersistentResearchRuns } = await import("./run-store");
    await storePersistentResearchRun(makeRun("old", 1000, "Old fintech research"));
    await storePersistentResearchRun(makeRun("new", 2000, "New AI research"));

    await expect(searchPersistentResearchRuns()).resolves.toMatchObject({
      total: 2,
      runs: [{ id: "new" }, { id: "old" }],
    });

    await expect(searchPersistentResearchRuns({ query: "fintech" })).resolves.toMatchObject({
      total: 1,
      runs: [{ id: "old" }],
    });

    const index = JSON.parse(mockStore.get("rs:runs:index") ?? "[]");
    expect(index[0]).toMatchObject({ id: "new", hasSources: true });
    expect(index[0].result).toBeUndefined();
    expect(index[0].dossier).toBeUndefined();
  });

  it("loads legacy string-only indexes without fetching full dossiers for new entries", async () => {
    const { storePersistentResearchRun, searchPersistentResearchRuns } = await import("./run-store");
    const legacy = makeRun("legacy", 1000, "Legacy pricing research");
    mockStore.set("rs:run:legacy", JSON.stringify(legacy));
    mockStore.set("rs:runs:index", JSON.stringify(["legacy"]));

    await expect(searchPersistentResearchRuns({ query: "pricing" })).resolves.toMatchObject({
      total: 1,
      runs: [{ id: "legacy", hasSources: true }],
    });

    await storePersistentResearchRun(makeRun("summary", 2000, "Summary-only AI research"));
    const index = JSON.parse(mockStore.get("rs:runs:index") ?? "[]");
    expect(index[0].id).toBe("summary");
    expect(index[1]).toBe("legacy");
  });

  it("deletes run keys and removes ids from the index", async () => {
    const { storePersistentResearchRun, deletePersistentResearchRuns, searchPersistentResearchRuns } =
      await import("./run-store");
    await storePersistentResearchRun(makeRun("r1", 1000));
    await storePersistentResearchRun(makeRun("r2", 2000));

    await expect(deletePersistentResearchRuns(["r2"])).resolves.toBe(1);
    await expect(searchPersistentResearchRuns()).resolves.toMatchObject({
      total: 1,
      runs: [{ id: "r1" }],
    });
  });
});
