/* eslint-disable @typescript-eslint/no-explicit-any */
// Runtime validator for AgentOutput payloads received from real providers.
// Real LLM responses are notoriously fragile; this guard-rail rejects
// malformed JSON before it leaks into the UI. Throws ValidationError on
// failure so callers can transparently fall back to mock data. Missing
// optional arrays are defaulted to []; missing confidence defaults to
// "medium"; missing accessedAt is filled in.

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
  if (kind === "object" && !isObject(v)) throw new ValidationError("expected object", path);
  if (kind === "string" && typeof v !== "string") throw new ValidationError("expected string", path);
  if (kind === "number" && typeof v !== "number") throw new ValidationError("expected number", path);
  // Arrays: throw if present and wrong type; if missing/undefined, default to []
  if (kind === "array") {
    if (v === undefined || v === null) {
      obj[key] = [];
      return;
    }
    if (!Array.isArray(v)) throw new ValidationError("expected array", path);
  }
}

function validateCitations(arr: any, basePath: string): SourceCitation[] {
  if (!Array.isArray(arr)) return [];
  return arr.map((c, i) => {
    const p = basePath + "[" + i + "]";
    if (!isObject(c)) throw new ValidationError("citation must be object", p);
    if (typeof c.id !== "string") throw new ValidationError("citation.id missing", p);
    if (typeof c.title !== "string") throw new ValidationError("citation.title missing", p);
    if (typeof c.snippet !== "string") c.snippet = "";
    if (typeof c.accessedAt !== "string") c.accessedAt = new Date().toISOString();
    if (typeof c.confidence !== "string" || !["low", "medium", "high"].includes(c.confidence)) {
      c.confidence = "medium";
    }
    return c as unknown as SourceCitation;
  });
}

// Core required fields per agent. We require the identifying summary/
// execSummary strings and the primary array fields, but permissively
// default secondary arrays to [] so LLM outputs that omit non-critical
// sections still render.
const REQUIRED_FIELDS: Record<AgentId, { kind: "string" | "number" | "array" | "object"; key: string }[]> = {
  "market-sizer": [
    { key: "summary", kind: "string" },
    { key: "marketSize", kind: "object" },
    { key: "keyTrends", kind: "array" },
    { key: "targetSegments", kind: "array" },
    { key: "citations", kind: "array" },
  ],
  "competitor-analyst": [
    { key: "summary", kind: "string" },
    { key: "competitors", kind: "array" },
    { key: "competitiveMatrix", kind: "array" },
    { key: "gaps", kind: "array" },
    { key: "citations", kind: "array" },
  ],
  "pain-detective": [
    { key: "summary", kind: "string" },
    { key: "painPoints", kind: "array" },
    { key: "unmetNeeds", kind: "array" },
    { key: "userPersonas", kind: "array" },
    { key: "citations", kind: "array" },
  ],
  "pricing-scout": [
    { key: "summary", kind: "string" },
    { key: "priceBands", kind: "array" },
    { key: "competitorPricing", kind: "array" },
    { key: "monetizationModels", kind: "array" },
    { key: "willingnessToPay", kind: "array" },
    { key: "recommendations", kind: "array" },
    { key: "citations", kind: "array" },
  ],
  "channel-scout": [
    { key: "summary", kind: "string" },
    { key: "channels", kind: "array" },
    { key: "communityHubs", kind: "array" },
    { key: "contentTopics", kind: "array" },
    { key: "recommendedChannels", kind: "array" },
    { key: "citations", kind: "array" },
  ],
  "synthesis": [
    { key: "execSummary", kind: "string" },
    { key: "opportunityScore", kind: "number" },
    { key: "riskScore", kind: "number" },
    { key: "keyInsights", kind: "array" },
    { key: "topThreeOpportunities", kind: "array" },
    { key: "topThreeRisks", kind: "array" },
    { key: "recommendedNextStep", kind: "string" },
    { key: "launchlensBrief", kind: "string" },
    { key: "citations", kind: "array" },
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
  // Clamp scores to valid range
  if (agentId === "synthesis") {
    const c = candidate as any;
    if (typeof c.opportunityScore === "number") {
      c.opportunityScore = Math.max(0, Math.min(100, Math.round(c.opportunityScore)));
    }
    if (typeof c.riskScore === "number") {
      c.riskScore = Math.max(0, Math.min(100, Math.round(c.riskScore)));
    }
  }
  const citations = validateCitations(candidate.citations ?? [], agentId + ".citations");
  candidate.citations = citations;
  return candidate as unknown as AgentOutput;
}
