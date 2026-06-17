/**
 * Source overlap analysis for comparing research results.
 * Computes shared sources, domain overlap, and coverage metrics.
 */

export interface SourceOverlapResult {
  totalA: number;
  totalB: number;
  shared: number;
  onlyA: number;
  onlyB: number;
  jaccardSimilarity: number; // 0-1
  sharedDomains: string[];
  domainsOnlyA: string[];
  domainsOnlyB: string[];
  sharedSources: Array<{ title?: string; url: string }>;
  onlyASources: Array<{ title?: string; url: string }>;
  onlyBSources: Array<{ title?: string; url: string }>;
}

function extractDomain(url: string): string {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, "");
  } catch {
    return "unknown";
  }
}

function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    // Normalize: remove trailing slash, lowercase hostname, strip common tracking params
    let pathname = u.pathname.replace(/\/+$/, "");
    if (pathname === "") pathname = "/";
    return (u.hostname.replace(/^www\./, "") + pathname).toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

export function computeSourceOverlap(
  sourcesA: Array<{ title?: string; url: string }>,
  sourcesB: Array<{ title?: string; url: string }>
): SourceOverlapResult {
  const a = sourcesA || [];
  const b = sourcesB || [];

  const normalizedA = a.map((s) => ({ ...s, key: normalizeUrl(s.url) }));
  const normalizedB = b.map((s) => ({ ...s, key: normalizeUrl(s.url) }));

  const keysA = new Set(normalizedA.map((s) => s.key));
  const keysB = new Set(normalizedB.map((s) => s.key));

  const sharedKeys = new Set([...keysA].filter((k) => keysB.has(k)));
  const onlyAKeys = new Set([...keysA].filter((k) => !keysB.has(k)));
  const onlyBKeys = new Set([...keysB].filter((k) => !keysA.has(k)));

  const sharedSources = normalizedA.filter((s) => sharedKeys.has(s.key));
  const onlyASources = normalizedA.filter((s) => onlyAKeys.has(s.key));
  const onlyBSources = normalizedB.filter((s) => onlyBKeys.has(s.key));

  // Domain-level analysis
  const domainsA = new Set(a.map((s) => extractDomain(s.url)));
  const domainsB = new Set(b.map((s) => extractDomain(s.url)));
  const sharedDomains = [...domainsA].filter((d) => domainsB.has(d)).sort();
  const domainsOnlyA = [...domainsA].filter((d) => !domainsB.has(d)).sort();
  const domainsOnlyB = [...domainsB].filter((d) => !domainsA.has(d)).sort();

  // Jaccard similarity
  const union = new Set([...keysA, ...keysB]);
  const jaccard = union.size === 0 ? 0 : sharedKeys.size / union.size;

  return {
    totalA: a.length,
    totalB: b.length,
    shared: sharedKeys.size,
    onlyA: onlyAKeys.size,
    onlyB: onlyBKeys.size,
    jaccardSimilarity: jaccard,
    sharedDomains,
    domainsOnlyA,
    domainsOnlyB,
    sharedSources,
    onlyASources,
    onlyBSources,
  };
}

export default computeSourceOverlap;

/* ------------------------------------------------------------------ */
/*  Source deduplication                                               */
/* ------------------------------------------------------------------ */

export function deduplicateSources(sources: Array<{ title?: string; url: string }>): Array<{ title?: string; url: string }> {
  const seen = new Map<string, { title?: string; url: string }>();
  for (const s of sources || []) {
    const key = normalizeUrl(s.url);
    if (!seen.has(key)) {
      seen.set(key, s);
    } else {
      const existing = seen.get(key)!;
      if (!existing.title && s.title) seen.set(key, s);
    }
  }
  return [...seen.values()];
}

export function findDuplicateSources(sources: Array<{ title?: string; url: string }>): Array<{ url: string; count: number; sources: Array<{ title?: string; url: string }> }> {
  const groups = new Map<string, Array<{ title?: string; url: string }>>();
  for (const s of sources || []) {
    const key = normalizeUrl(s.url);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(s);
  }
  const result: Array<{ url: string; count: number; sources: Array<{ title?: string; url: string }> }> = [];
  for (const [key, items] of groups) {
    if (items.length > 1) {
      result.push({ url: key, count: items.length, sources: items });
    }
  }
  return result.sort((a, b) => b.count - a.count);
}

/* ------------------------------------------------------------------ */
/*  Domain frequency analysis                                          */
/* ------------------------------------------------------------------ */

export interface DomainFrequency {
  domain: string;
  count: number;
  percentage: number;
}

export function getDomainFrequency(sources: Array<{ title?: string; url: string }>, topN?: number): DomainFrequency[] {
  const counts = new Map<string, number>();
  const total = (sources || []).length;
  for (const s of sources || []) {
    const d = extractDomain(s.url);
    counts.set(d, (counts.get(d) || 0) + 1);
  }
  let result: DomainFrequency[] = [...counts.entries()].map(([domain, count]) => ({
    domain, count,
    percentage: total > 0 ? Math.round((count / total) * 10000) / 100 : 0,
  }));
  result.sort((a, b) => b.count - a.count);
  if (topN) result = result.slice(0, topN);
  return result;
}

export function getTopDomains(sources: Array<{ title?: string; url: string }>, n: number = 5): string[] {
  return getDomainFrequency(sources, n).map((d) => d.domain);
}

/* ------------------------------------------------------------------ */
/*  Coverage and diversity scores                                      */
/* ------------------------------------------------------------------ */

export interface SourceDiversityMetrics {
  totalSources: number;
  uniqueDomains: number;
  domainDiversityScore: number; // 0-1, higher = more diverse
  concentrationRatio: number; // % from top domain
  isHighlyConcentrated: boolean;
  hasDeduplicatedDuplicates: boolean;
  duplicateCount: number;
}

export function computeSourceDiversity(sources: Array<{ title?: string; url: string }>): SourceDiversityMetrics {
  const cleaned = deduplicateSources(sources || []);
  const domains = getDomainFrequency(cleaned);
  const total = cleaned.length;
  const uniqueDomains = domains.length;
  const domainDiversityScore = total > 1 ? uniqueDomains / total : 0;
  const topCount = domains[0]?.count || 0;
  const concentrationRatio = total > 0 ? topCount / total : 0;
  const duplicates = findDuplicateSources(sources || []);
  const duplicateCount = duplicates.reduce((sum, d) => sum + d.count - 1, 0);
  return {
    totalSources: total,
    uniqueDomains,
    domainDiversityScore: Math.round(domainDiversityScore * 10000) / 10000,
    concentrationRatio: Math.round(concentrationRatio * 10000) / 10000,
    isHighlyConcentrated: concentrationRatio > 0.5,
    hasDeduplicatedDuplicates: duplicateCount > 0,
    duplicateCount,
  };
}

/* ------------------------------------------------------------------ */
/*  Overlap summary / recommendation                                   */
/* ------------------------------------------------------------------ */

export interface OverlapSummary {
  similarityLabel: "identical" | "high" | "medium" | "low" | "none";
  coverageRatio: number; // shared / totalB
  overlapDescription: string;
  suggestion: string;
}

export function summarizeOverlap(result: SourceOverlapResult): OverlapSummary {
  const j = result.jaccardSimilarity;
  let similarityLabel: OverlapSummary["similarityLabel"];
  if (j >= 0.95) similarityLabel = "identical";
  else if (j >= 0.5) similarityLabel = "high";
  else if (j >= 0.2) similarityLabel = "medium";
  else if (j > 0) similarityLabel = "low";
  else similarityLabel = "none";
  const coverageRatio = result.totalB > 0 ? result.shared / result.totalB : 0;
  let suggestion: string;
  if (similarityLabel === "identical") suggestion = "Runs produced identical sources; try different keywords.";
  else if (similarityLabel === "high") suggestion = "High overlap; broaden search terms for novel results.";
  else if (similarityLabel === "medium") suggestion = "Moderate overlap; results are partially complementary.";
  else if (similarityLabel === "low") suggestion = "Low overlap; good diversity across runs.";
  else suggestion = "No overlap; runs found completely different sources.";
  return {
    similarityLabel,
    coverageRatio: Math.round(coverageRatio * 10000) / 10000,
    overlapDescription: "Shared " + result.shared + "/" + result.totalA + " sources (Jaccard: " + Math.round(j * 100) + "%)",
    suggestion,
  };
}

/* ------------------------------------------------------------------ */
/*  Merge sources from multiple runs                                   */
/* ------------------------------------------------------------------ */

export interface MergedSources {
  sources: Array<{ title?: string; url: string }>;
  totalInput: number;
  uniqueCount: number;
  duplicatesRemoved: number;
  domainBreakdown: DomainFrequency[];
}

export function mergeSources(...sourceLists: Array<Array<{ title?: string; url: string }>>): MergedSources {
  const flat = sourceLists.flat();
  const deduped = deduplicateSources(flat);
  return {
    sources: deduped,
    totalInput: flat.length,
    uniqueCount: deduped.length,
    duplicatesRemoved: flat.length - deduped.length,
    domainBreakdown: getDomainFrequency(deduped),
  };
}

