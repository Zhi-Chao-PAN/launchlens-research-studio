import * as path from "node:path";

// Keep legacy alphanumeric, dash, and underscore IDs readable while excluding
// every path separator, dot segment, percent-encoded separator, and control.
const RESEARCH_RUN_ID_PATTERN = /^[a-zA-Z0-9_-]{1,128}$/;

export function isValidResearchRunId(id: unknown): id is string {
  return typeof id === "string" && RESEARCH_RUN_ID_PATTERN.test(id);
}

/** Resolve a run file only when it remains a direct child of `runsDir`. */
export function resolveResearchRunFilePath(
  runsDir: string,
  id: unknown,
): string | null {
  if (!isValidResearchRunId(id)) return null;

  const root = path.resolve(runsDir);
  const candidate = path.resolve(root, `${id}.json`);
  const directChildPrefix = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
  return candidate.startsWith(directChildPrefix) ? candidate : null;
}
