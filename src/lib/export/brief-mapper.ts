// brief-mapper — maps a completed research session to a structured, importable
// LaunchLens brief. The downstream consumer (launchlens-ai) expects a fixed
// five-field input (idea / audience / market / tone / constraints), each at
// most 1200 characters. This pure function derives those fields deterministically
// from the typed agent outputs — it does not change the synthesis LLM contract,
// so existing providers, prompts, and tests stay untouched.

import type {
  AgentId,
  AgentOutput,
  CompetitorAnalystOutput,
  MarketSizerOutput,
  PainDetectiveOutput,
  PricingScoutOutput,
  ResearchSession,
  SynthesisOutput,
} from "@/lib/schema/research-schema";

/** Schema version for the importable brief envelope. Bump when the shape changes
 *  so the downstream importer can migrate older exports. */
export const LAUNCHLENS_BRIEF_SCHEMA_VERSION = "1.0.0";

/** launchlens-ai rejects any input field longer than this (see its
 *  /api/generate validateInput). Keep exports within the same bound. */
export const LAUNCHLENS_FIELD_MAX = 1200;

/** Minimum idea length launchlens-ai enforces server-side. The mapper pads a
 *  too-short idea with the exec summary so the import never trips the gate. */
export const LAUNCHLENS_IDEA_MIN = 12;

/** The five fields launchlens-ai consumes. Mirrored here (not imported from
 *  launchlens-ai) so research-studio has zero cross-repo coupling; the
 *  downstream importer validates independently. */
export interface LaunchLensInput {
  idea: string;
  audience: string;
  market: string;
  tone: string;
  constraints: string;
}

/** Envelope around the five-field input, carrying provenance + version so the
 *  importer can distinguish a Research Studio export from a hand-written brief. */
export interface LaunchLensImportBrief {
  schemaVersion: string;
  source: "launchlens-research-studio";
  exportedAt: string;
  sessionId: string;
  query: string;
  input: LaunchLensInput;
  meta: {
    opportunityScore: number | null;
    riskScore: number | null;
    completedAgents: AgentId[];
    truncated: (keyof LaunchLensInput)[];
  };
}

/** Fixed default tone. research-studio has no tone/style agent; launchlens-ai's
 *  own sample briefs use this exact phrasing as their default. */
const DEFAULT_TONE = "Practical, crisp, and founder-friendly";

/** Truncate to the field limit on a character boundary, appending an ellipsis
 *  only when something was actually cut. */
function clampField(value: string, field: keyof LaunchLensInput, truncated: (keyof LaunchLensInput)[]): string {
  if (value.length <= LAUNCHLENS_FIELD_MAX) return value;
  truncated.push(field);
  // Reserve 3 chars for the ellipsis so the final string stays within the limit.
  return value.slice(0, LAUNCHLENS_FIELD_MAX - 3) + "…";
}

/** Best-effort first-N join that skips empty strings. */
function joinNonEmpty(parts: string[], sep = " "): string {
  return parts.filter((p) => p && p.trim().length > 0).join(sep).trim();
}

/** Narrow an AgentOutput to a specific agent's output via the discriminator. */
function asOutput<T extends AgentOutput>(output: AgentOutput | null | undefined, agent: T["agent"]): T | null {
  if (!output || output.agent !== agent) return null;
  return output as T;
}

/** Build the idea field from the original query (the founder's intent) plus the
 *  synthesis exec summary for context. Falls back to the query alone, then to a
 *  placeholder that still clears the 12-char server gate. */
function buildIdea(session: ResearchSession, synthesis: SynthesisOutput | null): string {
  const query = (session.query || "").trim();
  const execSummary = (synthesis?.execSummary || "").trim();
  if (query && execSummary) return joinNonEmpty([query, execSummary]);
  if (query) return query;
  if (execSummary) return execSummary;
  return "Market opportunity researched by LaunchLens Research Studio";
}

/** Audience from pain-detective personas + market-sizer target segments. */
function buildAudience(
  pain: PainDetectiveOutput | null,
  market: MarketSizerOutput | null,
): string {
  const personas = (pain?.userPersonas ?? [])
    .slice(0, 3)
    .map((p) => joinNonEmpty([p.name, p.role ? `(${p.role})` : "", p.goals?.[0] ? `— ${p.goals[0]}` : ""]));
  const segments = (market?.targetSegments ?? [])
    .slice(0, 2)
    .map((s) => joinNonEmpty([s.name, s.description]));
  const parts: string[] = [];
  if (personas.length) parts.push(`Target users: ${personas.join("; ")}.`);
  if (segments.length) parts.push(`Segments: ${segments.join("; ")}.`);
  if (!parts.length) return "Founders and operators validated during market research.";
  return joinNonEmpty(parts);
}

/** Market context from market size + top competitors + competitive gaps. */
function buildMarket(
  market: MarketSizerOutput | null,
  competitor: CompetitorAnalystOutput | null,
  synthesis: SynthesisOutput | null,
): string {
  const parts: string[] = [];
  const ms = market?.marketSize;
  if (ms) {
    const tam = ms.tam ? `$${ms.tam.toLocaleString("en-US")}` : "unknown TAM";
    const growth = Number.isFinite(ms.growthRate) ? `${ms.growthRate}%/yr` : "unknown growth";
    parts.push(`${tam} TAM, growing ${growth}.`);
  }
  const comps = (competitor?.competitors ?? []).slice(0, 3).map((c) => c.name).filter(Boolean);
  if (comps.length) parts.push(`Key competitors: ${comps.join(", ")}.`);
  const gaps = (competitor?.gaps ?? []).slice(0, 2).map((g) => g.gap).filter(Boolean);
  if (gaps.length) parts.push(`Gaps: ${gaps.join("; ")}.`);
  const opp = (synthesis?.topThreeOpportunities ?? [])[0]?.title;
  if (opp) parts.push(`Top opportunity: ${opp}.`);
  if (!parts.length) return "Market sizing and competitive landscape researched by LaunchLens Research Studio.";
  return joinNonEmpty(parts);
}

/** Constraints from pricing recommendations + unmet needs + top risks (with
 *  mitigations). These shape how launchlens-ai scopes the MVP and launch plan. */
function buildConstraints(
  pricing: PricingScoutOutput | null,
  pain: PainDetectiveOutput | null,
  synthesis: SynthesisOutput | null,
): string {
  const parts: string[] = [];
  const recs = (pricing?.recommendations ?? []).slice(0, 2).map((r) => joinNonEmpty([`Tier ${r.tier}`, r.rationale]));
  if (recs.length) parts.push(`Pricing guidance: ${recs.join("; ")}.`);
  const needs = (pain?.unmetNeeds ?? []).slice(0, 2).map((n) => n.need).filter(Boolean);
  if (needs.length) parts.push(`Unmet needs: ${needs.join("; ")}.`);
  const risks = (synthesis?.topThreeRisks ?? []).slice(0, 2).map((r) => joinNonEmpty([r.title, r.mitigation ? `mitigate via ${r.mitigation}` : ""]));
  if (risks.length) parts.push(`Key risks: ${risks.join("; ")}.`);
  if (!parts.length) return "Constraints to be confirmed during launch planning.";
  return joinNonEmpty(parts);
}

/** Map a completed research session to a structured, importable LaunchLens brief.
 *  Pure: same session in → same brief out. Never throws on missing outputs; it
 *  falls back to neutral copy so the downstream importer still receives a valid
 *  five-field object. */
export function toLaunchLensBrief(session: ResearchSession): LaunchLensImportBrief {
  const outputs = session.agents as Record<AgentId, { output?: AgentOutput | null }>;
  const synthesis = asOutput<SynthesisOutput>(outputs.synthesis?.output, "synthesis");
  const market = asOutput<MarketSizerOutput>(outputs["market-sizer"]?.output, "market-sizer");
  const competitor = asOutput<CompetitorAnalystOutput>(outputs["competitor-analyst"]?.output, "competitor-analyst");
  const pain = asOutput<PainDetectiveOutput>(outputs["pain-detective"]?.output, "pain-detective");
  const pricing = asOutput<PricingScoutOutput>(outputs["pricing-scout"]?.output, "pricing-scout");

  const completedAgents: AgentId[] = (Object.keys(outputs) as AgentId[])
    .filter((id) => outputs[id]?.output != null)
    .sort();

  const truncated: (keyof LaunchLensInput)[] = [];
  const input: LaunchLensInput = {
    idea: clampField(buildIdea(session, synthesis), "idea", truncated),
    audience: clampField(buildAudience(pain, market), "audience", truncated),
    market: clampField(buildMarket(market, competitor, synthesis), "market", truncated),
    tone: DEFAULT_TONE,
    constraints: clampField(buildConstraints(pricing, pain, synthesis), "constraints", truncated),
  };

  // Guarantee the idea clears launchlens-ai's 12-char server gate even when the
  // query and exec summary were both empty (extreme fallback path).
  if (input.idea.length < LAUNCHLENS_IDEA_MIN) {
    input.idea = (input.idea + " — LaunchLens Research Studio brief").slice(0, LAUNCHLENS_FIELD_MAX);
  }

  return {
    schemaVersion: LAUNCHLENS_BRIEF_SCHEMA_VERSION,
    source: "launchlens-research-studio",
    exportedAt: new Date().toISOString(),
    sessionId: session.id,
    query: session.query,
    input,
    meta: {
      opportunityScore: synthesis ? synthesis.opportunityScore : null,
      riskScore: synthesis ? synthesis.riskScore : null,
      completedAgents,
      truncated,
    },
  };
}

/** Serialize a brief envelope to a pretty JSON string for download/copy. */
export function serializeBrief(brief: LaunchLensImportBrief, pretty = true): string {
  return JSON.stringify(brief, null, pretty ? 2 : 0);
}
