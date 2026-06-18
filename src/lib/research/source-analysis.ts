/**
 * Analyze research sources for visualization.
 */

export interface SourceDomain {
  domain: string;
  count: number;
  percentage: number;
}

export interface ConfidenceDistribution {
  high: number;
  medium: number;
  low: number;
  total: number;
}

export interface SourceAnalysis {
  totalSources: number;
  domains: SourceDomain[];
  confidence: ConfidenceDistribution;
  avgConfidence: number;
}

function extractDomain(url: string): string {
  try {
    const u = new URL(url);
    const parts = u.hostname.replace(/^www\./, "").split(".");
    // Get second-level domain
    if (parts.length >= 2) {
      return parts.slice(-2).join(".");
    }
    return u.hostname;
  } catch {
    return "unknown";
  }
}

export function analyzeSources(sources: { url: string; title?: string }[]): SourceAnalysis {
  const domainMap = new Map<string, number>();

  for (const source of sources) {
    const domain = extractDomain(source.url);
    domainMap.set(domain, (domainMap.get(domain) || 0) + 1);
  }

  const total = sources.length || 1;
  const domains = Array.from(domainMap.entries())
    .map(([domain, count]) => ({
      domain,
      count,
      percentage: Math.round((count / total) * 100),
    }))
    .sort((a, b) => b.count - a.count);

  return {
    totalSources: sources.length,
    domains,
    confidence: { high: 0, medium: 0, low: 0, total: sources.length },
    avgConfidence: 0,
  };
}

export function analyzeInsightConfidence(
  insights: { confidence: string }[]
): ConfidenceDistribution {
  const dist: ConfidenceDistribution = { high: 0, medium: 0, low: 0, total: insights.length };

  for (const insight of insights) {
    const c = insight.confidence.toLowerCase();
    if (c.includes("high") || c === "?") dist.high++;
    else if (c.includes("low") || c === "?") dist.low++;
    else dist.medium++;
  }

  return dist;
}

/**
 * Generate multi-dimensional radar data from a synthesis output.
 * Converts various metrics into 0-100 scores for radar visualization.
 */
export function generateRadarData(synthesis: {
  opportunityScore: number;
  riskScore: number;
  keyInsights?: { confidence: string }[];
  topThreeOpportunities?: unknown[];
  topThreeRisks?: unknown[];
  citations?: unknown[];
}): { label: string; value: number; color?: string }[] {
  // Calculate confidence score
  const insights = synthesis.keyInsights || [];
  let confidenceScore = 70;
  if (insights.length > 0) {
    const confidenceDist = analyzeInsightConfidence(insights);
    confidenceScore = Math.round(
      (confidenceDist.high * 100 + confidenceDist.medium * 70 + confidenceDist.low * 40) /
        (confidenceDist.total || 1)
    );
  }

  // Breadth score: based on number of sources/opportunities/risks
  const sourceCount = synthesis.citations?.length || 0;
  const breadthScore = Math.min(100, Math.round((sourceCount / 15) * 100));

  // Depth score: based on number of insights
  const depthScore = Math.min(100, Math.round((insights.length / 10) * 100) + 30);

  // Actionability score: based on opportunities + next step presence
  const oppCount = synthesis.topThreeOpportunities?.length || 0;
  const riskCount = synthesis.topThreeRisks?.length || 0;
  const actionabilityScore = Math.round(((oppCount + riskCount) / 8) * 100);

  const clamp = (v: number) => Math.max(0, Math.min(100, v));

  return [
    { label: "Opportunity", value: clamp(synthesis.opportunityScore), color: "#4ade80" },
    { label: "Risk (reversed)", value: clamp(100 - synthesis.riskScore), color: "#f87171" },
    { label: "Confidence", value: clamp(confidenceScore), color: "#60a5fa" },
    { label: "Breadth", value: clamp(breadthScore), color: "#a78bfa" },
    { label: "Depth", value: clamp(depthScore), color: "#f472b6" },
    { label: "Actionability", value: clamp(actionabilityScore), color: "#fbbf24" },
  ];
}

/* ------------------------------------------------------------------ */
/*  Extended source analysis utilities (round 140)                     */
/* ------------------------------------------------------------------ */

export type SourceType = "news" | "academic" | "blog" | "government" | "company" | "reference" | "social" | "other";

export interface TypedSource {
  url: string;
  title?: string;
  type: SourceType;
}

const ACADEMIC_TLDS = ["edu", "ac.uk", "ac.jp", "edu.au", "arxiv.org", "scholar.google"];
const GOV_TLDS = ["gov", "mil", "gov.uk", "gov.au", "go.jp"];
const NEWS_DOMAINS = ["reuters.com", "bloomberg.com", "ft.com", "wsj.com", "nytimes.com", "bbc.com", "bbc.co.uk", "cnn.com", "theguardian.com", "washingtonpost.com", "economist.com", "forbes.com", "cnbc.com", "techcrunch.com", "wired.com", "axios.com", "apnews.com"];
const REFERENCE_DOMAINS = ["wikipedia.org", "wikimedia.org", "britannica.com", "encyclopedia.com", "web.archive.org", "worldbank.org", "oecd.org", "imf.org", "statista.com", "crunchbase.com"];
const SOCIAL_DOMAINS = ["twitter.com", "x.com", "linkedin.com", "facebook.com", "reddit.com", "youtube.com", "tiktok.com", "instagram.com", "medium.com"];
const BLOG_HINTS = ["blog.", "medium.com", "dev.to", "hashnode.com", "substack.com"];

export function classifySource(url: string, title?: string): SourceType {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "").toLowerCase();
    if (GOV_TLDS.some(t => host.endsWith("." + t) || host === t)) return "government";
    if (ACADEMIC_TLDS.some(t => host.endsWith("." + t) || host === t || host.includes(t))) return "academic";
    if (NEWS_DOMAINS.some(d => host === d || host.endsWith("." + d))) return "news";
    if (REFERENCE_DOMAINS.some(d => host === d || host.endsWith("." + d))) return "reference";
    if (SOCIAL_DOMAINS.some(d => host === d || host.endsWith("." + d))) return "social";
    if (BLOG_HINTS.some(h => host.startsWith(h) || host.includes(h))) return "blog";
    if (title && /blog|diary|journal/i.test(title)) return "blog";
    return "company";
  } catch {
    return "other";
  }
}

export function classifySourcesByType(sources: { url: string; title?: string }[]): Record<SourceType, TypedSource[]> {
  const result: Record<SourceType, TypedSource[]> = {
    news: [], academic: [], blog: [], government: [], company: [], reference: [], social: [], other: [],
  };
  for (const s of sources) {
    const type = classifySource(s.url, s.title);
    result[type].push({ ...s, type });
  }
  return result;
}

export interface SourceTypeBreakdown {
  type: SourceType;
  count: number;
  percentage: number;
}

export function getSourceTypeBreakdown(sources: { url: string; title?: string }[]): SourceTypeBreakdown[] {
  const byType = classifySourcesByType(sources);
  const total = sources.length || 1;
  return (Object.keys(byType) as SourceType[])
    .map(type => ({
      type,
      count: byType[type].length,
      percentage: Math.round((byType[type].length / total) * 100),
    }))
    .filter(b => b.count > 0)
    .sort((a, b) => b.count - a.count);
}

export interface DiversityScore {
  uniqueDomains: number;
  totalSources: number;
  domainDiversity: number; // 0-100
  typeDiversity: number;   // 0-100
  overallDiversity: number; // 0-100
  dominantDomain?: string;
  dominantDomainShare: number;
}

export function calculateDiversity(sources: { url: string; title?: string }[]): DiversityScore {
  if (sources.length === 0) {
    return {
      uniqueDomains: 0, totalSources: 0,
      domainDiversity: 0, typeDiversity: 0, overallDiversity: 0,
      dominantDomainShare: 0,
    };
  }
  const analysis = analyzeSources(sources);
  const uniqueDomains = analysis.domains.length;
  const domainDiversity = Math.round((uniqueDomains / sources.length) * 100);
  const breakdown = getSourceTypeBreakdown(sources);
  const typeDiversity = Math.round((breakdown.length / 8) * 100);
  const dominantDomain = analysis.domains[0]?.domain;
  const dominantDomainShare = analysis.domains[0]?.percentage || 0;
  const overallDiversity = Math.round((domainDiversity * 0.6 + typeDiversity * 0.4));
  return {
    uniqueDomains,
    totalSources: sources.length,
    domainDiversity,
    typeDiversity,
    overallDiversity,
    dominantDomain,
    dominantDomainShare,
  };
}

const STOP_WORDS = new Set([
  "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for", "of", "with", "by",
  "from", "as", "is", "was", "are", "were", "be", "been", "being", "have", "has", "had",
  "do", "does", "did", "will", "would", "could", "should", "may", "might", "can", "shall",
  "this", "that", "these", "those", "it", "its", "i", "you", "he", "she", "we", "they",
  "what", "which", "who", "when", "where", "why", "how", "not", "no", "nor", "so", "if",
  "then", "than", "too", "very", "just", "about", "also", "more", "most", "such", "only",
  "own", "same", "other", "new", "their", "them", "his", "her", "into", "over", "after",
  "up", "out", "all", "some", "any", "each", "few", "many", "much", "both", "between",
]);

export function extractTitleKeywords(titles: (string | undefined)[], limit = 10): { keyword: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const t of titles) {
    if (!t) continue;
    const words = t.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").split(/\s+/).filter(w => w.length >= 2 && !STOP_WORDS.has(w));
    for (const w of words) {
      counts.set(w, (counts.get(w) || 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .map(([keyword, count]) => ({ keyword, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

export interface QualitySignal {
  url: string;
  hasTitle: boolean;
  isHttps: boolean;
  type: SourceType;
  reputationScore: number; // 0-100 heuristic
}

const TYPE_REPUTATION: Record<SourceType, number> = {
  government: 90, academic: 90, reference: 80, news: 75,
  company: 50, blog: 40, social: 25, other: 30,
};

export function assessSourceQuality(sources: { url: string; title?: string }[]): QualitySignal[] {
  return sources.map(s => {
    let isHttps = false;
    try { isHttps = new URL(s.url).protocol === "https:"; } catch {}
    const type = classifySource(s.url, s.title);
    let score = TYPE_REPUTATION[type];
    if (isHttps) score += 5;
    if (s.title && s.title.length > 10) score += 5;
    score = Math.min(100, score);
    return { url: s.url, hasTitle: !!(s.title && s.title.trim()), isHttps, type, reputationScore: score };
  });
}

export function overallQualityScore(sources: { url: string; title?: string }[]): number {
  if (sources.length === 0) return 0;
  const signals = assessSourceQuality(sources);
  const avg = signals.reduce((a, s) => a + s.reputationScore, 0) / signals.length;
  const diversity = calculateDiversity(sources).overallDiversity;
  return Math.round(avg * 0.7 + diversity * 0.3);
}

export interface SourceYear {
  url: string;
  year?: number;
  isRecent: boolean; // within last 2 years
}

const CURRENT_YEAR = new Date().getFullYear();

export function inferSourceYear(url: string, title?: string): number | undefined {
  const haystack = (url + " " + (title || "")).toLowerCase();
  const years: number[] = [];
  for (let y = CURRENT_YEAR; y >= CURRENT_YEAR - 30; y--) {
    if (haystack.includes(String(y))) years.push(y);
  }
  if (years.length === 0) return undefined;
  return years[0];
}

export function analyzeSourceRecency(sources: { url: string; title?: string }[]): {
  recent: number;
  older: number;
  unknown: number;
  averageYear?: number;
  oldestYear?: number;
  newestYear?: number;
} {
  let recent = 0, older = 0, unknown = 0;
  const knownYears: number[] = [];
  for (const s of sources) {
    const y = inferSourceYear(s.url, s.title);
    if (y === undefined) { unknown++; continue; }
    knownYears.push(y);
    if (y >= CURRENT_YEAR - 2) recent++;
    else older++;
  }
  const sum = knownYears.reduce((a, b) => a + b, 0);
  return {
    recent, older, unknown,
    averageYear: knownYears.length ? Math.round(sum / knownYears.length) : undefined,
    oldestYear: knownYears.length ? Math.min(...knownYears) : undefined,
    newestYear: knownYears.length ? Math.max(...knownYears) : undefined,
  };
}
