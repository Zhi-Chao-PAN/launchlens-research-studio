import { getPersistentResearchRun, researchRunFromSession, storePersistentResearchRun } from "@/lib/research/run-store";
import { saveResearchRun } from "@/lib/research/storage";
import type { DeepRunRecordV1 } from "./model";
import type { DeepTerminalObserver } from "./service";
import { releaseDeepResearchAdmission } from "./admission";

/**
 * Materializes an authoritative terminal Deep record into the normal History
 * store. The conversion is derived and idempotent; it never changes Deep run
 * lifecycle or participates in lease/fencing decisions.
 */
export async function persistDeepTerminalRecord(record: DeepRunRecordV1): Promise<void> {
  if (record.lifecycle === "active") return;

  try {
    const existing = await getPersistentResearchRun(record.sessionId);
    const run = existing ?? researchRunFromSession(record.session);

    // Keep same-instance history and production Redis history consistent. The
    // local storage seam upserts by id, while the Redis write is skipped when a
    // terminal observer or later reconciliation already materialized the run.
    saveResearchRun(run);
    if (!existing) await storePersistentResearchRun(run);
  } finally {
    // Terminal lifecycle is authoritative. Release capacity early, while the
    // reservation TTL remains the crash-safe fallback if Redis is unavailable.
    await releaseDeepResearchAdmission(record.sessionId);
  }
}

export const researchRunDeepTerminalObserver: DeepTerminalObserver = {
  observe: persistDeepTerminalRecord,
};
