// Browser-safe validation shared by client history and server persistence.
// Keep legacy alphanumeric, dash, and underscore IDs readable while excluding
// every path separator, dot segment, percent-encoded separator, and control.
const RESEARCH_RUN_ID_PATTERN = /^[a-zA-Z0-9_-]{1,128}$/;

export function isValidResearchRunId(id: unknown): id is string {
  return typeof id === "string" && RESEARCH_RUN_ID_PATTERN.test(id);
}
