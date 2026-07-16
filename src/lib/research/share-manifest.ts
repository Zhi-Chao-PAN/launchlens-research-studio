import type { ResearchRun } from "@/lib/research/storage";
import { canonicalizeSafeExternalUrl } from "@/lib/security/safe-external-url";
import { parseSynthesis } from "@/lib/research/synthesis-parser";

export const ALL_SHARE_SECTIONS = [
  "summary",
  "scores",
  "insights",
  "opportunities",
  "risks",
  "nextStep",
  "sources",
] as const;

/** UI-facing alias: a new share discloses the complete report by default. */
export const DEFAULT_SHARE_SECTIONS = ALL_SHARE_SECTIONS;

export type ShareSectionId = (typeof ALL_SHARE_SECTIONS)[number];

export interface ShareManifestV1 {
  version: 1;
  sections: ShareSectionId[];
}

export interface PublicShareInsight {
  insight: string;
  supportingAgents: string[];
  confidence: "high" | "medium" | "low";
}

export interface PublicShareOpportunity {
  title: string;
  description: string;
  rationale: string;
}

export interface PublicShareRisk {
  title: string;
  description: string;
  mitigation: string;
}

export interface PublicShareSource {
  title: string;
  url: string;
  snippet?: string;
}

export interface PublicShareReportV1 {
  version: 1;
  query: string;
  createdAt: number;
  durationMs: number;
  status: "completed";
  sections: {
    summary?: string;
    scores?: {
      opportunityScore: number;
      riskScore: number;
    };
    insights?: PublicShareInsight[];
    opportunities?: PublicShareOpportunity[];
    risks?: PublicShareRisk[];
    nextStep?: string;
    sources?: PublicShareSource[];
  };
}

export class ShareManifestValidationError extends Error {
  readonly code = "INVALID_SHARE_MANIFEST";

  constructor(message: string) {
    super(message);
    this.name = "ShareManifestValidationError";
  }
}

export class ShareProjectionError extends Error {
  readonly code = "UNSUPPORTED_SHARE_REPORT";

  constructor(message: string) {
    super(message);
    this.name = "ShareProjectionError";
  }
}

const SHARE_SECTION_SET = new Set<string>(ALL_SHARE_SECTIONS);

/**
 * Build the canonical, versioned disclosure manifest stored with a share.
 * Missing sections preserve the legacy behaviour (all sections selected).
 */
export function createShareManifest(input: unknown): ShareManifestV1 {
  if (input === undefined || input === null) {
    return { version: 1, sections: [...ALL_SHARE_SECTIONS] };
  }
  if (!Array.isArray(input)) {
    throw new ShareManifestValidationError("sections must be an array");
  }
  if (input.length === 0) {
    throw new ShareManifestValidationError("at least one share section is required");
  }

  const selected = new Set<ShareSectionId>();
  for (const value of input) {
    if (typeof value !== "string" || !SHARE_SECTION_SET.has(value)) {
      throw new ShareManifestValidationError(`invalid share section: ${String(value)}`);
    }
    selected.add(value as ShareSectionId);
  }

  return {
    version: 1,
    sections: ALL_SHARE_SECTIONS.filter((section) => selected.has(section)),
  };
}

/** Accept v1 records plus legacy records that did not store a manifest. */
export function normalizeStoredShareManifest(input: unknown): ShareManifestV1 {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return createShareManifest(undefined);
  }
  const candidate = input as { sections?: unknown };
  return createShareManifest(candidate.sections);
}

/**
 * Construct the complete public disclosure DTO at the server boundary.
 * This is intentionally an allowlist mapper: adding a field to ResearchRun
 * can never make it public without an explicit change here.
 */
export function buildPublicShareProjection(
  run: ResearchRun,
  manifest: ShareManifestV1,
): PublicShareReportV1 {
  if (run.status !== "completed") {
    throw new ShareProjectionError("only completed reports can be projected");
  }
  const synthesis = parseSynthesis(run.result);
  if (!synthesis) {
    throw new ShareProjectionError("the report does not have a structured synthesis");
  }

  const selected = new Set(manifest.sections);
  const sections: PublicShareReportV1["sections"] = {};

  if (selected.has("summary")) {
    sections.summary = boundedText(synthesis.execSummary, 12_000);
  }
  if (selected.has("scores")) {
    sections.scores = {
      opportunityScore: boundedScore(synthesis.opportunityScore, "opportunityScore"),
      riskScore: boundedScore(synthesis.riskScore, "riskScore"),
    };
  }
  if (selected.has("insights")) {
    sections.insights = normalizeInsights(synthesis.keyInsights);
  }
  if (selected.has("opportunities")) {
    sections.opportunities = normalizeOpportunities(synthesis.topThreeOpportunities);
  }
  if (selected.has("risks")) {
    sections.risks = normalizeRisks(synthesis.topThreeRisks);
  }
  if (selected.has("nextStep")) {
    sections.nextStep = boundedText(synthesis.recommendedNextStep, 8_000);
  }
  if (selected.has("sources")) {
    sections.sources = normalizeSources(synthesis.citations);
  }

  return {
    version: 1,
    query: boundedText(run.query, 2_000),
    createdAt: finiteNonNegative(run.createdAt),
    durationMs: finiteNonNegative(run.durationMs),
    status: "completed",
    sections,
  };
}

function normalizeInsights(value: unknown): PublicShareInsight[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 20).flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const item = entry as Record<string, unknown>;
    const confidence = item.confidence;
    if (confidence !== "high" && confidence !== "medium" && confidence !== "low") return [];
    const supportingAgents = Array.isArray(item.supportingAgents)
      ? item.supportingAgents
          .filter((agent): agent is string => typeof agent === "string")
          .slice(0, 8)
          .map((agent) => boundedText(agent, 100))
          .filter(Boolean)
      : [];
    return [{
      insight: boundedText(item.insight, 4_000),
      supportingAgents,
      confidence,
    }];
  });
}

function normalizeOpportunities(value: unknown): PublicShareOpportunity[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 10).flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const item = entry as Record<string, unknown>;
    return [{
      title: boundedText(item.title, 300),
      description: boundedText(item.description, 5_000),
      rationale: boundedText(item.rationale, 5_000),
    }];
  });
}

function normalizeRisks(value: unknown): PublicShareRisk[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 10).flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const item = entry as Record<string, unknown>;
    return [{
      title: boundedText(item.title, 300),
      description: boundedText(item.description, 5_000),
      mitigation: boundedText(item.mitigation, 5_000),
    }];
  });
}

function normalizeSources(value: unknown): PublicShareSource[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 100).flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const item = entry as Record<string, unknown>;
    const url = canonicalizeSafeExternalUrl(item.url);
    if (!url) return [];
    const snippet = boundedText(item.snippet, 2_000);
    return [{
      title: boundedText(item.title, 500) || url,
      url,
      ...(snippet ? { snippet } : {}),
    }];
  });
}

function boundedText(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function boundedScore(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 100) {
    throw new ShareProjectionError(`${field} must be a score between 0 and 100`);
  }
  return value;
}

function finiteNonNegative(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : 0;
}
