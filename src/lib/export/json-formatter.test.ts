import { describe, it, expect } from "vitest";
import { buildResearchExport, serializeJSON, EXPORT_SCHEMA_VERSION } from "@/lib/export/json-formatter";
import type { AgentOutput, AgentId } from "@/lib/schema/research-schema";

const mockOutputs: Record<AgentId, AgentOutput | null> = {
  "market-sizer": {
    agent: "market-sizer",
    summary: "Test",
    marketSize: { tam: 1e9, sam: 1e8, som: 1e6, currency: "USD", growthRate: 10, growthTrend: "stable", unit: "revenue", sources: [], confidence: "high" },
    keyTrends: [],
    targetSegments: [],
    citations: [
      { id: "c1", title: "T1", snippet: "s", accessedAt: "2026-01-01T00:00:00Z", confidence: "high", agent: "market-sizer" },
      { id: "c2", title: "T2", snippet: "s", accessedAt: "2026-01-01T00:00:00Z", confidence: "medium", agent: "market-sizer" },
    ],
  },
  "competitor-analyst": null,
  "pain-detective": null,
  "pricing-scout": null,
  "channel-scout": null,
  synthesis: null,
};

const mockSession = {
  id: "test-123",
  query: "Test query",
  keywords: ["ai"],
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:01:00Z",
  status: "completed" as const,
  agents: {
    "market-sizer": { id: "market-sizer", status: "done", progress: 100, currentStep: "Done", output: mockOutputs["market-sizer"]! },
    "competitor-analyst": { id: "competitor-analyst", status: "idle", progress: 0, currentStep: "Idle" },
    "pain-detective": { id: "pain-detective", status: "idle", progress: 0, currentStep: "Idle" },
    "pricing-scout": { id: "pricing-scout", status: "idle", progress: 0, currentStep: "Idle" },
    "channel-scout": { id: "channel-scout", status: "idle", progress: 0, currentStep: "Idle" },
    synthesis: { id: "synthesis", status: "idle", progress: 0, currentStep: "Idle" },
  } as any,
  citations: [],
};

describe("buildResearchExport", () => {
  it("includes schema version", () => {
    const r = buildResearchExport(mockSession, mockOutputs);
    expect(r.schemaVersion).toBe(EXPORT_SCHEMA_VERSION);
  });

  it("includes source identifier", () => {
    const r = buildResearchExport(mockSession, mockOutputs);
    expect(r.source).toBe("launchlens-research-studio");
  });

  it("counts completed agents", () => {
    const r = buildResearchExport(mockSession, mockOutputs);
    expect(r.meta.completedAgents).toEqual(["market-sizer"]);
  });

  it("deduplicates citations by id", () => {
    // Add an output with a citation that duplicates one already in mockOutputs.
    // To make those citations count, we need the session agent to be 'done' too.
    const sessionWithCompDone = {
      ...mockSession,
      agents: {
        ...mockSession.agents,
        "competitor-analyst": {
          id: "competitor-analyst" as const,
          status: "done" as const,
          progress: 100,
          currentStep: "Done",
          output: {
            agent: "competitor-analyst" as const,
            summary: "x",
            competitors: [],
            competitiveMatrix: [],
            gaps: [],
            citations: [
              { id: "c1", title: "T1 dup", snippet: "s", accessedAt: "2026-01-01T00:00:00Z", confidence: "high", agent: "competitor-analyst" as const },
              { id: "c3", title: "T3", snippet: "s", accessedAt: "2026-01-01T00:00:00Z", confidence: "low", agent: "competitor-analyst" as const },
            ],
          },
        },
      },
    };
    const compOutput: AgentOutput = sessionWithCompDone.agents["competitor-analyst"].output!;
    const r = buildResearchExport(sessionWithCompDone, {
      ...mockOutputs,
      "competitor-analyst": compOutput,
    });
    // c1 (from market, also in comp - deduped) + c2 (market) + c3 (comp) = 3 unique
    expect(r.meta.totalCitations).toBe(3);
    const ids = r.citations.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("counts confidence levels correctly", () => {
    const r = buildResearchExport(mockSession, mockOutputs);
    expect(r.meta.highConfidenceCitations).toBe(1);
    expect(r.meta.mediumConfidenceCitations).toBe(1);
    expect(r.meta.lowConfidenceCitations).toBe(0);
  });

  it("captures session metadata", () => {
    const r = buildResearchExport(mockSession, mockOutputs);
    expect(r.session.id).toBe("test-123");
    expect(r.session.query).toBe("Test query");
    expect(r.session.keywords).toEqual(["ai"]);
    expect(r.session.status).toBe("completed");
  });

  it("captures agent statuses with hasOutput flag", () => {
    const r = buildResearchExport(mockSession, mockOutputs);
    expect(r.session.agentStatuses["market-sizer"].hasOutput).toBe(true);
    expect(r.session.agentStatuses["competitor-analyst"].hasOutput).toBe(false);
    expect(r.session.agentStatuses["synthesis"].hasOutput).toBe(false);
  });

  it("includes notes when provided", () => {
    const notes = {
      personalNote: "Great research, worth revisiting.",
      tags: ["priority", "b2b"],
      rating: 5,
      isStarred: true,
      isArchived: false,
      updatedAt: 1234567890,
      lastOpenedAt: 1234567900,
    };
    const r = buildResearchExport(mockSession, mockOutputs, notes);
    expect(r.notes).toBeDefined();
    expect(r.notes!.personalNote).toBe("Great research, worth revisiting.");
    expect(r.notes!.tags).toEqual(["priority", "b2b"]);
    expect(r.notes!.rating).toBe(5);
    expect(r.notes!.isStarred).toBe(true);
    expect(r.notes!.isArchived).toBe(false);
    expect(r.notes!.updatedAt).toBe(1234567890);
    expect(r.notes!.lastOpenedAt).toBe(1234567900);
  });

  it("omits notes when not provided", () => {
    const r = buildResearchExport(mockSession, mockOutputs);
    expect(r.notes).toBeUndefined();
  });

  it("emits exportedAt timestamp", () => {
    const r = buildResearchExport(mockSession, mockOutputs);
    expect(r.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

describe("serializeJSON", () => {
  it("produces pretty JSON by default", () => {
    const r = buildResearchExport(mockSession, mockOutputs);
    const s = serializeJSON(r);
    expect(s).toContain("\n");
    expect(s).toContain("  ");
  });

  it("produces compact JSON when pretty=false", () => {
    const r = buildResearchExport(mockSession, mockOutputs);
    const s = serializeJSON(r, false);
    expect(s).not.toContain("\n  ");
  });

  it("round-trips through JSON.parse", () => {
    const r = buildResearchExport(mockSession, mockOutputs);
    const s = serializeJSON(r);
    const parsed = JSON.parse(s);
    expect(parsed.schemaVersion).toBe(r.schemaVersion);
  });
});
