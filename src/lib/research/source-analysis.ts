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
