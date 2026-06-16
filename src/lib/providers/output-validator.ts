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

function validateCitations(arr: any, basePath: string): SourceCitation[] {
  if (!Array.isArray(arr)) throw new ValidationError("citations must be array", basePath);
  return arr.map((c, i) => {
    const p = basePath + "[" + i + "]";
    if (!isObject(c)) throw new ValidationError("citation must be object", p);
    if (typeof c.id !== "string") throw new ValidationError("citation.id missing", p);
    if (typeof c.title !== "string") throw new ValidationError("citation.title missing", p);
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
  const citations = validateCitations(candidate.citations ?? [], agentId + ".citations");
  candidate.citations = citations;
  return candidate as unknown as AgentOutput;
}
