import { getResearchRun, type ResearchRun } from "./storage";
import {
  getPersistentResearchRun,
  researchRunFromSession,
  storePersistentResearchRun,
} from "./run-store";
import { fetchSession } from "./session-store";

const TERMINAL_SESSION_STATUSES = new Set(["completed", "cancelled", "error"]);

/**
 * Resolve a report through the same recovery chain on every API surface.
 * Local memory/disk is fastest, Redis run persistence survives instance
 * switches, and the terminal session mirror is the final recovery source.
 */
export async function resolveResearchRun(id: string): Promise<ResearchRun | null> {
  const local = getResearchRun(id);
  if (local) return local;

  const persistent = await getPersistentResearchRun(id);
  if (persistent) return persistent;

  const session = await fetchSession(id);
  if (!session || !TERMINAL_SESSION_STATUSES.has(session.status)) return null;

  const recovered = researchRunFromSession(session);
  await storePersistentResearchRun(recovered);
  return recovered;
}
