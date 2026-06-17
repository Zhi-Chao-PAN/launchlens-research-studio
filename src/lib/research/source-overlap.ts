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