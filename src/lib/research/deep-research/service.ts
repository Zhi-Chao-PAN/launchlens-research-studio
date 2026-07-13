import type { AgentId, ResearchSession } from "@/lib/schema/research-schema";
import {
  cloneDeepRunRecord,
  createDeepWorkPlan,
  currentDeepWork,
  type DeepRunLease,
  type DeepRunRecordV1,
  type DeepWorkUnit,
} from "./model";
import type {
  DeepRunClaimResult,
  DeepRunCommitResult,
  DeepRunRepository,
} from "./repository";

export interface DeepExecutionProfile {
  generationProviderId: string;
  retrievalProviderId: string;
  reviewerProviderId: string;
}

export interface DeepWorkExecutor {
  execute(input: Readonly<{
    record: DeepRunRecordV1;
    work: DeepWorkUnit;
    signal?: AbortSignal;
  }>): Promise<ResearchSession>;
}

/** A fast wake-up mechanism only. Recovery durability lives in the due index. */
export interface DeepWakeDispatcher {
  dispatch(sessionId: string): Promise<void>;
}

/** Derived side effects that are safe only after the authoritative commit. */
export interface DeepTerminalObserver {
  observe(record: DeepRunRecordV1): Promise<void>;
}

export class DeepWorkExecutionError extends Error {
  constructor(
    readonly code: string,
    readonly retryable: boolean,
    publicMessage = "Deep Research stage failed.",
    options?: { cause?: unknown },
  ) {
    super(publicMessage, options);
    this.name = "DeepWorkExecutionError";
  }
}

export type DeepContinueResult =
  | { kind: "committed"; record: DeepRunRecordV1; wakeAccepted: boolean }
  | Exclude<DeepRunClaimResult, { kind: "claimed" }>
  | Exclude<DeepRunCommitResult, { kind: "committed" }>;

export type DeepSignal =
  | {
      kind: "continue";
      sessionId: string;
      workerId: string;
      signal?: AbortSignal;
    }
  | {
      kind: "cancel";
      sessionId: string;
      reasonCode?: string;
    }
  | {
      kind: "recover";
      limit?: number;
    };

export type DeepSignalResult =
  | DeepContinueResult
  | { kind: "cancelled" | "terminal" | "not_found"; record?: DeepRunRecordV1 }
  | { kind: "recovery_dispatched"; sessionIds: string[]; failedSessionIds: string[] };

export interface DeepResearchServiceOptions {
  repository: DeepRunRepository;
  executor: DeepWorkExecutor;
  dispatcher?: DeepWakeDispatcher;
  terminalObserver?: DeepTerminalObserver;
  now?: () => number;
  token?: () => string;
  leaseMs?: number;
  retryDelayMs?: (attempt: number) => number;
}

const DEFAULT_LEASE_MS = 250_000;
const MAX_RECOVERY_BATCH = 100;

/**
 * Durable, fixed-graph coordinator. Callers know only a session id; revision,
 * lease, fencing, retries, work ordering, and terminal precedence stay here.
 */
export class DeepResearchService {
  private readonly now: () => number;
  private readonly token: () => string;
  private readonly leaseMs: number;
  private readonly retryDelayMs: (attempt: number) => number;

  constructor(private readonly options: DeepResearchServiceOptions) {
    this.now = options.now ?? Date.now;
    this.token = options.token ?? (() => crypto.randomUUID());
    this.leaseMs = clampInteger(options.leaseMs ?? DEFAULT_LEASE_MS, 1_000, 290_000);
    this.retryDelayMs = options.retryDelayMs ?? defaultRetryDelayMs;
  }

  async start(
    session: ResearchSession,
    executionProfile: DeepExecutionProfile,
  ): Promise<{ record: DeepRunRecordV1; created: boolean; wakeAccepted: boolean }> {
    if (session.mode !== "deep") {
      throw new DeepWorkExecutionError(
        "invalid_mode",
        false,
        "Only Deep Research sessions can use the durable coordinator.",
      );
    }
    if (isTerminalSession(session)) {
      throw new DeepWorkExecutionError(
        "terminal_session",
        false,
        "A terminal research session cannot be started again.",
      );
    }

    const now = this.now();
    const projected = structuredClone(session);
    projected.status = "running";
    projected.updatedAt = new Date(now).toISOString();
    const record: DeepRunRecordV1 = {
      version: 1,
      sessionId: projected.id,
      revision: 0,
      lifecycle: "active",
      currentWorkIndex: 0,
      work: createDeepWorkPlan(),
      session: projected,
      createdAt: now,
      updatedAt: now,
      nextWakeAt: now,
      totalAttempts: 0,
      executionProfile: { ...executionProfile },
    };

    const outcome = await this.options.repository.create(record);
    const authoritative =
      outcome === "created" ? record : await this.options.repository.read(record.sessionId);
    if (!authoritative) {
      throw new DeepWorkExecutionError(
        "durable_state_missing",
        true,
        "Deep Research durable state could not be read after creation.",
      );
    }
    await this.observeTerminal(authoritative);
    const wakeAccepted =
      authoritative.lifecycle === "active" ? await this.dispatch(authoritative.sessionId) : false;
    return {
      record: authoritative,
      created: outcome === "created",
      wakeAccepted,
    };
  }

  async signal(signal: DeepSignal): Promise<DeepSignalResult> {
    if (signal.kind === "cancel") return this.cancel(signal);
    if (signal.kind === "recover") return this.recover(signal.limit);
    return this.continue(signal);
  }

  private async continue(input: Extract<DeepSignal, { kind: "continue" }>): Promise<DeepContinueResult> {
    const claim = await this.options.repository.claim({
      sessionId: input.sessionId,
      workerId: input.workerId,
      token: this.token(),
      now: this.now(),
      leaseMs: this.leaseMs,
    });
    if (claim.kind !== "claimed") return claim;

    const work = currentDeepWork(claim.record);
    if (!work) {
      const next = terminalError(
        claim.record,
        "invalid_work_plan",
        this.now(),
        "Deep Research work plan is incomplete.",
      );
      return this.commitAndMaybeWake(claim.record.revision, claim.lease, next);
    }

    let next: DeepRunRecordV1;
    try {
      const session = await this.options.executor.execute({
        record: cloneDeepRunRecord(claim.record),
        work: structuredClone(work),
        signal: input.signal,
      });
      assertProjectedSession(claim.record.sessionId, session, work);
      next = completeWork(claim.record, session, this.now());
    } catch (error) {
      const failure = normalizeExecutionError(error);
      next = failOrRetryWork(claim.record, failure, this.now(), this.retryDelayMs);
    }

    try {
      return await this.commitAndMaybeWake(claim.record.revision, claim.lease, next);
    } finally {
      // Successful commits compare-delete the lease. This releases only when
      // execution exited before a commit and can never delete a newer lease.
      await this.options.repository.release(input.sessionId, claim.lease).catch(() => false);
    }
  }

  private async cancel(
    input: Extract<DeepSignal, { kind: "cancel" }>,
  ): Promise<DeepSignalResult> {
    const now = this.now();
    const record = await this.options.repository.cancel({
      sessionId: input.sessionId,
      now,
      committedAt: new Date(now).toISOString(),
      reasonCode: input.reasonCode || "user_requested",
    });
    if (!record) return { kind: "not_found" };
    await this.observeTerminal(record);
    return record.lifecycle === "cancelled"
      ? { kind: "cancelled", record }
      : { kind: "terminal", record };
  }

  private async recover(limit = 25): Promise<DeepSignalResult> {
    const boundedLimit = clampInteger(limit, 1, MAX_RECOVERY_BATCH);
    const sessionIds = await this.options.repository.findDue(this.now(), boundedLimit);
    const failedSessionIds: string[] = [];
    for (const sessionId of sessionIds) {
      if (!(await this.dispatch(sessionId))) failedSessionIds.push(sessionId);
    }
    return { kind: "recovery_dispatched", sessionIds, failedSessionIds };
  }

  private async commitAndMaybeWake(
    expectedRevision: number,
    lease: DeepRunLease,
    next: DeepRunRecordV1,
  ): Promise<DeepContinueResult> {
    const committed = await this.options.repository.commit({
      sessionId: next.sessionId,
      expectedRevision,
      lease,
      next,
    });
    if (committed.kind !== "committed") return committed;
    await this.observeTerminal(committed.record);
    const wakeAccepted =
      committed.record.lifecycle === "active"
        ? await this.dispatch(committed.record.sessionId)
        : false;
    return { kind: "committed", record: committed.record, wakeAccepted };
  }

  private async dispatch(sessionId: string): Promise<boolean> {
    if (!this.options.dispatcher) return false;
    try {
      await this.options.dispatcher.dispatch(sessionId);
      return true;
    } catch {
      // The due index remains authoritative; a recovery wake can retry later.
      return false;
    }
  }

  private async observeTerminal(record: DeepRunRecordV1): Promise<void> {
    if (record.lifecycle === "active" || !this.options.terminalObserver) return;
    try {
      await this.options.terminalObserver.observe(cloneDeepRunRecord(record));
    } catch {
      // The terminal record is already authoritative and remains available for
      // idempotent reconciliation on a later read; observer failure cannot
      // reopen or rewrite its lifecycle.
    }
  }
}

function completeWork(
  claimed: DeepRunRecordV1,
  session: ResearchSession,
  now: number,
): DeepRunRecordV1 {
  const next = cloneDeepRunRecord(claimed);
  const work = currentDeepWork(next);
  if (!work) return terminalError(next, "invalid_work_plan", now, "Deep Research work plan is incomplete.");
  work.status = "done";
  work.finishedAt = now;
  delete work.lastError;
  delete work.nextAttemptAt;
  next.currentWorkIndex += 1;
  next.updatedAt = now;
  next.nextWakeAt = now;
  next.session = structuredClone(session);
  next.session.updatedAt = new Date(now).toISOString();

  if (work.kind === "finalize") {
    next.lifecycle = "completed";
    next.session.status = "completed";
    next.terminal = { status: "completed", committedAt: new Date(now).toISOString() };
  } else {
    next.lifecycle = "active";
    next.session.status = "running";
  }
  return next;
}

function failOrRetryWork(
  claimed: DeepRunRecordV1,
  failure: DeepWorkExecutionError,
  now: number,
  retryDelayMs: (attempt: number) => number,
): DeepRunRecordV1 {
  const next = cloneDeepRunRecord(claimed);
  const work = currentDeepWork(next);
  if (!work) return terminalError(next, "invalid_work_plan", now, "Deep Research work plan is incomplete.");

  work.lastError = {
    code: failure.code,
    message: failure.message,
    retryable: failure.retryable,
  };
  next.updatedAt = now;
  next.session.updatedAt = new Date(now).toISOString();
  if (failure.retryable && work.attempts < work.maxAttempts) {
    const delay = clampInteger(retryDelayMs(work.attempts), 1_000, 10 * 60_000);
    work.status = "retry_wait";
    work.nextAttemptAt = now + delay;
    next.nextWakeAt = now + delay;
    next.session.status = "running";
    return next;
  }

  work.status = "failed";
  work.finishedAt = now;
  return terminalError(next, failure.code, now, failure.message);
}

function terminalError(
  record: DeepRunRecordV1,
  reasonCode: string,
  now: number,
  message: string,
): DeepRunRecordV1 {
  const next = cloneDeepRunRecord(record);
  next.lifecycle = "error";
  next.updatedAt = now;
  next.nextWakeAt = now;
  next.session.status = "error";
  next.session.updatedAt = new Date(now).toISOString();
  const work = currentDeepWork(next);
  if (work && work.status !== "done") {
    work.status = "failed";
    work.finishedAt = now;
    work.lastError ??= { code: reasonCode, message, retryable: false };
  }
  next.terminal = {
    status: "error",
    committedAt: new Date(now).toISOString(),
    reasonCode,
  };
  return next;
}

function normalizeExecutionError(error: unknown): DeepWorkExecutionError {
  if (error instanceof DeepWorkExecutionError) return error;
  if (error instanceof DOMException && error.name === "AbortError") {
    return new DeepWorkExecutionError(
      "execution_aborted",
      true,
      "Deep Research stage was interrupted and will be retried.",
      { cause: error },
    );
  }
  return new DeepWorkExecutionError(
    "unexpected_execution_failure",
    true,
    "Deep Research stage failed unexpectedly and will be retried.",
    { cause: error },
  );
}

function assertProjectedSession(
  sessionId: string,
  session: ResearchSession,
  work: DeepWorkUnit,
): void {
  if (session.id !== sessionId || session.mode !== "deep") {
    throw new DeepWorkExecutionError(
      "invalid_session_projection",
      false,
      "Deep Research stage returned an invalid session projection.",
    );
  }
  const terminalBeforeFinalize =
    work.kind !== "finalize" &&
    (session.status === "completed" || session.status === "cancelled" || session.status === "error");
  if (terminalBeforeFinalize || session.status === "cancelled" || session.status === "error") {
    throw new DeepWorkExecutionError(
      "invalid_session_status",
      false,
      "Deep Research stage returned an invalid terminal session status.",
    );
  }
}

function isTerminalSession(session: ResearchSession): boolean {
  return session.status === "completed" || session.status === "cancelled" || session.status === "error";
}

function defaultRetryDelayMs(attempt: number): number {
  return Math.min(120_000, 5_000 * 2 ** Math.max(0, attempt - 1));
}

function clampInteger(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

/** Specialist agent ids accepted by the fixed work plan. */
export function isDeepSpecialistWork(work: DeepWorkUnit): work is DeepWorkUnit & { agentId: AgentId } {
  return work.kind === "specialist" && Boolean(work.agentId) && work.agentId !== "synthesis";
}
