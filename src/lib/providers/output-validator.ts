/* eslint-disable @typescript-eslint/no-explicit-any */
// Runtime validator for AgentOutput payloads received from real providers.
// Real LLM responses are notoriously fragile; this guard-rail rejects
// malformed JSON before it leaks into the UI. Throws ValidationError on
// failure so callers can transparently fall back to mock data.

import type { AgentId, AgentOutput, SourceCitation } from "@/lib/schema/research-schema";

export class ValidationError extends Error {
  readonly path: string;
  constructor(message: string, path: string) {
    super(message + " at " + path);
    this.name = "ValidationError";
    this.path = path;
  }
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function assertField(obj: any, key: string, kind: "string" | "number" | "array" | "object", basePath: string) {
  const v = obj[key];
  const path = basePath + "." + key;
  if (kind === "array" && !Array.isArray(v)) throw new ValidationError("expected array", path);
  if (kind === "object" && !isObject(v)) throw new ValidationError("expected object", path);
  if (kind === "string" && typeof v !== "string") throw new ValidationError("expected string", path);
  if (kind === "number" && typeof v !== "number") throw new ValidationError("expected number", path);
}

/** Assert a number is finite and within [min, max]. R203: the previous
 *  validator only checked top-level field presence, so a real LLM could
 *  return `marketSize.tam: "huge"` or `opportunityScore: 9999` and still
 *  pass. These nested checks reject semantically-garbage but
 *  structurally-present data. */
function assertNumberInRange(obj: any, key: string, min: number, max: number, basePath: string): void {
  const v = obj[key];
  const path = basePath + "." + key;
  if (typeof v !== "number" || !Number.isFinite(v)) {
    throw new ValidationError("expected finite number", path);
  }
  if (v < min || v > max) {
    throw new ValidationError(`expected number in [${min}, ${max}] but got ${v}`, path);
  }
}

/** Assert a string is non-empty after trimming. */
function assertNonEmptyString(obj: any, key: string, basePath: string): void {
  const v = obj[key];
  const path = basePath + "." + key;
  if (typeof v !== "string" || v.trim() === "") {
    throw new ValidationError("expected non-empty string", path);
  }
}

function validateCitations(arr: any, basePath: string): SourceCitation[] {
  if (!Array.isArray(arr)) throw new ValidationError("citations must be array", basePath);
  return arr.map((c, i) => {
    const p = basePath + "[" + i + "]";
    if (!isObject(c)) throw new ValidationError("citation must be object", p);
    if (typeof c.id !== "string") throw new ValidationError("citation.id missing", p);
    if (typeof c.title !== "string") throw new ValidationError("citation.title missing", p);
    // R203: a citation without a snippet is structurally present but
    // semantically useless (it carries no evidence). Reject so the real
    // provider fallback to mock kicks in instead of showing empty sources.
    if (typeof c.snippet !== "string" || c.snippet.trim() === "") {
      throw new ValidationError("citation.snippet must be a non-empty string", p);
    }
    return c as unknown as SourceCitation;
  });
}

const REQUIRED_FIELDS: Record<AgentId, { kind: "string" | "number" | "array" | "object"; key: string }[]> = {
  "market-sizer": [
    { key: "summary", kind: "string" },
    { key: "marketSize", kind: "object" },
    { key: "keyTrends", kind: "array" },
    { key: "targetSegments", kind: "array" },
  ],
  "competitor-analyst": [
    { key: "summary", kind: "string" },
    { key: "competitors", kind: "array" },
  ],
  "pain-detective": [
    { key: "summary", kind: "string" },
    { key: "painPoints", kind: "array" },
  ],
  "pricing-scout": [
    { key: "summary", kind: "string" },
    { key: "priceBands", kind: "array" },
  ],
  "channel-scout": [
    { key: "summary", kind: "string" },
    { key: "channels", kind: "array" },
  ],
  "synthesis": [
    { key: "summary", kind: "string" },
    { key: "keyInsights", kind: "array" },
  ],
};

export function validateAgentOutput(agentId: AgentId, candidate: unknown): AgentOutput {
  if (!isObject(candidate)) {
    throw new ValidationError("output must be an object", agentId);
  }
  if (candidate.agent !== agentId) {
    candidate.agent = agentId;
  }
  const required = REQUIRED_FIELDS[agentId];
  for (const field of required) {
    assertField(candidate, field.key, field.kind, agentId);
  }

  // R203: per-agent deep validation. The shallow checks above only verify
  // field presence and top-level type; these nested checks catch the common
  // LLM failure modes (NaN scores, empty arrays presented as "findings",
  // market-size objects missing the actual size numbers).
  if (agentId === "market-sizer") {
    const ms = candidate.marketSize;
    if (isObject(ms)) {
      if ("tam" in ms) assertNumberInRange(ms, "tam", 0, Number.MAX_SAFE_INTEGER, agentId + ".marketSize");
      if ("sam" in ms) assertNumberInRange(ms, "sam", 0, Number.MAX_SAFE_INTEGER, agentId + ".marketSize");
      if ("som" in ms) assertNumberInRange(ms, "som", 0, Number.MAX_SAFE_INTEGER, agentId + ".marketSize");
    }
  }
  if (agentId === "synthesis") {
    if ("opportunityScore" in candidate) {
      assertNumberInRange(candidate, "opportunityScore", 0, 100, agentId);
    }
    if ("riskScore" in candidate) {
      assertNumberInRange(candidate, "riskScore", 0, 100, agentId);
    }
  }
  // Every agent must carry at least one citation — an uncited claim set
  // defeats the whole evidence-based premise of the studio.
  const citations = validateCitations(candidate.citations ?? [], agentId + ".citations");
  if (citations.length === 0) {
    throw new ValidationError("at least one citation is required", agentId + ".citations");
  }
  candidate.citations = citations;
  return candidate as unknown as AgentOutput;
}
