/* eslint-disable @typescript-eslint/no-explicit-any */
// Query-driven variability pass for the mock provider.
// The base generators in mock-provider.ts produce a stable canonical
// response. This module extends list-shaped fields with extra entries
// drawn deterministically from a larger pool, keyed by the query+
// keywords seed. The same query always produces the same shape; a new
// query rotates the extras so demos never feel canned.

import type { AgentId, AgentOutput } from "@/lib/schema/research-schema";
import { buildSeed, pickMany, pickNumber } from "@/lib/providers/seed";

const TREND_POOL: { trend: string; impact: "positive" | "negative" | "neutral"; evidence: string }[] = [
  { trend: "Vertical AI agents replacing horizontal tools", impact: "positive", evidence: "Buyers prefer narrow, deep workflows over generic chat surfaces" },
  { trend: "Pricing pressure from open-source models", impact: "negative", evidence: "Llama and Mistral derivatives compress paid-tier margins" },
  { trend: "On-device inference for privacy-sensitive flows", impact: "neutral", evidence: "Browser and OS vendors shipping local models reduces server cost" },
  { trend: "Verticalized data moats becoming a buying criterion", impact: "positive", evidence: "Enterprise RFPs increasingly require domain-specific eval suites" },
  { trend: "Cost-of-context inflation as windows grow", impact: "negative", evidence: "1M-token contexts shift the bottleneck from latency to spend" },
  { trend: "Audit logs and provenance becoming default", impact: "positive", evidence: "Compliance teams require source-by-source citations on outputs" },
];

const SEGMENT_POOL: { name: string; size: number; description: string }[] = [
  { name: "Bootstrapped agencies", size: 350000, description: "Small teams running campaigns for many small clients" },
  { name: "Operators at series-A startups", size: 220000, description: "Founders' first hires building GTM systems from scratch" },
  { name: "In-house product researchers", size: 480000, description: "Embedded researchers who need fast competitive intelligence" },
  { name: "Technical solo consultants", size: 600000, description: "Senior engineers running independent advisory practices" },
  { name: "Open-source maintainers commercializing", size: 90000, description: "Solo or small teams turning a popular library into a SaaS" },
];

const GAP_POOL: { gap: string; opportunity: string; difficulty: "low" | "medium" | "high" }[] = [
  { gap: "Multi-source evidence weighting", opportunity: "No tool surfaces conflicting findings with confidence scores side-by-side", difficulty: "medium" },
  { gap: "Audit-friendly export formats", opportunity: "Buyers want compliance-ready briefs, not just dashboards", difficulty: "low" },
  { gap: "Price elasticity validation loop", opportunity: "Tools assert prices but rarely test them in market", difficulty: "high" },
  { gap: "Internationalized GTM playbooks", opportunity: "Most output assumes US-centric channels and pricing", difficulty: "medium" },
];

const CITATION_POOL = [
  { id: "cite-extra-1", title: "Quarterly category report", url: "https://example.com/research/q4", confidence: "medium" as const },
  { id: "cite-extra-2", title: "Public earnings call summary", url: "https://example.com/earnings", confidence: "high" as const },
  { id: "cite-extra-3", title: "Independent market sizing whitepaper", url: "https://example.com/whitepaper", confidence: "medium" as const },
  { id: "cite-extra-4", title: "Founder interview transcript", url: "https://example.com/interview", confidence: "low" as const },
];

function withTimestamp<T extends { id: string }>(c: T) {
  return { ...c, accessedAt: new Date().toISOString() };
}

export function applyQueryVariability(
  agentId: AgentId,
  output: AgentOutput,
  query: string,
  keywords: string[],
): AgentOutput {
  const seed = buildSeed(query, keywords) + ":v:" + agentId;
  const o = output as any;

  if (agentId === "market-sizer") {
    const trendCount = pickNumber(seed, 1, 3, 0);
    const segCount = pickNumber(seed, 1, 2, 1);
    const extraTrends = pickMany(seed + ":trends", TREND_POOL, trendCount);
    const extraSegs = pickMany(seed + ":segs", SEGMENT_POOL, segCount);
    if (Array.isArray(o.keyTrends)) o.keyTrends = [...o.keyTrends, ...extraTrends];
    if (Array.isArray(o.targetSegments)) o.targetSegments = [...o.targetSegments, ...extraSegs];
  } else if (agentId === "competitor-analyst") {
    const gapCount = pickNumber(seed, 1, 2, 0);
    const extraGaps = pickMany(seed + ":gaps", GAP_POOL, gapCount);
    if (Array.isArray(o.gaps)) o.gaps = [...o.gaps, ...extraGaps];
  }

  const extraCitationCount = pickNumber(seed, 0, 2, 9);
  if (extraCitationCount > 0 && Array.isArray(o.citations)) {
    const extras = pickMany(seed + ":cites", CITATION_POOL, extraCitationCount).map((c) => withTimestamp(c));
    const seen = new Set(o.citations.map((c: any) => c.id));
    for (const e of extras) if (!seen.has(e.id)) o.citations.push(e);
  }

  return output;
}

export const __INTERNAL_FOR_TESTS__ = { TREND_POOL, SEGMENT_POOL, GAP_POOL, CITATION_POOL };
