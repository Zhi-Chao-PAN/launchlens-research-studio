import { describe, it, expect } from "vitest";
import {
  extractCitations,
  buildCitationGraph,
  citationCoverage,
  findOrphanSources,
  findTopSources,
  balancedCoverage,
  renderInlineCitations,
  renderReferencesSection,
  citationHealthReport,
  graphToMermaid,
  mergeCitationGraphs,
} from "./citation-map";

function makeSyn(overrides = {}) {
  return {
    execSummary: "Summary with [1] and [2].",
    keyInsights: [
      { insight: "Insight from [1]." },
      { insight: "Cites [3] and [1]." },
    ],
    topThreeOpportunities: [
      { title: "O1", description: "Desc [2]", rationale: "Rat [1]" },
      { title: "O2", description: "none", rationale: "none" },
      { title: "O3", description: "[3]", rationale: "[2]" },
    ],
    topThreeRisks: [
      { title: "R1", description: "Risk [1]", mitigation: "Mit [2]" },
      { title: "R2", description: "none", mitigation: "none" },
    ],
    recommendedNextStep: "Next [1] and [3].",
    citations: [
      { url: "https://a.com", title: "A" },
      { url: "https://b.com", title: "B" },
      { url: "https://c.com", title: "C" },
    ],
    ...overrides,
  };
}

describe("extractCitations", () => {
  it("extracts 0-based indices", () => {
    expect(extractCitations("[1] and [2] plus [1] again")).toEqual([0, 1, 0]);
  });
  it("returns empty for empty/null", () => {
    expect(extractCitations("")).toEqual([]);
    expect(extractCitations(null)).toEqual([]);
  });
  it("ignores non-numeric or zero", () => {
    expect(extractCitations("[0] [abc] [1]")).toEqual([0]);
  });
});

describe("buildCitationGraph", () => {
  it("maps sources to sections", () => {
    const g = buildCitationGraph(makeSyn());
    expect(g.sourceToSections.get(0)).toContain("Executive Summary");
    expect(g.sourceToSections.get(0)).toContain("Key Insights");
    expect(g.sourceToSections.get(0)).toContain("Opportunities");
    expect(g.sourceToSections.get(0)).toContain("Risks");
    expect(g.sourceToSections.get(0)).toContain("Next Step");
    expect(g.sourceToSections.get(1)).toContain("Executive Summary");
    expect(g.sourceToSections.get(2)).toContain("Key Insights");
  });
  it("reverse maps sections to sources", () => {
    const g = buildCitationGraph(makeSyn());
    expect(g.sectionToSources.get("Risks")!.sort()).toEqual([0, 1]);
  });
  it("handles empty input", () => {
    const g = buildCitationGraph({ execSummary: "", keyInsights: [], topThreeOpportunities: [], topThreeRisks: [], recommendedNextStep: "" });
    expect(g.references.length).toBe(0);
    expect(g.sources.length).toBe(0);
  });
});

describe("citationCoverage", () => {
  it("counts refs per source", () => {
    const g = buildCitationGraph(makeSyn());
    const cov = citationCoverage(g);
    expect(cov).toHaveLength(3);
    const src0 = cov.find(c => c.sourceIndex === 0)!;
    expect(src0.sectionsCount).toBe(5);
    expect(src0.refCount).toBeGreaterThan(0);
  });
});

describe("findOrphanSources", () => {
  it("finds sources cited in 0 sections", () => {
    const g = buildCitationGraph(makeSyn({ citations: [
      { url: "https://a.com", title: "A" },
      { url: "https://b.com", title: "B" },
      { url: "https://c.com", title: "C" },
      { url: "https://d.com", title: "D" },
    ]}));
    const orphans = findOrphanSources(g, 0);
    expect(orphans).toContain(3);
  });
});

describe("findTopSources", () => {
  it("returns top N by ref count", () => {
    const g = buildCitationGraph(makeSyn());
    const top = findTopSources(g, 2);
    expect(top.length).toBe(2);
    expect(top[0].refCount).toBeGreaterThanOrEqual(top[1].refCount);
  });
});

describe("balancedCoverage", () => {
  it("returns 100 when all sources cited in >=N sections", () => {
    const g = buildCitationGraph(makeSyn());
    // source 2 cited in key ins/opps/next = 3 sections -> meets min 2
    // source 1 cited in summary/opps/risks = 3
    // source 0 cited everywhere
    expect(balancedCoverage(g, 2)).toBe(100);
  });
  it("returns 0 for empty graph", () => {
    const g = buildCitationGraph({ execSummary: "", keyInsights: [], topThreeOpportunities: [], topThreeRisks: [] });
    expect(balancedCoverage(g)).toBe(0);
  });
});

describe("renderInlineCitations", () => {
  it("converts [N] to footnotes", () => {
    expect(renderInlineCitations("see [1] and [2]")).toBe("see [^1] and [^2]");
  });
});

describe("renderReferencesSection", () => {
  it("renders numbered list", () => {
    const md = renderReferencesSection([{ title: "A", url: "https://a.com" }, { title: "B" }]);
    expect(md).toContain("[1]");
    expect(md).toContain("https://a.com");
    expect(md).toContain("[2]");
    expect(md).toContain("## References");
  });
});

describe("citationHealthReport", () => {
  it("has expected fields", () => {
    const g = buildCitationGraph(makeSyn());
    const h = citationHealthReport(g);
    expect(h.totalSources).toBe(3);
    expect(h.totalReferences).toBeGreaterThan(0);
    expect(h.citedSources).toBe(3);
    expect(h.orphanSources).toEqual([]);
    expect(h.topSources.length).toBeGreaterThan(0);
    expect(Array.isArray(h.sectionsMissingCitations)).toBe(true);
  });
});

describe("graphToMermaid", () => {
  it("emits a mermaid graph", () => {
    const g = buildCitationGraph(makeSyn());
    const m = graphToMermaid(g);
    expect(m.startsWith("graph LR")).toBe(true);
    expect(m).toContain("S0");
    expect(m).toContain("-->");
  });
});

describe("mergeCitationGraphs", () => {
  it("concatenates sources and offsets refs", () => {
    const a = buildCitationGraph(makeSyn());
    const b = buildCitationGraph(makeSyn());
    const m = mergeCitationGraphs([a, b]);
    expect(m.sources.length).toBe(6);
    // references from second graph should point into offset range 3..5
    const srcsFromB = m.references.filter(r => r.sourceIndex >= 3);
    expect(srcsFromB.length).toBeGreaterThan(0);
  });
});
