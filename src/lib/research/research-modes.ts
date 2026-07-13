/**
 * Stable contract for research depth across UI, API, sessions, and history.
 *
 * Deep Research is intentionally represented before its async worker exists so
 * the product can preview the protocol without pretending the request-bound
 * SSE runtime can safely execute work beyond Vercel's 300 second limit.
 */
export type ResearchModeId = "standard" | "deep";

export type ResearchModeAvailability = "available" | "preview";

export interface ResearchModeConfig {
  id: ResearchModeId;
  label: string;
  description: string;
  depthLabel: string;
  /** Target wall-clock duration for this protocol, in seconds. */
  expectedDurationSec: Readonly<{ min: number; max: number }>;
  expectedDurationLabel: string;
  retrieval: "optional" | "required";
  /** Number of validation passes in the mode's target protocol. */
  validationPasses: number;
  requiresAsyncExecution: boolean;
  availability: ResearchModeAvailability;
  /** Hard ceiling of the current request-bound SSE execution path. */
  maxSynchronousDurationSec: 300;
  capabilityNotice: string;
}

export const DEFAULT_RESEARCH_MODE: ResearchModeId = "standard";

export const RESEARCH_MODE_CONFIGS = {
  standard: {
    id: "standard",
    label: "Standard",
    description: "A focused 5+1 agent scan with one synthesis pass for exploratory decisions.",
    depthLabel: "Focused evidence scan",
    expectedDurationSec: { min: 180, max: 300 },
    expectedDurationLabel: "3-5 min",
    retrieval: "optional",
    validationPasses: 1,
    requiresAsyncExecution: false,
    availability: "available",
    maxSynchronousDurationSec: 300,
    capabilityNotice: "Runs inside the current request-bound 300-second execution window.",
  },
  deep: {
    id: "deep",
    label: "Deep Research",
    description: "A durable evidence-first protocol with mandatory retrieval and three ordered semantic reviews.",
    depthLabel: "Multi-pass evidence audit",
    expectedDurationSec: { min: 600, max: 1200 },
    expectedDurationLabel: "10-20 min target",
    retrieval: "required",
    validationPasses: 3,
    requiresAsyncExecution: true,
    availability: "preview",
    maxSynchronousDurationSec: 300,
    capabilityNotice:
      "Async Preview until durable state, real providers, authenticated worker wake, and independent recovery are verified; no run beyond the 300-second request window will start.",
  },
} as const satisfies Readonly<Record<ResearchModeId, ResearchModeConfig>>;

export function isResearchModeId(value: unknown): value is ResearchModeId {
  return value === "standard" || value === "deep";
}

/** Normalize legacy or untrusted values without breaking Standard callers. */
export function normalizeResearchMode(value: unknown): ResearchModeId {
  return isResearchModeId(value) ? value : DEFAULT_RESEARCH_MODE;
}

export function getResearchModeConfig(mode: ResearchModeId): ResearchModeConfig {
  return RESEARCH_MODE_CONFIGS[mode];
}
