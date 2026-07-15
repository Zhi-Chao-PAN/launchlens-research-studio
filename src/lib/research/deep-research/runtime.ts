import type { ResearchSession } from "@/lib/schema/research-schema";
import { setCancelFlag } from "@/lib/research/session-store";
import { resolveDeepWorkerOrigin } from "./capability";
import { HttpDeepWakeDispatcher } from "./dispatcher";
import {
  createProductionDeepWorkExecutor,
  currentDeepExecutionProfile,
} from "./executor";
import { RedisDeepRunRepository } from "./redis-repository";
import { DeepResearchService } from "./service";
import {
  persistDeepTerminalRecord,
  researchRunDeepTerminalObserver,
} from "./terminal-persistence";

export function createDeepResearchService(): DeepResearchService {
  const origin = resolveDeepWorkerOrigin();
  const secret = process.env.LAUNCHLENS_DEEP_WORKER_SECRET || "";
  const dispatcher =
    origin && secret.length >= 24
      ? new HttpDeepWakeDispatcher({
          origin,
          secret,
          protectionBypassSecret: process.env.VERCEL_AUTOMATION_BYPASS_SECRET,
        })
      : undefined;
  return new DeepResearchService({
    repository: new RedisDeepRunRepository(),
    executor: createProductionDeepWorkExecutor(),
    terminalObserver: researchRunDeepTerminalObserver,
    ...(dispatcher ? { dispatcher } : {}),
  });
}

export async function startDeepResearchSession(session: ResearchSession) {
  const profile = currentDeepExecutionProfile();
  if (!profile) {
    throw new Error("Deep Research strict providers are not configured.");
  }
  return createDeepResearchService().start(session, profile);
}

export async function readDeepResearchRecord(sessionId: string) {
  const record = await new RedisDeepRunRepository().read(sessionId);
  if (record && record.lifecycle !== "active") await persistDeepTerminalRecord(record);
  return record;
}

export async function cancelDeepResearchSession(sessionId: string, reasonCode = "user_requested") {
  const now = Date.now();
  const record = await new RedisDeepRunRepository().cancel({
    sessionId,
    now,
    committedAt: new Date(now).toISOString(),
    reasonCode,
  });
  if (record?.lifecycle === "cancelled") {
    await Promise.all([
      setCancelFlag(sessionId),
      persistDeepTerminalRecord(record),
    ]);
  } else if (record?.lifecycle === "completed" || record?.lifecycle === "error") {
    await persistDeepTerminalRecord(record);
  }
  return record;
}

/**
 * Removes only terminal Deep live-state after its dossier has been reconciled
 * into History. Active records are returned unchanged so callers can require
 * an explicit cancellation instead of orphaning a leased worker.
 */
export async function deleteTerminalDeepResearchSession(sessionId: string) {
  const repository = new RedisDeepRunRepository();
  const record = await repository.read(sessionId);
  if (!record) return { kind: "not_found" } as const;
  if (record.lifecycle === "active") return { kind: "active", record } as const;
  await persistDeepTerminalRecord(record);
  return repository.deleteTerminal(sessionId);
}
