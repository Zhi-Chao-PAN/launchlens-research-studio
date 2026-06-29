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

/** launchlens-ai's workspace form shows advisory ("aim under") limits that are
 *  much tighter than the 1200-char server gate. Exceeding them renders the
 *  field count red and warns "Too long", which is alarming even though
 *  Generate still works. We clamp each field to its advisory limit so an
 *  exported brief lands in launchlens-ai with no warnings — the full detail
 *  stays in the research report (linked via reportUrl), not crammed into a
 *  five-field brief. Mirrors launch-workspace.tsx char thresholds. */
const FIELD_ADVISORY_LIMITS: Record<keyof LaunchLensInput, number> = {
  idea: 500,
  audience: 240,
  market: 120,
  tone: 1200, // tone is not surfaced with an advisory limit; keep server cap
  constraints: 320,
};

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
 * importer can distinguish a Research Studio export from a hand-written brief. */
export interface LaunchLensImportBrief {
  schemaVersion: string;
  source: "launchlens-research-studio";
  exportedAt: string;
  sessionId: string;
  query: string;
  // R231: optional back-link to the live research report page. launchlens-ai
  // (commit 98ad77a, source-brief.ts) reads envelope.reportUrl to populate
  // the workspace's "provenance / trace-back" UI. Older versions of the
  // importer (brief-from-json.ts before 98ad77a) ignore this field, so it's
  // safe to add — exporters written before R231 just won't carry it.
  reportUrl?: string;
  input: LaunchLensInput;
  meta: {
    opportunityScore: number | null;
    riskScore: number | null;
    completedAgents: AgentId[];
    truncated: (keyof LaunchLensInput)[];
    // R254: research-studio has no tone/style agent, so the tone field is a
    // fixed default rather than a researched recommendation. Flagging it lets
    // launchlens-ai preserve the user's existing tone on import instead of
    // clobbering it with "Practical, crisp, and founder-friendly". Importers
    // written before R254 ignore this field (default false), so the flag is
    // purely additive.
    toneDefault?: boolean;
  };
}

/** Fixed default tone. research-studio has no tone/style agent; launchlens-ai's
 *  own sample briefs use this exact phrasing as their default. */
const DEFAULT_TONE = "Practical, crisp, and founder-friendly";

/** Truncate to the field's advisory limit (or the 1200-char server cap,
 *  whichever is tighter), on a character boundary, appending an ellipsis
 *  only when something was actually cut. Records the field name in
 *  `truncated` so the envelope meta can flag it. */
function clampField(value: string, field: keyof LaunchLensInput, truncated: (keyof LaunchLensInput)[]): string {
  const limit = Math.min(FIELD_ADVISORY_LIMITS[field] ?? LAUNCHLENS_FIELD_MAX, LAUNCHLENS_FIELD_MAX);
  if (value.length <= limit) return value;
  truncated.push(field);
  // Reserve 3 chars for the ellipsis so the final string stays within the limit.
  return value.slice(0, limit - 3) + "…";
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
 *  placeholder that still clears the 12-char server gate.
 *
 *  The query is always preserved in full (it's the founder's own words and the
 *  most important signal). The exec summary is appended only when it fits within
 *  the advisory limit; if not, it's truncated at a sentence boundary rather than
 *  mid-word so the idea reads naturally in the launchlens-ai form. */
function buildIdea(session: ResearchSession, synthesis: SynthesisOutput | null): string {
  const query = (session.query || "").trim();
  const execSummary = (synthesis?.execSummary || "").trim();
  const limit = FIELD_ADVISORY_LIMITS.idea;

  if (query && execSummary) {
    // Always keep the full query; append as much exec summary as fits.
    if (query.length >= limit) return query.slice(0, limit);
    const remaining = limit - query.length - 1; // -1 for the joining space
    if (execSummary.length <= remaining) return joinNonEmpty([query, execSummary]);
    // Truncate the exec summary at the last sentence boundary within budget.
    const slice = execSummary.slice(0, Math.max(0, remaining - 1));
    const lastStop = Math.max(slice.lastIndexOf("."), slice.lastIndexOf("!"), slice.lastIndexOf(";"));
    const trimmed = lastStop > remaining * 0.5 ? slice.slice(0, lastStop + 1) : slice;
    return `${query} ${trimmed.trim()}…`;
  }
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

/** R231: optional override of the launchlens-ai production URL. Read once
 *  at module load so tests can set process.env.NEXT_PUBLIC_LAUNCHLENS_AI_URL
 *  before importing this module (or via the helper below). */
const DEFAULT_LAUNCHLENS_AI_URL = "https://launchlens-ai-two.vercel.app";

/** R231: optional override of the research-studio production URL — used as
 *  the base for the envelope.reportUrl field that launchlens-ai's source
 *  back-link reads. Falls back to the Vercel default preview URL. */
const DEFAULT_RESEARCH_STUDIO_URL = "https://launchlens-research-studio.vercel.app";

/** Strip a trailing slash from a base URL so we can always append `/path`
 *  without producing `//path`. */
function stripTrailingSlash(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

/** Read NEXT_PUBLIC_LAUNCHLENS_AI_URL with a default. Exported for tests. */
export function getLaunchLensAiUrl(): string {
  const raw = (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_LAUNCHLENS_AI_URL) || "";
  return stripTrailingSlash(raw) || DEFAULT_LAUNCHLENS_AI_URL;
}

/** Read NEXT_PUBLIC_RESEARCH_STUDIO_URL with a default. Exported for tests. */
export function getResearchStudioUrl(): string {
  const raw = (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_RESEARCH_STUDIO_URL) || "";
  return stripTrailingSlash(raw) || DEFAULT_RESEARCH_STUDIO_URL;
}

/** Build the public report URL for a given session, e.g.
 *  https://launchlens-research-studio.vercel.app/research/<id>.
 *  Pure: no fetch, no side effects. */
export function buildReportUrl(sessionId: string): string {
  const base = getResearchStudioUrl();
  const id = (sessionId || "").trim();
  if (!id) return base;
  return `${base}/research/${id}`;
}

/** Map a completed research session to a structured, importable LaunchLens brief.
 *  Pure: same session in → same brief out. Never throws on missing outputs; it
 *  falls back to neutral copy so the downstream importer still receives a valid
 *  five-field object. */
export function toLaunchLensBrief(session: ResearchSession): LaunchLensImportBrief {
  const outputs = session.agents as Record<AgentId, { output?: AgentOutput | null }>;
  // A degraded synthesis output is usually mock/fallback text emitted after the
  // real synthesis provider failed. Dogfood showed this can be much more
  // generic than the specialist-agent findings and can pollute the LaunchLens
  // handoff brief. Keep the specialist outputs, but do not use degraded
  // synthesis for idea/market/constraints or score metadata.
  const synthesisState = session.agents.synthesis;
  const synthesis = synthesisState?.degraded
    ? null
    : asOutput<SynthesisOutput>(outputs.synthesis?.output, "synthesis");
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
    // R231: back-link to the live report page. launchlens-ai's source-brief
    // module reads this to populate its workspace provenance UI.
    reportUrl: buildReportUrl(session.id),
    input,
    meta: {
      opportunityScore: synthesis ? synthesis.opportunityScore : null,
      riskScore: synthesis ? synthesis.riskScore : null,
      completedAgents,
      truncated,
      // R254: tone is the fixed default, not a researched recommendation —
      // flag it so the importer can preserve the user's existing tone.
      toneDefault: true,
    },
  };
}

/** Serialize a brief envelope to a pretty JSON string for download/copy. */
export function serializeBrief(brief: LaunchLensImportBrief, pretty = true): string {
  return JSON.stringify(brief, null, pretty ? 2 : 0);
}
