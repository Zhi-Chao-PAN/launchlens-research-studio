import { NextResponse, type NextRequest } from "next/server";
import { tickSchedules } from "@/lib/research/scheduler";
import { pruneStaleSessions } from "@/lib/research/research-engine";
import { resolveDeepWorkerOrigin } from "@/lib/research/deep-research/capability";
import { createDeepResearchService } from "@/lib/research/deep-research/runtime";
import {
  acquireRecoveryLock,
  hasSuccessfulRecoveryMessageId,
  markSuccessfulRecoveryMessageId,
  releaseRecoveryLock,
  writeRecoveryHeartbeat,
} from "@/lib/research/deep-research/recovery-heartbeat";
import {
  authenticateQStashRecoveryRequest,
  QSTASH_RECOVERY_PRODUCTION_URL,
  QSTASH_RECOVERY_SCHEDULE_ID,
  QStashRecoveryAuthError,
  type VerifiedQStashRecoveryContext,
} from "@/lib/research/deep-research/qstash-recovery-auth";
import {
  isManagedKeyringEnabled,
  resolveManagedKeyringProvider,
} from "@/lib/providers/managed-keyring-config";

// QStash is the sole production recovery authority. The signature verifier
// binds each request to the raw body, exact production URL, stable schedule ID,
// and rotating signing keys. A shared bearer secret is intentionally not an
// accepted fallback because it cannot prove which scheduler produced a tick.
const EXPECTED_RECOVERY_BODY = { version: 1, kind: "deep-recovery" } as const;
const QSTASH_NON_RETRYABLE_STATUS = 489;

export async function POST(request: NextRequest) {
  let delivery: VerifiedQStashRecoveryContext;
  try {
    delivery = await authenticateQStashRecoveryRequest(request, process.env);
  } catch (error) {
    if (error instanceof QStashRecoveryAuthError) {
      return nonRetryableResponse(error.code);
    }
    return NextResponse.json(
      { ok: false, error: "scheduler_authentication_failed" },
      { status: 500 },
    );
  }

  if (!isExpectedRecoveryBody(delivery.rawBody)) {
    return nonRetryableResponse("delivery_contract_invalid");
  }

  if (await hasSuccessfulRecoveryMessageId(delivery.messageId)) {
    return NextResponse.json({
      ok: true,
      deduped: true,
      timestamp: new Date().toISOString(),
    });
  }

  const requestId = delivery.messageId;
  const lock = await acquireRecoveryLock({ requestId });
  if (!lock.acquired) {
    // A 5xx asks QStash to retry this delivery after the single-flight owner
    // exits. Returning 200 here would acknowledge work that never wrote a
    // source-bound heartbeat.
    return NextResponse.json(
      { ok: false, error: "scheduler_busy" },
      { status: 503 },
    );
  }

  const startedAt = Date.now();
  let dispatched = 0;
  let failed = 0;
  try {
    const triggered = await tickSchedules();
    let deepRecovery:
      | { kind: "disabled" }
      | { kind: "structural-blocked" }
      | { kind: "recovered"; dispatched: number; failed: number } = {
        kind: "disabled",
      };

    if (process.env.LAUNCHLENS_DEEP_ENABLED === "1") {
      const structural = checkStructuralRecoveryReadiness(process.env);
      if (structural.ready) {
        const result = await createDeepResearchService().signal({
          kind: "recover",
          limit: 25,
        });
        ({ dispatched, failed } = summarizeRecoveryResult(result));
        deepRecovery = { kind: "recovered", dispatched, failed };
      } else {
        // Detailed dependency state is available from the capability endpoint;
        // do not copy provider configuration into QStash delivery logs.
        deepRecovery = { kind: "structural-blocked" };
      }
    }

    const pruned = pruneStaleSessions();
    const durationMs = Date.now() - startedAt;
    await writeRecoveryHeartbeat({
      ok: true,
      requestId,
      durationMs,
      dispatched,
      failed,
      ...heartbeatDeliveryMetadata(delivery),
    });
    const committed = await markSuccessfulRecoveryMessageId(delivery.messageId);
    if (!committed) {
      const error = new Error("Recovery message completion was not committed");
      error.name = "RecoveryMessageCommitError";
      throw error;
    }

    return NextResponse.json({
      ok: true,
      triggered,
      pruned,
      deepRecovery,
      timestamp: new Date().toISOString(),
      durationMs,
    });
  } catch (error) {
    await writeRecoveryHeartbeat({
      ok: false,
      requestId,
      durationMs: Date.now() - startedAt,
      dispatched,
      failed,
      errorCode: error instanceof Error ? error.name : "SchedulerTickError",
      ...heartbeatDeliveryMetadata(delivery),
    });
    return NextResponse.json(
      { ok: false, error: "scheduler_tick_failed" },
      { status: 500 },
    );
  } finally {
    await releaseRecoveryLock(requestId);
  }
}

// The production schedule is pinned to POST. Keeping an explicit response
// makes accidental GET probes fail clearly without executing recovery.
export async function GET() {
  return NextResponse.json(
    { ok: false, error: "method_not_allowed" },
    { status: 405, headers: { Allow: "POST" } },
  );
}

function nonRetryableResponse(code: string) {
  return NextResponse.json(
    { ok: false, error: "scheduler_request_rejected", code },
    {
      status: QSTASH_NON_RETRYABLE_STATUS,
      headers: { "Upstash-NonRetryable-Error": "true" },
    },
  );
}

function isExpectedRecoveryBody(rawBody: string): boolean {
  try {
    const parsed = JSON.parse(rawBody) as Record<string, unknown>;
    return (
      parsed.version === EXPECTED_RECOVERY_BODY.version &&
      parsed.kind === EXPECTED_RECOVERY_BODY.kind &&
      Object.keys(parsed).length === 2
    );
  } catch {
    return false;
  }
}

function heartbeatDeliveryMetadata(delivery: VerifiedQStashRecoveryContext) {
  return {
    source: delivery.source,
    scheduleId: delivery.scheduleId,
    destination: delivery.recoveryUrl,
    messageId: delivery.messageId,
    attempt: delivery.retried,
  } as const;
}

function summarizeRecoveryResult(result: unknown): {
  dispatched: number;
  failed: number;
} {
  if (!result || typeof result !== "object") {
    return { dispatched: 0, failed: 0 };
  }
  const value = result as {
    sessionIds?: unknown;
    failedSessionIds?: unknown;
    dispatched?: unknown;
    failed?: unknown;
  };
  if (Array.isArray(value.sessionIds) || Array.isArray(value.failedSessionIds)) {
    return {
      dispatched: Array.isArray(value.sessionIds) ? value.sessionIds.length : 0,
      failed: Array.isArray(value.failedSessionIds)
        ? value.failedSessionIds.length
        : 0,
    };
  }
  return {
    dispatched: typeof value.dispatched === "number" ? value.dispatched : 0,
    failed: typeof value.failed === "number" ? value.failed : 0,
  };
}

/**
 * Structural readiness for a recovery tick. This intentionally excludes
 * heartbeat freshness because the tick itself produces that observation.
 */
export function checkStructuralRecoveryReadiness(
  env: Readonly<Record<string, string | undefined>> = process.env,
): { ready: boolean; missing: string[] } {
  const missing: string[] = [];
  if (env.LAUNCHLENS_DEEP_ENABLED !== "1") missing.push("deep-not-enabled");
  if (env.LAUNCHLENS_DEEP_RECOVERY_SOURCE !== "qstash") {
    missing.push("qstash-source");
  }
  const currentSigningKey =
    env.LAUNCHLENS_QSTASH_CURRENT_SIGNING_KEY ||
    env.QSTASH_CURRENT_SIGNING_KEY ||
    "";
  const nextSigningKey =
    env.LAUNCHLENS_QSTASH_NEXT_SIGNING_KEY || env.QSTASH_NEXT_SIGNING_KEY || "";
  if (
    currentSigningKey.length < 24 ||
    nextSigningKey.length < 24 ||
    currentSigningKey === nextSigningKey
  ) {
    missing.push("qstash-signing-keys");
  }
  if (
    env.LAUNCHLENS_QSTASH_RECOVERY_SCHEDULE_ID !==
    QSTASH_RECOVERY_SCHEDULE_ID
  ) {
    missing.push("qstash-schedule-id");
  }
  if (env.LAUNCHLENS_QSTASH_RECOVERY_URL !== QSTASH_RECOVERY_PRODUCTION_URL) {
    missing.push("qstash-recovery-url");
  }

  const workerSecret = env.LAUNCHLENS_DEEP_WORKER_SECRET || "";
  if (workerSecret.length < 24) missing.push("worker-secret");
  if (!resolveDeepWorkerOrigin(env)) missing.push("worker-origin");

  const keyringEnabled = isManagedKeyringEnabled(env);
  const managedProvider = resolveManagedKeyringProvider(env);
  const hasLegacyProviderKey = Boolean(
    env.OPENAI_API_KEY || env.LAUNCHLENS_OPENAI_KEY || env.ANTHROPIC_API_KEY,
  );
  if (keyringEnabled ? !managedProvider : !hasLegacyProviderKey) {
    missing.push("provider-key");
  }
  if (env.LAUNCHLENS_PROVIDER?.trim().toLowerCase() === "mock") {
    missing.push("provider-forced-mock");
  }

  if (!env.TAVILY_API_KEY) missing.push("retrieval-key");
  if (env.LAUNCHLENS_SEARCH_PROVIDER === "mock") {
    missing.push("retrieval-forced-mock");
  }

  const managedReviewerOverride = env.LAUNCHLENS_REVIEW_PROVIDER
    ?.trim()
    .toLowerCase();
  const managedReviewerReady = Boolean(
    managedProvider &&
      managedReviewerOverride !== "mock" &&
      (!managedReviewerOverride || managedReviewerOverride === managedProvider),
  );
  const legacyReviewerReady = Boolean(
    env.LAUNCHLENS_REVIEW_OPENAI_KEY ||
      env.LAUNCHLENS_REVIEW_ANTHROPIC_KEY ||
      env.OPENAI_API_KEY ||
      env.LAUNCHLENS_OPENAI_KEY ||
      env.ANTHROPIC_API_KEY,
  );
  if (keyringEnabled ? !managedReviewerReady : !legacyReviewerReady) {
    missing.push("reviewer-key");
  }

  if (
    !(env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL) ||
    !(env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN)
  ) {
    missing.push("redis");
  }
  return { ready: missing.length === 0, missing };
}
