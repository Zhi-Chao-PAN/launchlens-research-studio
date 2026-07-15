import * as path from "node:path";
import { isValidResearchRunId } from "./run-id-validation";

export { isValidResearchRunId } from "./run-id-validation";

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
