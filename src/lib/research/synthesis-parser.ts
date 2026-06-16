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