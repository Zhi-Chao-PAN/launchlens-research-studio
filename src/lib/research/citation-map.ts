/**
 * Citation map utilities (round 145).
 */

export interface CitationSource {
  index: number;
  url?: string;
  title?: string;
}

export interface CitationRef {
  sourceIndex: number;
  section: string;
  field?: string;
  count: number;
}

export interface CitationGraph {
  sources: CitationSource[];
  references: CitationRef[];
  sourceToSections: Map<number, string[]>;
  sectionToSources: Map<string, number[]>;
}

const DEFAULT_SECTIONS = [
  "Executive Summary",
  "Key Insights",
  "Opportunities",
  "Risks",
  "Next Step",
];

const CITE_RE = /\[(\d+)\]/g;

export function extractCitations(text: string | undefined | null): number[] {
  if (!text) return [];
  const out: number[] = [];
  // matchAll is allocation-free (no per-call RegExp construction) and
  // sidesteps the lastIndex trap that a shared /g regex would expose.
  for (const m of text.matchAll(CITE_RE)) {
    const n = parseInt(m[1], 10);
    if (!Number.isNaN(n) && n >= 1) out.push(n - 1);
  }
  return out;
}

interface SynthLike {
  execSummary?: string;
  keyInsights?: Array<{ insight?: string }>;
  topThreeOpportunities?: Array<{ title?: string; description?: string; rationale?: string }>;
  topThreeRisks?: Array<{ title?: string; description?: string; mitigation?: string }>;
  recommendedNextStep?: string;
  citations?: Array<{ url?: string; title?: string }>;
}

export function buildCitationGraph(syn: SynthLike): CitationGraph {
  const cits: Array<{ url?: string; title?: string }> = syn.citations || [];
  const sourceMeta: CitationSource[] = cits.map((c, i) => ({ index: i, url: c.url, title: c.title }));

  const refs: CitationRef[] = [];
  const src2sec: Map<number, Set<string>> = new Map();
  const sec2src: Map<string, Set<number>> = new Map();

  function add(sec: string, field: string, text: string | undefined): void {
    const cites = extractCitations(text);
    if (cites.length === 0) return;
    const counts = new Map<number, number>();
    cites.forEach(idx => counts.set(idx, (counts.get(idx) || 0) + 1));
    counts.forEach((count, idx) => {
      refs.push({ sourceIndex: idx, section: sec, field, count });
      if (!src2sec.has(idx)) src2sec.set(idx, new Set());
      src2sec.get(idx)!.add(sec);
      if (!sec2src.has(sec)) sec2src.set(sec, new Set());
      sec2src.get(sec)!.add(idx);
    });
  }

  add("Executive Summary", "summary", syn.execSummary);
  (syn.keyInsights || []).forEach((ki, i) => add("Key Insights", "insight[" + i + "]", ki.insight));
  (syn.topThreeOpportunities || []).forEach((o, i) => {
    add("Opportunities", "opp[" + i + "].title", o.title);
    add("Opportunities", "opp[" + i + "].description", o.description);
    add("Opportunities", "opp[" + i + "].rationale", o.rationale);
  });
  (syn.topThreeRisks || []).forEach((r, i) => {
    add("Risks", "risk[" + i + "].title", r.title);
    add("Risks", "risk[" + i + "].description", r.description);
    add("Risks", "risk[" + i + "].mitigation", r.mitigation);
  });
  add("Next Step", "nextStep", syn.recommendedNextStep);

  const sourceToSections = new Map<number, string[]>();
  src2sec.forEach((v, k) => sourceToSections.set(k, Array.from(v)));
  const sectionToSources = new Map<string, number[]>();
  sec2src.forEach((v, k) => {
    const arr = Array.from(v);
    arr.sort((a, b) => a - b);
    sectionToSources.set(k, arr);
  });

  return { sources: sourceMeta, references: refs, sourceToSections, sectionToSources };
}

export function citationCoverage(graph: CitationGraph): Array<{ sourceIndex: number; sectionsCount: number; refCount: number }> {
  const refCountBySrc = new Map<number, number>();
  graph.references.forEach(r => refCountBySrc.set(r.sourceIndex, (refCountBySrc.get(r.sourceIndex) || 0) + r.count));
  return graph.sources.map(s => ({
    sourceIndex: s.index,
    sectionsCount: graph.sourceToSections.get(s.index)?.length || 0,
    refCount: refCountBySrc.get(s.index) || 0,
  }));
}

export function findOrphanSources(graph: CitationGraph, threshold = 0): number[] {
  return graph.sources
    .filter(s => (graph.sourceToSections.get(s.index)?.length || 0) <= threshold)
    .map(s => s.index);
}

export function findTopSources(graph: CitationGraph, limit = 3): Array<{ sourceIndex: number; refCount: number; sections: string[] }> {
  const counts = citationCoverage(graph);
  return counts
    .slice()
    .sort((a, b) => b.refCount - a.refCount)
    .slice(0, limit)
    .map(c => ({
      sourceIndex: c.sourceIndex,
      refCount: c.refCount,
      sections: graph.sourceToSections.get(c.sourceIndex) || [],
    }));
}

export function balancedCoverage(graph: CitationGraph, minSections = 2): number {
  if (graph.sources.length === 0) return 0;
  const covered = graph.sources.filter(s => (graph.sourceToSections.get(s.index)?.length || 0) >= minSections).length;
  return Math.round((covered / graph.sources.length) * 100);
}

export function renderInlineCitations(text: string): string {
  return text.replace(CITE_RE, (_m, n) => "[^" + n + "]");
}

export function renderReferencesSection(sources: Array<{ url?: string; title?: string }>): string {
  const lines = ["## References", ""];
  sources.forEach((s, i) => {
    const n = i + 1;
    const title = s.title || "Source " + n;
    if (s.url) lines.push("- [" + n + "] " + title + " - " + s.url);
    else lines.push("- [" + n + "] " + title);
  });
  return lines.join("\n");
}

export interface CitationHealthReport {
  totalSources: number;
  totalReferences: number;
  citedSources: number;
  orphanSources: number[];
  coveragePercent: number;
  sectionsMissingCitations: string[];
  topSources: Array<{ sourceIndex: number; refCount: number; sections: string[] }>;
}

export function citationHealthReport(graph: CitationGraph): CitationHealthReport {
  let totalReferences = 0;
  graph.references.forEach(r => { totalReferences += r.count; });
  const cited = new Set<number>();
  graph.references.forEach(r => cited.add(r.sourceIndex));
  const orphans = findOrphanSources(graph, 0);
  const sectionsMissing: string[] = [];
  DEFAULT_SECTIONS.forEach(s => {
    const srcs = graph.sectionToSources.get(s);
    if (!srcs || srcs.length === 0) sectionsMissing.push(s);
  });
  return {
    totalSources: graph.sources.length,
    totalReferences,
    citedSources: cited.size,
    orphanSources: orphans,
    coveragePercent: balancedCoverage(graph, 1),
    sectionsMissingCitations: sectionsMissing,
    topSources: findTopSources(graph, 3),
  };
}

export function graphToMermaid(graph: CitationGraph): string {
  const lines = ["graph LR"];
  graph.sources.forEach(s => {
    const label = "[" + (s.index + 1) + "] " + (s.title || "Source").slice(0, 24);
    lines.push("  S" + s.index + '["' + label + '"]');
  });
  graph.sectionToSources.forEach((srcs, sec) => {
    const secId = "SEC_" + sec.replace(/[^A-Za-z0-9]/g, "_");
    lines.push("  " + secId + '["' + sec + '"]');
    srcs.forEach(si => lines.push("  S" + si + " --> " + secId));
  });
  return lines.join("\n");
}

export function mergeCitationGraphs(graphs: CitationGraph[]): CitationGraph {
  const allSources: CitationSource[] = [];
  const srcOffset: number[] = [];
  let counter = 0;
  graphs.forEach(g => {
    srcOffset.push(counter);
    g.sources.forEach(s => allSources.push({ ...s, index: counter++ }));
  });
  const combined: CitationGraph = {
    sources: allSources,
    references: [],
    sourceToSections: new Map(),
    sectionToSources: new Map(),
  };
  graphs.forEach((g, gi) => {
    const off = srcOffset[gi];
    g.references.forEach(r => combined.references.push({ ...r, sourceIndex: r.sourceIndex + off }));
    g.sourceToSections.forEach((secs, si) => {
      const k = si + off;
      if (!combined.sourceToSections.has(k)) combined.sourceToSections.set(k, []);
      const existing = combined.sourceToSections.get(k)!;
      secs.forEach(sec => { if (!existing.includes(sec)) existing.push(sec); });
    });
    g.sectionToSources.forEach((srcs, sec) => {
      if (!combined.sectionToSources.has(sec)) combined.sectionToSources.set(sec, []);
      const existing = combined.sectionToSources.get(sec)!;
      srcs.forEach(si => {
        const k = si + off;
        if (!existing.includes(k)) existing.push(k);
      });
    });
  });
  return combined;
}
