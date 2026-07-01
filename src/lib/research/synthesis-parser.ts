/**
 * Parsing utilities for research synthesis output.
 * The synthesis agent produces JSON-formatted output with a known schema.
 */

export interface Source {
  title: string;
  url: string;
  snippet?: string;
}

export interface KeyInsight {
  insight: string;
  supportingAgents: string[];
  confidence: "high" | "medium" | "low";
}

export interface Opportunity {
  title: string;
  description: string;
  rationale: string;
}

export interface Risk {
  title: string;
  description: string;
  mitigation: string;
}

export interface SynthesisOutput {
  agent: string;
  execSummary: string;
  opportunityScore: number;
  riskScore: number;
  keyInsights: KeyInsight[];
  topThreeOpportunities: Opportunity[];
  topThreeRisks: Risk[];
  recommendedNextStep: string;
  launchlensBrief: string;
  citations: Source[];
}

/**
 * Compute which sections cite which sources.
 * Returns a map of source index -> array of section names.
 */
export function computeSourceCitationMap(
  synthesis: SynthesisOutput
): Map<number, string[]> {
  const map = new Map<number, string[]>();
  const sections: { name: string; text: string }[] = [
    { name: "Executive Summary", text: synthesis.execSummary || "" },
    { name: "Key Insights", text: (synthesis.keyInsights || []).map((k) => k.insight).join(" ") },
    { name: "Opportunities", text: (synthesis.topThreeOpportunities || []).map((o) => o.description + " " + o.rationale).join(" ") },
    { name: "Risks", text: (synthesis.topThreeRisks || []).map((r) => r.description + " " + r.mitigation).join(" ") },
    { name: "Next Step", text: synthesis.recommendedNextStep || "" },
  ];

  // Reuse the citation regex across sections (lastIndex resets per
  // matchAll iteration so this is safe).
  const citeRe = /\[(\d+)\]/g;
  for (const section of sections) {
    const cited = new Set<number>();
    for (const m of section.text.matchAll(citeRe)) {
      cited.add(parseInt(m[1], 10) - 1);
    }
    for (const idx of cited) {
      if (!map.has(idx)) map.set(idx, []);
      map.get(idx)!.push(section.name);
    }
  }

  return map;
}

/**
 * Try to parse a JSON synthesis output.
 * Handles common edge cases like markdown-wrapped JSON.
 */
export function parseSynthesis(result: string): SynthesisOutput | null {
  if (!result || !result.trim()) return null;

  let jsonStr = result.trim();

  // Strip markdown code fences if present
  if (jsonStr.startsWith("```")) {
    const firstNewline = jsonStr.indexOf("\n");
    if (firstNewline > -1) {
      jsonStr = jsonStr.slice(firstNewline + 1);
    }
    if (jsonStr.endsWith("```")) {
      jsonStr = jsonStr.slice(0, -3);
    }
  }

  try {
    const parsed = JSON.parse(jsonStr);
    if (parsed && typeof parsed === "object" && "execSummary" in parsed) {
      return parsed as SynthesisOutput;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Try to detect whether a result is structured (JSON) or plain text.
 */
export function isStructuredResult(result: string): boolean {
  return parseSynthesis(result) !== null;
}

/* ------------------------------------------------------------------ */
/*  Validation and completeness check                                  */
/* ------------------------------------------------------------------ */

export interface ValidationIssue {
  field: string;
  severity: "error" | "warning";
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
  completenessScore: number; // 0-100
  missingFields: string[];
}

export function validateSynthesis(syn: Partial<SynthesisOutput>): ValidationResult {
  const issues: ValidationIssue[] = [];
  const missingFields: string[] = [];

  const required: Array<[string, unknown]> = [
    ["execSummary", syn.execSummary],
    ["keyInsights", syn.keyInsights],
    ["topThreeOpportunities", syn.topThreeOpportunities],
    ["topThreeRisks", syn.topThreeRisks],
    ["recommendedNextStep", syn.recommendedNextStep],
  ];

  for (const [field, val] of required) {
    if (!val || (Array.isArray(val) && val.length === 0) || (typeof val === "string" && !val.trim())) {
      issues.push({ field, severity: "error", message: "Missing required field: " + field });
      missingFields.push(field);
    }
  }

  if (syn.opportunityScore != null) {
    if (typeof syn.opportunityScore !== "number" || syn.opportunityScore < 0 || syn.opportunityScore > 100) {
      issues.push({ field: "opportunityScore", severity: "error", message: "Score must be 0-100" });
    }
  } else { missingFields.push("opportunityScore"); }

  if (syn.riskScore != null) {
    if (typeof syn.riskScore !== "number" || syn.riskScore < 0 || syn.riskScore > 100) {
      issues.push({ field: "riskScore", severity: "error", message: "Score must be 0-100" });
    }
  } else { missingFields.push("riskScore"); }

  if (syn.keyInsights) {
    if (syn.keyInsights.length < 1) {
      issues.push({ field: "keyInsights", severity: "warning", message: "Expected at least 1 insight" });
    }
    for (const [i, insight] of syn.keyInsights.entries()) {
      if (!insight.confidence || !["high","medium","low"].includes(insight.confidence)) {
        issues.push({ field: "keyInsights[" + i + "].confidence", severity: "warning", message: "Invalid confidence level" });
      }
    }
  }

  const totalFields = 7;
  const filled = totalFields - missingFields.length;
  const completenessScore = Math.round((filled / totalFields) * 100);

  return {
    valid: issues.filter((i) => i.severity === "error").length === 0,
    issues,
    completenessScore,
    missingFields,
  };
}

/* ------------------------------------------------------------------ */
/*  Score interpretation and recommendations                           */
/* ------------------------------------------------------------------ */

export interface ScoreInterpretation {
  opportunityLabel: string;
  riskLabel: string;
  netScore: number;
  verdict: "strong-buy" | "positive" | "neutral" | "cautious" | "high-risk";
  summary: string;
}

export function interpretScores(opportunityScore: number, riskScore: number): ScoreInterpretation {
  const netScore = opportunityScore - riskScore;
  const opportunityLabel = opportunityScore >= 75 ? "Very High" : opportunityScore >= 50 ? "High" : opportunityScore >= 25 ? "Moderate" : "Low";
  const riskLabel = riskScore >= 75 ? "Very High" : riskScore >= 50 ? "High" : riskScore >= 25 ? "Moderate" : "Low";
  let verdict: ScoreInterpretation["verdict"];
  let summary: string;
  if (netScore >= 40) { verdict = "strong-buy"; summary = "Strong opportunity significantly outweighs risk; recommend aggressive exploration."; }
  else if (netScore >= 15) { verdict = "positive"; summary = "Opportunity exceeds risk; recommend proceeding with due diligence."; }
  else if (netScore >= -15) { verdict = "neutral"; summary = "Balanced opportunity and risk; recommend careful consideration."; }
  else if (netScore >= -40) { verdict = "cautious"; summary = "Risk exceeds opportunity; recommend mitigation before proceeding."; }
  else { verdict = "high-risk"; summary = "High risk dominates; recommend avoiding or rethinking approach."; }
  return { opportunityLabel, riskLabel, netScore, verdict, summary };
}

/* ------------------------------------------------------------------ */
/*  Section extraction and word count                                  */
/* ------------------------------------------------------------------ */

export interface SectionStats {
  name: string;
  wordCount: number;
  charCount: number;
  populated: boolean;
}

export function getSectionStats(syn: SynthesisOutput): SectionStats[] {
  const sections: Array<{ name: string; text: string }> = [
    { name: "execSummary", text: syn.execSummary || "" },
    { name: "keyInsights", text: (syn.keyInsights || []).map((k) => k.insight).join(" ") },
    { name: "opportunities", text: (syn.topThreeOpportunities || []).map((o) => o.title + " " + o.description + " " + o.rationale).join(" ") },
    { name: "risks", text: (syn.topThreeRisks || []).map((r) => r.title + " " + r.description + " " + r.mitigation).join(" ") },
    { name: "nextStep", text: syn.recommendedNextStep || "" },
    { name: "brief", text: syn.launchlensBrief || "" },
  ];
  return sections.map((s) => ({
    name: s.name,
    wordCount: s.text.trim() ? s.text.trim().split(/\s+/).length : 0,
    charCount: s.text.length,
    populated: s.text.trim().length > 0,
  }));
}

/* ------------------------------------------------------------------ */
/*  Summary / quick glance                                             */
/* ------------------------------------------------------------------ */

export interface SynthesisSummary {
  headline: string;
  topInsight: string;
  topOpportunity: string;
  topRisk: string;
  nextStep: string;
  verdict: string;
}

export function summarizeSynthesis(syn: SynthesisOutput): SynthesisSummary {
  const verdict = interpretScores(syn.opportunityScore, syn.riskScore);
  return {
    headline: syn.execSummary.slice(0, 120),
    topInsight: syn.keyInsights[0]?.insight || "No insights available",
    topOpportunity: syn.topThreeOpportunities[0]?.title || "N/A",
    topRisk: syn.topThreeRisks[0]?.title || "N/A",
    nextStep: syn.recommendedNextStep || "N/A",
    verdict: verdict.summary,
  };
}

export function countCitations(syn: SynthesisOutput): number {
  return syn.citations?.length || 0;
}

export function getConfidenceDistribution(syn: SynthesisOutput): { high: number; medium: number; low: number } {
  const dist = { high: 0, medium: 0, low: 0 };
  for (const k of syn.keyInsights || []) {
    if (k.confidence === "high") dist.high++;
    else if (k.confidence === "medium") dist.medium++;
    else dist.low++;
  }
  return dist;
}

