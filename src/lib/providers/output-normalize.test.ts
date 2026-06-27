import { describe, it, expect } from "vitest";
import { normalizeAgentOutput } from "./output-normalize";
import type { AgentOutput } from "@/lib/schema/research-schema";

/** Cast helper for tests: we *know* the agent id at the call site, but
 *  the union return type makes narrow field access awkward. */
const asAny = (v: AgentOutput): unknown => v as unknown;

/**
 * R210: The validator only checks top-level field presence, so partial /
 * malformed nested structures from a real LLM would crash the UI on field
 * access (e.g. `config[undefined].bg`, `undefined.toFixed()`, `arr.length`
 * on undefined). normalizeAgentOutput must guarantee the output is safe to
 * render even when the LLM returns incomplete nested data.
 */
describe("normalizeAgentOutput (R210 defensive backstop)", () => {
  describe("market-sizer", () => {
    it("fills safe defaults when marketSize is entirely missing", () => {
      const out = asAny(normalizeAgentOutput("market-sizer", { agent: "market-sizer", summary: "ok" })) as {
        marketSize: { tam: number; sam: number; som: number; currency: string; growthRate: number; confidence: string };
      };
      // The UI reads data.marketSize.tam/sam/som/currency/growthRate/confidence.
      // Without normalization, the report would throw on `tam.toFixed()`.
      expect(out.marketSize.tam).toBe(0);
      expect(out.marketSize.sam).toBe(0);
      expect(out.marketSize.som).toBe(0);
      expect(out.marketSize.currency).toBe("USD");
      expect(out.marketSize.growthRate).toBe(0);
      expect(out.marketSize.confidence).toBe("low");
    });

    it("coerces an invalid confidence string to 'low'", () => {
      const out = asAny(normalizeAgentOutput("market-sizer", {
        agent: "market-sizer",
        marketSize: { tam: 1, sam: 1, som: 1, confidence: "garbage" },
      })) as { marketSize: { confidence: string } };
      expect(out.marketSize.confidence).toBe("low");
    });

    it("clamps sam > tam so the bar widths don't invert", () => {
      const out = asAny(normalizeAgentOutput("market-sizer", {
        agent: "market-sizer",
        marketSize: { tam: 100, sam: 999, som: 0 },
      })) as { marketSize: { sam: number; som: number } };
      expect(out.marketSize.sam).toBe(100);
    });

    it("treats an array of half-formed trends as a real iterable", () => {
      const out = asAny(normalizeAgentOutput("market-sizer", {
        agent: "market-sizer",
        keyTrends: [
          { trend: "real one", impact: "positive", evidence: "yes" },
          { trend: "garbage impact" }, // missing impact + evidence
          "not even an object",
          null,
        ],
      })) as { keyTrends: { trend: string; impact: string; evidence: string }[] };
      expect(out.keyTrends).toHaveLength(4);
      expect(out.keyTrends[0].trend).toBe("real one");
      expect(out.keyTrends[1].impact).toBe("neutral"); // illegal → neutral
      expect(out.keyTrends[1].evidence).toBe("");
      // The string/null entries become empty objects; the report's `.map()`
      // must not throw on them.
      expect(() => out.keyTrends.forEach(() => null)).not.toThrow();
    });
  });

  describe("competitor-analyst", () => {
    it("fills defaults for competitors that only have a name", () => {
      const out = asAny(normalizeAgentOutput("competitor-analyst", {
        agent: "competitor-analyst",
        competitors: [{ name: "X" }],
      })) as { competitors: { name: string; strengths: unknown[]; weaknesses: unknown[]; pricing: { min: number; max: number; currency: string }; positioning: string; differentiation: string }[] };
      // The UI reads comp.strengths.length, comp.pricing.min/max/currency,
      // comp.positioning, comp.differentiation.
      expect(out.competitors[0].strengths).toEqual([]);
      expect(out.competitors[0].weaknesses).toEqual([]);
      expect(out.competitors[0].pricing.min).toBe(0);
      expect(out.competitors[0].pricing.max).toBe(0);
      expect(out.competitors[0].pricing.currency).toBe("USD");
      expect(out.competitors[0].positioning).toBe("niche");
      expect(out.competitors[0].differentiation).toBe("");
    });

    it("coerces invalid positioning to 'niche'", () => {
      const out = asAny(normalizeAgentOutput("competitor-analyst", {
        agent: "competitor-analyst",
        competitors: [{ name: "X", positioning: "luxury" }],
      })) as { competitors: { positioning: string }[] };
      expect(out.competitors[0].positioning).toBe("niche");
    });

    it("normalizes missing gaps array to [] (UI iterates it)", () => {
      const out = asAny(normalizeAgentOutput("competitor-analyst", { agent: "competitor-analyst" })) as { gaps: unknown[] };
      expect(out.gaps).toEqual([]);
      expect(() => out.gaps.map(() => null)).not.toThrow();
    });
  });

  describe("pain-detective", () => {
    it("fills pain point defaults and coerces frequency/severity", () => {
      const out = asAny(normalizeAgentOutput("pain-detective", {
        agent: "pain-detective",
        painPoints: [{ id: "p1", pain: "real pain", frequency: "rarely", severity: "extreme" }],
      })) as { painPoints: { frequency: string; severity: string; quotes: unknown[]; userSegments: unknown[] }[] };
      expect(out.painPoints[0].frequency).toBe("occasional");
      expect(out.painPoints[0].severity).toBe("mild");
      expect(out.painPoints[0].quotes).toEqual([]);
      expect(out.painPoints[0].userSegments).toEqual([]);
    });

    it("normalizes missing userPersonas/unmetNeeds to [] (UI reads .length and iterates)", () => {
      const out = asAny(normalizeAgentOutput("pain-detective", { agent: "pain-detective" })) as { userPersonas: unknown[]; unmetNeeds: unknown[] };
      expect(out.userPersonas).toEqual([]);
      expect(out.unmetNeeds).toEqual([]);
      expect(() => out.userPersonas.map(() => null)).not.toThrow();
      expect(() => out.unmetNeeds.map(() => null)).not.toThrow();
    });
  });

  describe("pricing-scout", () => {
    it("fills priceBands defaults and guards against NaN propagation", () => {
      const out = asAny(normalizeAgentOutput("pricing-scout", {
        agent: "pricing-scout",
        priceBands: [{ name: "B" }, { name: "Mid" }, { name: "Premium" }],
      })) as { priceBands: { name: string; min: number; max: number; typical: number }[] };
      // UI does Math.max(...bands.map(b => b.max)) then divides by it; if
      // any max is NaN the whole bar chart blows up.
      for (const b of out.priceBands) {
        expect(Number.isFinite(b.min)).toBe(true);
        expect(Number.isFinite(b.max)).toBe(true);
        expect(Number.isFinite(b.typical)).toBe(true);
      }
    });

    it("normalizes missing recommendations/monetizationModels/willingnessToPay to []", () => {
      const out = asAny(normalizeAgentOutput("pricing-scout", { agent: "pricing-scout" })) as {
        recommendations: unknown[];
        monetizationModels: { examples: string[] }[];
        willingnessToPay: unknown[];
      };
      expect(out.recommendations).toEqual([]);
      expect(out.monetizationModels).toEqual([]);
      expect(out.willingnessToPay).toEqual([]);
      // pricing-scout report joins m.examples — must not throw.
      expect(() => out.monetizationModels.map((m) => m.examples.join(", "))).not.toThrow();
    });

    it("coerces invalid confidence on willingnessToPay entries", () => {
      const out = asAny(normalizeAgentOutput("pricing-scout", {
        agent: "pricing-scout",
        willingnessToPay: [{ segment: "S", estimate: 100, confidence: "maybe" }],
      })) as { willingnessToPay: { confidence: string }[] };
      expect(out.willingnessToPay[0].confidence).toBe("low");
    });
  });

  describe("channel-scout", () => {
    it("fills channel defaults and coerces enums", () => {
      const out = asAny(normalizeAgentOutput("channel-scout", {
        agent: "channel-scout",
        channels: [{ name: "X", category: "weird", reach: "huge", cost: "free", effectiveness: "maybe" }],
      })) as { channels: { category: string; reach: string; cost: string; effectiveness: string; keyPlatforms: unknown[] }[] };
      expect(out.channels[0].category).toBe("direct");
      expect(out.channels[0].reach).toBe("moderate");
      expect(out.channels[0].cost).toBe("medium");
      expect(out.channels[0].effectiveness).toBe("unknown");
      expect(out.channels[0].keyPlatforms).toEqual([]);
    });

    it("normalizes missing recommendedChannels/contentTopics/communityHubs to []", () => {
      const out = asAny(normalizeAgentOutput("channel-scout", { agent: "channel-scout" })) as {
        recommendedChannels: unknown[];
        contentTopics: unknown[];
        communityHubs: unknown[];
      };
      expect(out.recommendedChannels).toEqual([]);
      expect(out.contentTopics).toEqual([]);
      expect(out.communityHubs).toEqual([]);
      // The report calls .map on these arrays.
      expect(() => out.contentTopics.map(() => null)).not.toThrow();
      expect(() => out.recommendedChannels.map(() => null)).not.toThrow();
    });
  });

  describe("synthesis", () => {
    it("clamps opportunityScore/riskScore to 0-100", () => {
      const out = asAny(normalizeAgentOutput("synthesis", {
        agent: "synthesis",
        opportunityScore: 250,
        riskScore: -50,
      })) as { opportunityScore: number; riskScore: number };
      expect(out.opportunityScore).toBe(100);
      expect(out.riskScore).toBe(0);
    });

    it("coerces NaN scores to 0 (UI donut would render blank or break)", () => {
      const out = asAny(normalizeAgentOutput("synthesis", {
        agent: "synthesis",
        opportunityScore: Number.NaN,
        riskScore: "not a number" as unknown as number,
      })) as { opportunityScore: number; riskScore: number };
      expect(out.opportunityScore).toBe(0);
      expect(out.riskScore).toBe(0);
    });

    it("fills defaults for topThreeOpportunities/Risks and keyInsights", () => {
      const out = asAny(normalizeAgentOutput("synthesis", {
        agent: "synthesis",
        topThreeOpportunities: [{}],
        topThreeRisks: [{}],
        keyInsights: [{}],
      })) as {
        topThreeOpportunities: { title: string; description: string; rationale: string }[];
        topThreeRisks: { title: string; description: string; mitigation: string }[];
        keyInsights: { insight: string; supportingAgents: string[]; confidence: string }[];
      };
      expect(out.topThreeOpportunities[0].title).toBe("Untitled opportunity");
      expect(out.topThreeOpportunities[0].description).toBe("");
      expect(out.topThreeOpportunities[0].rationale).toBe("");
      expect(out.topThreeRisks[0].title).toBe("Untitled risk");
      expect(out.topThreeRisks[0].mitigation).toBe("");
      expect(out.keyInsights[0].insight).toBe("");
      expect(out.keyInsights[0].supportingAgents).toEqual([]);
      expect(out.keyInsights[0].confidence).toBe("low");
    });

    it("normalizes missing arrays to [] so .map on insights works", () => {
      const out = asAny(normalizeAgentOutput("synthesis", { agent: "synthesis" })) as {
        keyInsights: unknown[];
        topThreeOpportunities: unknown[];
        topThreeRisks: unknown[];
        citations: unknown[];
      };
      expect(out.keyInsights).toEqual([]);
      expect(out.topThreeOpportunities).toEqual([]);
      expect(out.topThreeRisks).toEqual([]);
      expect(out.citations).toEqual([]);
    });
  });

  describe("SourceCitation", () => {
    it("fills citation defaults (id/title/snippet are required, accessedAt defaults to now)", () => {
      const out = asAny(normalizeAgentOutput("market-sizer", {
        agent: "market-sizer",
        citations: [{}],
      })) as { citations: { id: string; title: string; snippet: string; accessedAt: string; confidence: string }[] };
      expect(out.citations[0].id).toBe("c");
      expect(out.citations[0].title).toBe("Untitled source");
      expect(out.citations[0].snippet).toBe("");
      expect(typeof out.citations[0].accessedAt).toBe("string");
      expect(out.citations[0].confidence).toBe("low");
    });

    it("preserves a valid url when present", () => {
      const out = asAny(normalizeAgentOutput("market-sizer", {
        agent: "market-sizer",
        citations: [{ id: "c1", title: "T", snippet: "S", url: "https://example.com" }],
      })) as { citations: { url?: string }[] };
      expect(out.citations[0].url).toBe("https://example.com");
    });

    it("omits url when empty/missing (not an empty string key)", () => {
      const out = asAny(normalizeAgentOutput("market-sizer", {
        agent: "market-sizer",
        citations: [{ id: "c1", title: "T", snippet: "S", url: "" }],
      })) as { citations: { url?: string }[] };
      expect(out.citations[0].url).toBeUndefined();
    });
  });

  it("forces agent field to the requested id even if LLM set the wrong one", () => {
    const out = asAny(normalizeAgentOutput("market-sizer", { agent: "wrong" }));
    expect((out as { agent: string }).agent).toBe("market-sizer");
  });

  it("handles a non-object input without throwing", () => {
    // A worst-case LLM that returns just a string/number/array must not
    // throw inside normalize — the validator would have already rejected
    // it, but the validator calls normalize so the defense must be tight.
    expect(() => normalizeAgentOutput("market-sizer", null)).not.toThrow();
    expect(() => normalizeAgentOutput("market-sizer", "garbage")).not.toThrow();
    expect(() => normalizeAgentOutput("market-sizer", [1, 2, 3])).not.toThrow();
  });
});
