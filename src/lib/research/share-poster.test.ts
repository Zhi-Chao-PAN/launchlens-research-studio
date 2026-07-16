import { describe, expect, it } from "vitest";
import {
  SHARE_POSTER_HEIGHT,
  SHARE_POSTER_CONTENT_BOTTOM,
  SHARE_POSTER_SCALE,
  SHARE_POSTER_WIDTH,
  buildSharePosterModel,
  posterFilename,
  qrDataUrl,
  renderSharePoster,
  selectSharePosterContentLayout,
  wrapPosterText,
  type SharePosterInput,
} from "@/lib/research/share-poster";

const baseInput: SharePosterInput = {
  url: "https://launchlens-research-studio.vercel.app/share/public-token",
  query: "A bilingual AI research workspace for APAC SaaS founders",
  locale: "zh-CN",
  sections: ["summary", "scores", "insights", "nextStep", "sources"],
  synthesis: {
    execSummary: "The market is growing, but trust and evidence quality determine willingness to pay.",
    opportunityScore: 82,
    riskScore: 37,
    keyInsights: [
      { insight: "Founders pay for decisions they can defend." },
      { title: "Incumbent gap", text: "Most tools do not preserve an auditable evidence trail." },
    ],
    topThreeOpportunities: [
      { title: "Bilingual wedge", description: "Own the APAC evidence workflow." },
    ],
    topThreeRisks: [
      { title: "Trust gap", description: "Weak sourcing erodes adoption." },
    ],
    recommendedNextStep: "Interview ten bilingual founders and test a paid research concierge.",
    citations: [{ id: "a" }, { id: "b" }, { id: "c" }],
  },
};

describe("share-poster model", () => {
  it("builds a deterministic, selected-content-only model", () => {
    const model = buildSharePosterModel({
      ...baseInput,
      sections: ["summary", "scores", "summary", "sources", "unknown" as "summary"],
    });

    expect(model.width).toBe(1080);
    expect(model.height).toBe(1440);
    expect(model.scale).toBe(2);
    expect(model.sections).toEqual(["summary", "scores", "sources"]);
    expect(model.summary).toContain("trust and evidence quality");
    expect(model.scores).toEqual({ opportunity: 82, risk: 37 });
    expect(model.insights).toEqual([]);
    expect(model.opportunities).toEqual([]);
    expect(model.risks).toEqual([]);
    expect(model.nextStep).toBeNull();
    expect(model.sourceCount).toBe(3);
    expect(model.host).toBe("launchlens-research-studio.vercel.app");
    expect(model.copy.scan).toContain("扫码");
  });

  it("keeps opportunity-only and risk-only custom posters populated", () => {
    const model = buildSharePosterModel({
      ...baseInput,
      sections: ["opportunities", "risks"],
    });

    expect(model.summary).toBeNull();
    expect(model.scores).toBeNull();
    expect(model.insights).toEqual([]);
    expect(model.opportunities).toEqual([
      "Bilingual wedge: Own the APAC evidence workflow.",
    ]);
    expect(model.risks).toEqual([
      "Trust gap: Weak sourcing erodes adoption.",
    ]);
    expect(model.nextStep).toBeNull();
  });

  it.each(["en-US", "zh-CN"])(
    "keeps a three-line full-report %s poster above the fixed QR footer",
    (locale) => {
      const model = buildSharePosterModel({
        ...baseInput,
        locale,
        query: "A deliberately long bilingual university research collaboration workspace title that occupies all three poster title lines",
        sections: ["summary", "scores", "insights", "opportunities", "risks", "nextStep", "sources"],
      });
      // 250 is the maximum header bottom after a three-line title.
      const layout = selectSharePosterContentLayout(model, 250);

      expect(layout.density).toBe("compact");
      expect(layout.estimatedBottom).toBeLessThanOrEqual(SHARE_POSTER_CONTENT_BOTTOM);
      expect(layout.nextStepLines).toBe(1);
    },
  );

  it("accepts direct poster fields and clamps unsafe score/count values", () => {
    const model = buildSharePosterModel({
      ...baseInput,
      locale: "en-US",
      sections: ["scores", "insights", "nextStep", "sources"],
      scores: { opportunity: 140, risk: -8 },
      insights: ["  Evidence wins trust.  ", { text: "A second insight" }, { text: "   " }],
      nextStep: "  Run a paid pilot.  ",
      sourceCount: 12.9,
    });

    expect(model.locale).toBe("en");
    expect(model.scores).toEqual({ opportunity: 100, risk: 0 });
    expect(model.insights).toEqual(["Evidence wins trust.", "A second insight"]);
    expect(model.nextStep).toBe("Run a paid pilot.");
    expect(model.sourceCount).toBe(12);
    expect(model.copy.scan).toContain("Scan");
  });

  it("rejects non-http share URLs before they can reach a QR code", () => {
    expect(() => buildSharePosterModel({ ...baseInput, url: "javascript:alert(1)" })).toThrow(
      /http or https/i,
    );
    expect(() => buildSharePosterModel({ ...baseInput, url: "/share/relative" })).toThrow(
      /absolute/i,
    );
  });
});

describe("share-poster pure helpers", () => {
  const monospaceMeasure = (value: string) => Array.from(value).length * 10;

  it("wraps CJK text without requiring spaces", () => {
    const wrapped = wrapPosterText("市场机会与竞争格局分析", monospaceMeasure, 40, 10);

    expect(wrapped.truncated).toBe(false);
    expect(wrapped.lines.length).toBeGreaterThan(1);
    expect(wrapped.lines.join("")).toBe("市场机会与竞争格局分析");
    expect(wrapped.lines.every((line) => monospaceMeasure(line) <= 40)).toBe(true);
  });

  it("keeps English words together when they fit", () => {
    const wrapped = wrapPosterText("market research intelligence", monospaceMeasure, 120, 10);

    expect(wrapped.truncated).toBe(false);
    expect(wrapped.lines).toEqual(["market", "research", "intelligence"]);
  });

  it("truncates to the line budget with a fitting ellipsis", () => {
    const wrapped = wrapPosterText("1234567890", monospaceMeasure, 30, 2);

    expect(wrapped).toEqual({ lines: ["123", "45…"], truncated: true });
    expect(monospaceMeasure(wrapped.lines.at(-1) ?? "")).toBeLessThanOrEqual(30);
  });

  it("creates filesystem-safe localized filenames while preserving CJK", () => {
    expect(posterFilename("  AI / 市场:机会? *  ", "zh-CN")).toBe(
      "LaunchLens-AI-市场-机会-调研海报.png",
    );
    expect(posterFilename("   ", "en")).toBe("LaunchLens-research-poster.png");
  });

  it("publishes a 2x, 3:4 social poster contract", () => {
    expect(SHARE_POSTER_WIDTH).toBe(1080);
    expect(SHARE_POSTER_HEIGHT).toBe(1440);
    expect(SHARE_POSTER_SCALE).toBe(2);
    expect(SHARE_POSTER_WIDTH / SHARE_POSTER_HEIGHT).toBe(0.75);
  });
});

describe("share-poster browser boundaries", () => {
  it("generates a self-contained PNG QR without an online QR service", async () => {
    const result = await qrDataUrl(baseInput.url);
    const encoded = result.slice(result.indexOf(",") + 1);
    const bytes = Buffer.from(encoded, "base64");

    expect(result.startsWith("data:image/png;base64,")).toBe(true);
    expect([...bytes.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(bytes.byteLength).toBeGreaterThan(500);
  });

  it("fails explicitly during SSR instead of partially rendering a poster", async () => {
    await expect(renderSharePoster(baseInput)).rejects.toThrow(/browser Canvas/i);
  });
});
