/**
 * Canonical step keys used across the research pipeline.
 *
 * Why keys (not English strings)?
 *   Providers, the mock plan, and the synthesis engine historically pushed
 *   hardcoded English prose as agent "current step" labels (e.g.
 *   "Streaming response", "Synthesizing executive summary..."). To support
 *   localisation we now push **stable identifiers** from the engine and
 *   translate them in the UI. Each key has a dictionary entry under
 *   `step.<key>` in `dictionaries.ts`.
 *
 * Unknown / free-form strings (e.g. a provider-specific error message, or a
 * dynamic `"Error: <details>"` prefix) fall back to being displayed as-is.
 */

import type { AgentId } from "@/lib/schema/research-schema";

export type StepKey =
  // Lifecycle / generic
  | "waiting"
  | "streaming"
  | "validating"
  | "complete"
  | "skipped"
  | "error"
  // Mock provider
  | "loadingContext"
  | "synthesizingFindings"
  | "compilingCitations"
  // market-sizer
  | "market.boundaries"
  | "market.tamData"
  | "market.samSom"
  | "market.growthTrends"
  | "market.crossReference"
  | "market.estimates"
  // competitor-analyst
  | "competitors.identifying"
  | "competitors.positioning"
  | "competitors.featureMatrix"
  | "competitors.strengthsWeaknesses"
  | "competitors.gaps"
  | "competitors.validatingFindings"
  // pain-detective
  | "pain.scanningForums"
  | "pain.collectingReviews"
  | "pain.clustering"
  | "pain.quotes"
  | "pain.unmetNeeds"
  | "pain.personas"
  // pricing-scout
  | "pricing.collecting"
  | "pricing.bands"
  | "pricing.monetization"
  | "pricing.willingnessToPay"
  | "pricing.benchmarking"
  | "pricing.recommendations"
  // channel-scout
  | "channels.mappingLandscape"
  | "channels.scanningHubs"
  | "channels.searchVolume"
  | "channels.paidCompetitiveness"
  | "channels.costEffectiveness"
  | "channels.prioritizingRoi"
  // synthesis
  | "synthesis.collecting"
  | "synthesis.crossValidating"
  | "synthesis.confidence"
  | "synthesis.scores"
  | "synthesis.executiveSummary"
  | "synthesis.launchBrief";

/** Dictionary key prefix — every step key maps to `step.<key>`. */
export const STEP_PREFIX = "step.";

/**
 * Map of legacy English step literals → step keys. Retained so any stray
 * string-literal step (cached sessions, older tests, third-party providers)
 * still resolves to a translatable key.
 *
 * Keep this list in sync with the hardcoded English steps in:
 *   - src/lib/research/research-engine.ts  (getAgentSteps)
 *   - src/lib/providers/mock-provider-adapter.ts
 *   - src/lib/providers/{openai,anthropic}-provider.ts
 */
const LEGACY_STEP_MAP: Record<string, StepKey> = {
  "Waiting to start...": "waiting",
  "Streaming response": "streaming",
  "Validating output": "validating",
  Complete: "complete",
  "Skipped: too many upstream agent failures": "skipped",
  Error: "error",
  // mock-provider-adapter
  "Loading research context": "loadingContext",
  "Synthesizing findings": "synthesizingFindings",
  "Compiling citations": "compilingCitations",
  // market-sizer (getAgentSteps)
  "Defining market boundaries and scope...": "market.boundaries",
  "Gathering TAM data from industry reports...": "market.tamData",
  "Calculating SAM and SOM with segmentation...": "market.samSom",
  "Analyzing growth trends and market velocity...": "market.growthTrends",
  "Cross-referencing data sources for confidence...": "market.crossReference",
  "Synthesizing market size estimates...": "market.estimates",
  // competitor-analyst
  "Identifying direct and indirect competitors...": "competitors.identifying",
  "Scraping competitor positioning and pricing...": "competitors.positioning",
  "Building competitive feature matrix...": "competitors.featureMatrix",
  "Analyzing strengths and weaknesses...": "competitors.strengthsWeaknesses",
  "Mapping market gaps and white space...": "competitors.gaps",
  "Validating findings across sources...": "competitors.validatingFindings",
  // pain-detective
  "Scanning forums and communities for discussions...": "pain.scanningForums",
  "Collecting user reviews and comments...": "pain.collectingReviews",
  "Clustering pain points by frequency and severity...": "pain.clustering",
  "Extracting representative quotes...": "pain.quotes",
  "Identifying unmet needs and opportunity areas...": "pain.unmetNeeds",
  "Building user personas from pain point patterns...": "pain.personas",
  // pricing-scout
  "Collecting competitor pricing pages...": "pricing.collecting",
  "Mapping price bands and tier structures...": "pricing.bands",
  "Analyzing monetization model prevalence...": "pricing.monetization",
  "Estimating willingness to pay by segment...": "pricing.willingnessToPay",
  "Benchmarking against category norms...": "pricing.benchmarking",
  "Formulating pricing recommendations...": "pricing.recommendations",
  // channel-scout
  "Mapping acquisition channel landscape...": "channels.mappingLandscape",
  "Scanning community hubs and forums...": "channels.scanningHubs",
  "Analyzing content topic search volume...": "channels.searchVolume",
  "Evaluating paid channel competitiveness...": "channels.paidCompetitiveness",
  "Assessing channel cost and effectiveness...": "channels.costEffectiveness",
  "Prioritizing channels by expected ROI...": "channels.prioritizingRoi",
  // synthesis
  "Collecting outputs from all research agents...": "synthesis.collecting",
  "Cross-validating findings across agents...": "synthesis.crossValidating",
  "Identifying highest-confidence insights...": "synthesis.confidence",
  "Assessing opportunity and risk scores...": "synthesis.scores",
  "Synthesizing executive summary...": "synthesis.executiveSummary",
  "Generating importable launch brief...": "synthesis.launchBrief",
};

/** True when s looks like an error prefix we should NOT translate verbatim. */
const ERROR_PREFIX = "Error:";

/**
 * Resolve a raw step string (from server state / SSE / cache) to a StepKey,
 * or `null` if it's a free-form (provider-specific) message that should be
 * rendered as-is.
 */
export function stepKeyFor(rawStep: string | null | undefined): StepKey | null {
  if (!rawStep) return null;
  if (rawStep.startsWith(ERROR_PREFIX)) return "error";
  const hit = LEGACY_STEP_MAP[rawStep];
  if (hit) return hit;
  // Allow callers to pass a literal key (e.g. from the engine after migration).
  if (rawStep.startsWith(STEP_PREFIX)) {
    return rawStep.slice(STEP_PREFIX.length) as StepKey;
  }
  return null;
}

/** Returns the dictionary key (e.g. "step.streaming") for a step. */
export function stepDictKey(rawStep: string | null | undefined): string | null {
  const k = stepKeyFor(rawStep);
  return k ? STEP_PREFIX + k : null;
}

/**
 * Forward map: StepKey → canonical English string.
 * Computed once by inverting LEGACY_STEP_MAP so callers (and tests) always
 * have a guaranteed-human-readable fallback for any well-known step even if
 * the dictionary entry is missing in a given locale build.
 */
export const STEP_ENGLISH: Record<StepKey, string> = (() => {
  const out = {} as Record<StepKey, string>;
  for (const [english, key] of Object.entries(LEGACY_STEP_MAP)) {
    out[key] = english;
  }
  return out;
})();

/**
 * Ordered plan steps for each research agent, expressed as dictionary keys.
 * The engine iterates these to drive the pre-streaming progress indicator;
 * the UI localises them via the same `step.<key>` table.
 */
export const AGENT_PLAN_STEPS: Record<
  Exclude<AgentId, "synthesis">,
  StepKey[]
> = {
  "market-sizer": [
    "market.boundaries",
    "market.tamData",
    "market.samSom",
    "market.growthTrends",
    "market.crossReference",
    "market.estimates",
  ],
  "competitor-analyst": [
    "competitors.identifying",
    "competitors.positioning",
    "competitors.featureMatrix",
    "competitors.strengthsWeaknesses",
    "competitors.gaps",
    "competitors.validatingFindings",
  ],
  "pain-detective": [
    "pain.scanningForums",
    "pain.collectingReviews",
    "pain.clustering",
    "pain.quotes",
    "pain.unmetNeeds",
    "pain.personas",
  ],
  "pricing-scout": [
    "pricing.collecting",
    "pricing.bands",
    "pricing.monetization",
    "pricing.willingnessToPay",
    "pricing.benchmarking",
    "pricing.recommendations",
  ],
  "channel-scout": [
    "channels.mappingLandscape",
    "channels.scanningHubs",
    "channels.searchVolume",
    "channels.paidCompetitiveness",
    "channels.costEffectiveness",
    "channels.prioritizingRoi",
  ],
};

export const SYNTHESIS_STEPS: StepKey[] = [
  "synthesis.collecting",
  "synthesis.crossValidating",
  "synthesis.confidence",
  "synthesis.scores",
  "synthesis.executiveSummary",
  "synthesis.launchBrief",
];
