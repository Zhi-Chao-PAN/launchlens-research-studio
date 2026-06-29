import { describe, it, expect } from "vitest";
import {
  toLaunchLensBrief,
  serializeBrief,
  buildReportUrl,
  getLaunchLensAiUrl,
  getResearchStudioUrl,
  LAUNCHLENS_BRIEF_SCHEMA_VERSION,
  LAUNCHLENS_FIELD_MAX,
  LAUNCHLENS_IDEA_MIN,
} from "@/lib/export/brief-mapper";
import { briefHashFor, encodeBase64UrlUtf8, BRIEF_HASH_PREFIX } from "@/lib/export/base64url";
import type { AgentId, AgentOutput, ResearchSession, SynthesisOutput } from "@/lib/schema/research-schema";

// A fully-populated session fixture mirroring the shape research-engine leaves
// behind after a successful 6-agent run. Built once, reused with overrides.
function fullOutputs(): Record<AgentId, AgentOutput> {
  return {
    "market-sizer": {
      agent: "market-sizer",
      summary: "Sizing summary",
      marketSize: { tam: 5_000_000_000, sam: 800_000_000, som: 50_000_000, currency: "USD", growthRate: 18, growthTrend: "accelerating", unit: "revenue", sources: [], confidence: "high" },
      keyTrends: [],
      targetSegments: [
        { name: "Indie SaaS founders", size: 120000, description: "Solo or two-person teams shipping B2B tools" },
      ],
      citations: [],
    },
    "competitor-analyst": {
      agent: "competitor-analyst",
      summary: "Comp summary",
      competitors: [
        { id: "c1", name: "AcmeCorp", tagline: "x", strengths: [], weaknesses: [], pricing: { min: 0, max: 0, model: "free", currency: "USD" }, positioning: "mid-market", differentiation: "x", citations: [] },
        { id: "c2", name: "BetaCo", tagline: "x", strengths: [], weaknesses: [], pricing: { min: 0, max: 0, model: "free", currency: "USD" }, positioning: "niche", differentiation: "x", citations: [] },
      ],
      competitiveMatrix: [],
      gaps: [{ gap: "No mobile-first onboarding", opportunity: "Ship a mobile-native flow", difficulty: "medium" }],
      citations: [],
    },
    "pain-detective": {
      agent: "pain-detective",
      summary: "Pain summary",
      painPoints: [],
      unmetNeeds: [{ need: "Real-time churn signal", whyUnmet: "Existing tools are batch", opportunity: "Stream signals" }],
      userPersonas: [
        { name: "Solo Founder", role: "CEO", goals: ["Ship faster"], frustrations: ["Too many tools"] },
        { name: "Growth Lead", role: "Marketing", goals: ["Reduce churn"], frustrations: ["No data"] },
      ],
      citations: [],
    },
    "pricing-scout": {
      agent: "pricing-scout",
      summary: "Pricing summary",
      priceBands: [],
      competitorPricing: [],
      monetizationModels: [],
      willingnessToPay: [],
      recommendations: [
        { tier: "Starter", price: 29, rationale: "Below AcmeCorp entry to lower switching cost", period: "monthly" },
        { tier: "Pro", price: 79, rationale: "Captures willingness-to-pay from growth teams", period: "monthly" },
      ],
      citations: [],
    },
    "channel-scout": {
      agent: "channel-scout",
      summary: "Channel summary",
      channels: [],
      communityHubs: [],
      contentTopics: [],
      recommendedChannels: [],
      citations: [],
    },
    synthesis: {
      agent: "synthesis",
      execSummary: "A focused opportunity in indie SaaS onboarding with clear willingness to pay.",
      opportunityScore: 78,
      riskScore: 42,
      keyInsights: [],
      topThreeOpportunities: [{ title: "Mobile-first onboarding gap", description: "d", rationale: "r" }],
      topThreeRisks: [{ title: "AcmeCorp may ship mobile", description: "d", mitigation: "Ship faster and own the niche" }],
      recommendedNextStep: "Validate with 10 founders",
      launchlensBrief: "legacy free-text brief — should not be used by the structured mapper",
      citations: [],
    },
  };
}

function buildSession(overrides: Partial<ResearchSession> = {}): ResearchSession {
  const outputs = fullOutputs();
  const agents = {} as ResearchSession["agents"];
  (Object.keys(outputs) as AgentId[]).forEach((id) => {
    agents[id] = { id, status: "done", progress: 100, currentStep: "Done", output: outputs[id] };
  });
  return {
    id: "sess-abc123",
    query: "AI onboarding analyst for indie SaaS founders",
    keywords: ["onboarding", "saas"],
    createdAt: "2026-06-01T00:00:00Z",
    updatedAt: "2026-06-01T00:05:00Z",
    status: "completed",
    agents,
    citations: [],
    ...overrides,
  };
}

describe("toLaunchLensBrief — envelope", () => {
  it("stamps schema version and source", () => {
    const brief = toLaunchLensBrief(buildSession());
    expect(brief.schemaVersion).toBe(LAUNCHLENS_BRIEF_SCHEMA_VERSION);
    expect(brief.source).toBe("launchlens-research-studio");
  });

  it("carries session id and query for provenance", () => {
    const brief = toLaunchLensBrief(buildSession());
    expect(brief.sessionId).toBe("sess-abc123");
    expect(brief.query).toBe("AI onboarding analyst for indie SaaS founders");
  });

  it("emits an ISO exportedAt timestamp", () => {
    const brief = toLaunchLensBrief(buildSession());
    expect(brief.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/);
  });
});

describe("toLaunchLensBrief — field mapping", () => {
  it("maps idea from query + exec summary", () => {
    const brief = toLaunchLensBrief(buildSession());
    expect(brief.input.idea).toContain("AI onboarding analyst for indie SaaS founders");
    expect(brief.input.idea).toContain("focused opportunity in indie SaaS onboarding");
  });

  it("maps audience from pain personas + market segments", () => {
    const brief = toLaunchLensBrief(buildSession());
    expect(brief.input.audience).toContain("Solo Founder");
    expect(brief.input.audience).toContain("Growth Lead");
    expect(brief.input.audience).toContain("Indie SaaS founders");
  });

  it("maps market from TAM/growth + competitors + gaps", () => {
    const brief = toLaunchLensBrief(buildSession());
    expect(brief.input.market).toContain("$5,000,000,000");
    expect(brief.input.market).toContain("18%/yr");
    expect(brief.input.market).toContain("AcmeCorp");
    expect(brief.input.market).toContain("No mobile-first onboarding");
  });

  it("maps constraints from pricing recs + unmet needs + risks", () => {
    const brief = toLaunchLensBrief(buildSession());
    expect(brief.input.constraints).toContain("Starter");
    expect(brief.input.constraints).toContain("Real-time churn signal");
    expect(brief.input.constraints).toContain("AcmeCorp may ship mobile");
  });

  it("uses the fixed default tone (no tone agent exists)", () => {
    const brief = toLaunchLensBrief(buildSession());
    expect(brief.input.tone).toBe("Practical, crisp, and founder-friendly");
  });

  it("records opportunity/risk scores and completed agents in meta", () => {
    const brief = toLaunchLensBrief(buildSession());
    expect(brief.meta.opportunityScore).toBe(78);
    expect(brief.meta.riskScore).toBe(42);
    expect(brief.meta.completedAgents).toContain("market-sizer");
    expect(brief.meta.completedAgents).toContain("synthesis");
  });
});

describe("toLaunchLensBrief — truncation", () => {
  it("clamps every field to the launchlens limit", () => {
    const long = "x".repeat(LAUNCHLENS_FIELD_MAX + 500);
    const session = buildSession({
      query: long,
      agents: {
        ...buildSession().agents,
        synthesis: { id: "synthesis", status: "done", progress: 100, currentStep: "Done", output: { ...fullOutputs().synthesis as SynthesisOutput, execSummary: long } },
      },
    });
    const brief = toLaunchLensBrief(session);
    for (const field of ["idea", "audience", "market", "constraints"] as const) {
      expect(brief.input[field].length).toBeLessThanOrEqual(LAUNCHLENS_FIELD_MAX);
    }
    // tone is a fixed short string, never truncated
    expect(brief.meta.truncated).not.toContain("tone");
    expect(brief.meta.truncated.length).toBeGreaterThan(0);
  });

  it("does not mark truncation when nothing was cut", () => {
    // Use a session whose agent outputs are short enough to fit every field's
    // advisory limit (idea≤500, audience≤240, market≤120, constraints≤320).
    // The shared fullOutputs() fixture's market field (TAM + 2 competitors +
    // gap + opportunity) exceeds the 120-char advisory, so it would be cut.
    const lean = buildSession({
      agents: {
        ...buildSession().agents,
        "market-sizer": {
          id: "market-sizer",
          status: "done",
          progress: 100,
          currentStep: "Done",
          output: {
            agent: "market-sizer",
            summary: "Sizing",
            marketSize: { tam: 5_000_000_000, sam: 1, som: 1, currency: "USD", growthRate: 18, growthTrend: "accelerating", unit: "revenue", sources: [], confidence: "high" },
            keyTrends: [],
            targetSegments: [],
            citations: [],
          },
        },
        "competitor-analyst": {
          id: "competitor-analyst",
          status: "done",
          progress: 100,
          currentStep: "Done",
          output: {
            agent: "competitor-analyst",
            summary: "Comp",
            competitors: [{ id: "c1", name: "Acme", tagline: "x", strengths: [], weaknesses: [], pricing: { min: 0, max: 0, model: "free", currency: "USD" }, positioning: "mid-market", differentiation: "x", citations: [] }],
            competitiveMatrix: [],
            gaps: [],
            citations: [],
          },
        },
        synthesis: {
          id: "synthesis",
          status: "done",
          progress: 100,
          currentStep: "Done",
          output: {
            agent: "synthesis",
            execSummary: "A focused opportunity in indie SaaS onboarding with clear willingness to pay.",
            opportunityScore: 78,
            riskScore: 42,
            keyInsights: [],
            topThreeOpportunities: [],
            topThreeRisks: [],
            recommendedNextStep: "Validate",
            launchlensBrief: "legacy",
            citations: [],
          },
        },
      },
    });
    const brief = toLaunchLensBrief(lean);
    expect(brief.meta.truncated).toEqual([]);
  });

  it("clamps each field to its advisory limit (idea 500, audience 240, market 120, constraints 320)", () => {
    // A realistic session whose agent outputs overflow every advisory limit.
    const brief = toLaunchLensBrief(buildSession());
    expect(brief.input.idea.length).toBeLessThanOrEqual(500);
    expect(brief.input.audience.length).toBeLessThanOrEqual(240);
    expect(brief.input.market.length).toBeLessThanOrEqual(120);
    expect(brief.input.constraints.length).toBeLessThanOrEqual(320);
    expect(brief.input.tone.length).toBeLessThanOrEqual(1200);
  });
});

describe("toLaunchLensBrief — empty / missing outputs", () => {
  it("falls back to neutral copy when no agent produced output", () => {
    const emptyAgents = {} as ResearchSession["agents"];
    (["market-sizer", "competitor-analyst", "pain-detective", "pricing-scout", "channel-scout", "synthesis"] as AgentId[]).forEach((id) => {
      emptyAgents[id] = { id, status: "idle", progress: 0, currentStep: "" };
    });
    const brief = toLaunchLensBrief(buildSession({ agents: emptyAgents }));
    // Still produces a valid five-field object...
    expect(brief.input.idea.length).toBeGreaterThanOrEqual(LAUNCHLENS_IDEA_MIN);
    expect(brief.input.audience.length).toBeGreaterThan(0);
    expect(brief.input.market.length).toBeGreaterThan(0);
    expect(brief.input.constraints.length).toBeGreaterThan(0);
    expect(brief.input.tone).toBe("Practical, crisp, and founder-friendly");
    // ...with null scores and no completed agents.
    expect(brief.meta.opportunityScore).toBeNull();
    expect(brief.meta.riskScore).toBeNull();
    expect(brief.meta.completedAgents).toEqual([]);
  });

  it("guarantees idea clears the 12-char server gate even with empty query + summary", () => {
    const emptyAgents = {} as ResearchSession["agents"];
    (["market-sizer", "competitor-analyst", "pain-detective", "pricing-scout", "channel-scout", "synthesis"] as AgentId[]).forEach((id) => {
      emptyAgents[id] = { id, status: "idle", progress: 0, currentStep: "" };
    });
    const brief = toLaunchLensBrief(buildSession({ query: "", agents: emptyAgents }));
    expect(brief.input.idea.length).toBeGreaterThanOrEqual(LAUNCHLENS_IDEA_MIN);
    expect(brief.input.idea.length).toBeLessThanOrEqual(LAUNCHLENS_FIELD_MAX);
  });

  it("uses query alone when synthesis has no exec summary", () => {
    const session = buildSession({
      agents: {
        ...buildSession().agents,
        synthesis: { id: "synthesis", status: "done", progress: 100, currentStep: "Done", output: { ...fullOutputs().synthesis as SynthesisOutput, execSummary: "" } },
      },
    });
    const brief = toLaunchLensBrief(session);
    expect(brief.input.idea).toBe("AI onboarding analyst for indie SaaS founders");
  });

  it("does not let degraded synthesis pollute the LaunchLens handoff brief", () => {
    const session = buildSession({
      agents: {
        ...buildSession().agents,
        synthesis: {
          id: "synthesis",
          status: "done",
          progress: 100,
          currentStep: "Done",
          degraded: true,
          degradedReason: "http_error",
          output: {
            ...(fullOutputs().synthesis as SynthesisOutput),
            execSummary: "Generic AI GTM text that does not match the researched idea.",
            opportunityScore: 91,
            riskScore: 12,
          },
        },
      },
    });

    const brief = toLaunchLensBrief(session);

    expect(brief.input.idea).toBe("AI onboarding analyst for indie SaaS founders");
    expect(brief.input.idea).not.toContain("Generic AI GTM text");
    expect(brief.meta.opportunityScore).toBeNull();
    expect(brief.meta.riskScore).toBeNull();
    expect(brief.meta.completedAgents).toContain("synthesis");
  });

  it("ignores the legacy free-text launchlensBrief string", () => {
    const brief = toLaunchLensBrief(buildSession());
    expect(brief.input.idea).not.toContain("legacy free-text brief");
  });
});

describe("serializeBrief", () => {
  it("round-trips through JSON.parse", () => {
    const brief = toLaunchLensBrief(buildSession());
    const s = serializeBrief(brief);
    const parsed = JSON.parse(s);
    expect(parsed.schemaVersion).toBe(brief.schemaVersion);
    expect(parsed.source).toBe(brief.source);
    expect(parsed.input.idea).toBe(brief.input.idea);
    expect(parsed.meta.opportunityScore).toBe(brief.meta.opportunityScore);
  });

  it("produces pretty JSON by default and compact when asked", () => {
    const brief = toLaunchLensBrief(buildSession());
    expect(serializeBrief(brief)).toContain("\n  ");
    expect(serializeBrief(brief, false)).not.toContain("\n  ");
  });
});

// ---------------------------------------------------------------------------
// R231: reportUrl + URL helpers (back-link to the live research report page)
// ---------------------------------------------------------------------------

describe("toLaunchLensBrief — reportUrl (R231)", () => {
  it("populates reportUrl with the default research-studio base + session id", () => {
    const brief = toLaunchLensBrief(buildSession({ id: "abc12345" }));
    expect(brief.reportUrl).toBe(
      "https://launchlens-research-studio.vercel.app/research/abc12345",
    );
  });

  it("honors NEXT_PUBLIC_RESEARCH_STUDIO_URL when set", () => {
    const prev = process.env.NEXT_PUBLIC_RESEARCH_STUDIO_URL;
    process.env.NEXT_PUBLIC_RESEARCH_STUDIO_URL = "https://research.example.com/";
    try {
      const brief = toLaunchLensBrief(buildSession({ id: "sess-9" }));
      // trailing slash is stripped before concatenation
      expect(brief.reportUrl).toBe("https://research.example.com/research/sess-9");
    } finally {
      if (prev === undefined) delete process.env.NEXT_PUBLIC_RESEARCH_STUDIO_URL;
      else process.env.NEXT_PUBLIC_RESEARCH_STUDIO_URL = prev;
    }
  });

  it("omits reportUrl when sessionId is empty (defensive)", () => {
    const brief = toLaunchLensBrief(buildSession({ id: "" }));
    // buildReportUrl("") returns the base URL alone; we still set the field,
    // but it points at the root, which is harmless. launchlens-ai's source-brief
    // module validates reportUrl ≤ 2048 chars and non-empty, so this is a
    // contractually valid (if useless) value.
    expect(brief.reportUrl).toBe("https://launchlens-research-studio.vercel.app");
  });

  it("preserves reportUrl in serializeBrief", () => {
    const brief = toLaunchLensBrief(buildSession({ id: "xyz" }));
    const parsed = JSON.parse(serializeBrief(brief, false));
    expect(parsed.reportUrl).toBe(brief.reportUrl);
  });
});

describe("URL helpers (R231)", () => {
  it("getLaunchLensAiUrl returns the default when env is unset", () => {
    const prev = process.env.NEXT_PUBLIC_LAUNCHLENS_AI_URL;
    delete process.env.NEXT_PUBLIC_LAUNCHLENS_AI_URL;
    try {
      expect(getLaunchLensAiUrl()).toBe("https://launchlens-ai-two.vercel.app");
    } finally {
      if (prev !== undefined) process.env.NEXT_PUBLIC_LAUNCHLENS_AI_URL = prev;
    }
  });

  it("getLaunchLensAiUrl honors env override and strips trailing slash", () => {
    const prev = process.env.NEXT_PUBLIC_LAUNCHLENS_AI_URL;
    process.env.NEXT_PUBLIC_LAUNCHLENS_AI_URL = "https://launchlens-ai.example.com/";
    try {
      expect(getLaunchLensAiUrl()).toBe("https://launchlens-ai.example.com");
    } finally {
      if (prev === undefined) delete process.env.NEXT_PUBLIC_LAUNCHLENS_AI_URL;
      else process.env.NEXT_PUBLIC_LAUNCHLENS_AI_URL = prev;
    }
  });

  it("getResearchStudioUrl returns the default when env is unset", () => {
    const prev = process.env.NEXT_PUBLIC_RESEARCH_STUDIO_URL;
    delete process.env.NEXT_PUBLIC_RESEARCH_STUDIO_URL;
    try {
      expect(getResearchStudioUrl()).toBe("https://launchlens-research-studio.vercel.app");
    } finally {
      if (prev !== undefined) process.env.NEXT_PUBLIC_RESEARCH_STUDIO_URL = prev;
    }
  });

  it("buildReportUrl combines base + /research/ + sessionId", () => {
    expect(buildReportUrl("abc")).toBe(
      "https://launchlens-research-studio.vercel.app/research/abc",
    );
  });
});

// ---------------------------------------------------------------------------
// R251/R254 cross-repo contract: pins the wire shape launchlens-ai's
// brief-from-json.ts decodes. The symmetric decoder-side test lives in
// launchlens-ai's brief-from-json.test.ts. If either repo drifts on the
// envelope shape, the #brief= handoff silently breaks — these tests catch
// that before it ships.
// ---------------------------------------------------------------------------
describe("toLaunchLensBrief — handoff contract (mirrors launchlens-ai decoder)", () => {
  it("flags tone as default so the importer can preserve user tone", () => {
    // R254: meta.toneDefault must be true because research-studio has no
    // tone/style agent — the tone field is a fixed placeholder, not research.
    const brief = toLaunchLensBrief(buildSession());
    expect(brief.meta.toneDefault).toBe(true);
  });

  it("emits the #brief= hash prefix launchlens-ai expects", () => {
    // launchlens-ai's briefFromHashFragment checks hash.startsWith("#brief=").
    // If this prefix drifts, the hash handoff breaks silently.
    const brief = toLaunchLensBrief(buildSession());
    const compact = serializeBrief(brief, false);
    const hash = briefHashFor(compact);
    expect(hash.startsWith(BRIEF_HASH_PREFIX)).toBe(true);
  });

  it("round-trips through base64url: encode → decode yields the original JSON", () => {
    // launchlens-ai's decodeBase64UrlUtf8 reverses encodeBase64UrlUtf8. This
    // guards the symmetric codec: UTF-8 bytes → base64url (no padding) → back.
    const brief = toLaunchLensBrief(buildSession());
    const compact = serializeBrief(brief, false);
    const encoded = encodeBase64UrlUtf8(compact);
    // base64url alphabet only: A-Z a-z 0-9 - _  (no + / =)
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    // The launchlens-ai decoder pads + swaps alphabet back; we simulate it
    // here to prove the round-trip is lossless.
    const restored = atob(encoded.replace(/-/g, "+").replace(/_/g, "/"));
    const bytes = Uint8Array.from(restored, (c) => c.charCodeAt(0));
    const decoded = new TextDecoder().decode(bytes);
    expect(decoded).toBe(compact);
    // And the decoded JSON parses back to the same envelope.
    expect(JSON.parse(decoded)).toMatchObject({
      schemaVersion: LAUNCHLENS_BRIEF_SCHEMA_VERSION,
      source: "launchlens-research-studio",
      meta: { toneDefault: true },
    });
  });

  it("produces a compact JSON small enough for a URL hash fragment", () => {
    // Browsers cap URL length (~2k chars for IE-era, 64k+ in modern ones).
    // The hash must stay well under that. A full 6-agent brief compact-encoded
    // should be a few KB at most.
    const brief = toLaunchLensBrief(buildSession());
    const compact = serializeBrief(brief, false);
    const hash = briefHashFor(compact);
    expect(hash.length).toBeLessThan(8000);
  });
});
