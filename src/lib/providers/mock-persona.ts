/**
 * Persona-aware output transformation.
 * Applies persona characteristics (tone, detail level, risk bias, score adjustments)
 * to mock provider outputs so different research agents produce visibly different results.
 */
import type {
  AgentOutput,
  MarketSizerOutput,
  CompetitorAnalystOutput,
  PainDetectiveOutput,
  PricingScoutOutput,
  ChannelScoutOutput,
  SynthesisOutput,
  PainPoint,
  Channel,
} from "@/lib/schema/research-schema";
import type { AgentPersona } from "@/lib/research/agent-personas";
import { getAgentById } from "@/lib/research/agent-personas";

/**
 * Apply persona adjustments to a mock agent output.
 * Returns a new output object with persona-shaped characteristics.
 */
export function applyPersona<T extends AgentOutput>(output: T, personaId: string | undefined): T {
  if (!personaId) return output;
  const persona = getAgentById(personaId);
  if (!persona) return output;

  const oppAdj = persona.defaultOpportunityAdjustment; // -10 to +10
  const riskAdj = persona.defaultRiskAdjustment;       // -10 to +10

  let result: AgentOutput = output;

  switch (output.agent) {
    case "market-sizer":
      result = applyMarketSizerPersona(output, persona, oppAdj, riskAdj);
      break;
    case "competitor-analyst":
      result = applyCompetitorPersona(output, persona, oppAdj, riskAdj);
      break;
    case "pain-detective":
      result = applyPainPersona(output, persona, oppAdj, riskAdj);
      break;
    case "pricing-scout":
      result = applyPricingPersona(output, persona, oppAdj, riskAdj);
      break;
    case "channel-scout":
      result = applyChannelPersona(output, persona, oppAdj, riskAdj);
      break;
    case "synthesis":
      result = applySynthesisPersona(output, persona, oppAdj, riskAdj);
      break;
  }

  // Apply tone to summary text (all outputs have summary)
  if ("summary" in result && typeof result.summary === "string") {
    (result as { summary: string }).summary = applyToneToSummary(result.summary, persona);
  }
  // Synthesis uses execSummary instead
  if (result.agent === "synthesis" && typeof result.execSummary === "string") {
    result.execSummary = applyToneToSummary(result.execSummary, persona);
  }

  return result as T;
}

// --- Market Sizer persona adjustments ---
function applyMarketSizerPersona(
  out: MarketSizerOutput,
  persona: AgentPersona,
  oppAdj: number,
  riskAdj: number,
): MarketSizerOutput {
  const size = out.marketSize;
  const factor = 1 + oppAdj / 100; // oppAdj -10 to +10 => 0.9x to 1.1x
  const growthFactor = 1 + oppAdj / 50; // stronger effect on growth rate

  return {
    ...out,
    marketSize: {
      ...size,
      tam: Math.round(size.tam * factor),
      sam: Math.round(size.sam * factor),
      som: Math.round(size.som * factor * (1 - riskAdj / 200)),
      growthRate: Math.max(1, Number((size.growthRate * growthFactor).toFixed(1))),
      growthTrend:
        persona.riskBias === "aggressive"
          ? "accelerating"
          : persona.riskBias === "conservative"
            ? "stable"
            : size.growthTrend,
    },
    keyTrends: adjustListLength(out.keyTrends, persona.detailLevel),
    targetSegments: adjustListLength(out.targetSegments, persona.detailLevel),
  };
}

// --- Competitor Analyst persona adjustments ---
function applyCompetitorPersona(
  out: CompetitorAnalystOutput,
  persona: AgentPersona,
  oppAdj: number,
  riskAdj: number,
): CompetitorAnalystOutput {
  // Adjust competitive matrix scores based on risk bias
  // Conservative personas give lower scores, aggressive give higher
  const scoreAdj = persona.riskBias === "conservative" ? -5 : persona.riskBias === "aggressive" ? 5 : 0;

  return {
    ...out,
    competitors: adjustListLength(out.competitors, persona.detailLevel),
    competitiveMatrix: out.competitiveMatrix.map((dim) => ({
      ...dim,
      players: dim.players.map((p) => ({
        ...p,
        score: clampScore(p.score + scoreAdj, 0, 100),
      })),
    })),
    gaps: adjustListLength(out.gaps, persona.detailLevel).map((g) => ({
      ...g,
      difficulty:
        persona.riskBias === "aggressive"
          ? g.difficulty === "high" ? "medium" : g.difficulty === "medium" ? "low" : "low"
          : persona.riskBias === "conservative"
            ? g.difficulty === "low" ? "medium" : g.difficulty === "medium" ? "high" : "high"
            : g.difficulty,
    })),
  };
}

// --- Pain Detective persona adjustments ---
function applyPainPersona(
  out: PainDetectiveOutput,
  persona: AgentPersona,
  oppAdj: number,
  riskAdj: number,
): PainDetectiveOutput {
  // Skeptical persona elevates pain severity
  const severityBias = persona.tone === "skeptical" ? 1 : persona.riskBias === "aggressive" ? -1 : 0;

  return {
    ...out,
    painPoints: out.painPoints.map((p) => ({
      ...p,
      severity: shiftSeverity(p.severity, severityBias),
      frequency: shiftFrequency(p.frequency, severityBias),
      quotes: adjustListLength(p.quotes, persona.detailLevel),
    })),
    unmetNeeds: adjustListLength(out.unmetNeeds, persona.detailLevel),
    userPersonas: adjustListLength(out.userPersonas, persona.detailLevel),
  };
}

// --- Pricing Scout persona adjustments ---
function applyPricingPersona(
  out: PricingScoutOutput,
  persona: AgentPersona,
  oppAdj: number,
  riskAdj: number,
): PricingScoutOutput {
  const priceFactor = persona.riskBias === "aggressive" ? 1.15 : persona.riskBias === "conservative" ? 0.85 : 1.0;

  return {
    ...out,
    priceBands: out.priceBands.map((b) => ({
      ...b,
      min: Math.round(b.min * priceFactor),
      max: Math.round(b.max * priceFactor),
      typical: Math.round(b.typical * priceFactor),
    })),
    monetizationModels: adjustListLength(out.monetizationModels, persona.detailLevel),
    willingnessToPay: out.willingnessToPay.map((w) => ({
      ...w,
      estimate: Math.round(w.estimate * priceFactor),
    })),
    recommendations: adjustListLength(out.recommendations, persona.detailLevel),
  };
}

// --- Channel Scout persona adjustments ---
function applyChannelPersona(
  out: ChannelScoutOutput,
  persona: AgentPersona,
  oppAdj: number,
  riskAdj: number,
): ChannelScoutOutput {
  const effectivenessShift = oppAdj > 0 ? 1 : oppAdj < -5 ? -1 : 0;

  return {
    ...out,
    channels: adjustListLength(out.channels, persona.detailLevel).map((c) => ({
      ...c,
      effectiveness: shiftEffectiveness(c.effectiveness, effectivenessShift),
      cost: persona.riskBias === "conservative" && c.cost === "low" ? "medium" : c.cost,
    })),
    communityHubs: adjustListLength(out.communityHubs, persona.detailLevel),
    contentTopics: adjustListLength(out.contentTopics, persona.detailLevel),
    recommendedChannels: adjustListLength(out.recommendedChannels, persona.detailLevel),
  };
}

// --- Synthesis persona adjustments ---
function applySynthesisPersona(
  out: SynthesisOutput,
  persona: AgentPersona,
  oppAdj: number,
  riskAdj: number,
): SynthesisOutput {
  return {
    ...out,
    opportunityScore: clampScore(out.opportunityScore + oppAdj, 0, 100),
    riskScore: clampScore(out.riskScore + riskAdj, 0, 100),
    keyInsights: adjustListLength(out.keyInsights, persona.detailLevel),
    topThreeOpportunities: persona.riskBias === "conservative"
      ? out.topThreeOpportunities.slice(0, 2).concat(out.topThreeRisks.slice(0, 1).map((r) => ({
          title: r.title,
          description: r.description,
          rationale: r.mitigation,
        })))
      : out.topThreeOpportunities,
    topThreeRisks: persona.riskBias === "aggressive"
      ? out.topThreeRisks.slice(0, 2)
      : out.topThreeRisks,
  };
}

// --- Helper: adjust list length by detail level ---
function adjustListLength<T>(arr: T[], detailLevel: string): T[] {
  if (detailLevel === "concise") {
    return arr.slice(0, Math.max(2, Math.ceil(arr.length / 2)));
  }
  if (detailLevel === "comprehensive") {
    return arr;
  }
  return arr.slice(0, Math.max(3, Math.ceil(arr.length * 0.7)));
}

// --- Helper: clamp score to range ---
function clampScore(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

// --- Helper: shift severity level ---
function shiftSeverity(severity: PainPoint["severity"], delta: number): PainPoint["severity"] {
  const levels: PainPoint["severity"][] = ["mild", "significant", "critical"];
  const idx = levels.indexOf(severity);
  const newIdx = Math.max(0, Math.min(levels.length - 1, idx + delta));
  return levels[newIdx];
}

// --- Helper: shift frequency level ---
function shiftFrequency(freq: PainPoint["frequency"], delta: number): PainPoint["frequency"] {
  const levels: PainPoint["frequency"][] = ["rare", "occasional", "common"];
  const idx = levels.indexOf(freq);
  const newIdx = Math.max(0, Math.min(levels.length - 1, idx + delta));
  return levels[newIdx];
}

// --- Helper: shift effectiveness level ---
function shiftEffectiveness(eff: Channel["effectiveness"], delta: number): Channel["effectiveness"] {
  const levels: Channel["effectiveness"][] = ["unknown", "low", "medium", "high"];
  const idx = levels.indexOf(eff);
  const newIdx = Math.max(0, Math.min(levels.length - 1, idx + delta));
  return levels[newIdx];
}

// --- Helper: apply tone flavor to summary text ---
function applyToneToSummary(summary: string, persona: AgentPersona): string {
  const tonePrefixes: Record<string, string> = {
    analytical: "Based on a thorough data-driven analysis, ",
    creative: "From an imaginative perspective, ",
    pragmatic: "Looking at this from a practical standpoint, ",
    skeptical: "After careful scrutiny and challenging assumptions, ",
    enthusiastic: "The data is exciting - ",
  };
  const prefix = tonePrefixes[persona.tone] || "";
  if (!prefix) return summary;
  return prefix + summary.charAt(0).toLowerCase() + summary.slice(1);
}
