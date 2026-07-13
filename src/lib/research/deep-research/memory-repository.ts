import {
  cloneDeepRunRecord,
  currentDeepWork,
  isDeepRunTerminal,
  type DeepRunLease,
  type DeepRunRecordV1,
} from "./model";
import type {
  DeepRunClaimResult,
  DeepRunCommitResult,
  DeepRunDeleteResult,
  DeepRunRepository,
} from "./repository";

/** Behavioural test/local adapter. It models revision and fencing semantics. */
export class MemoryDeepRunRepository implements DeepRunRepository {
  private readonly records = new Map<string, DeepRunRecordV1>();
  private readonly leases = new Map<string, DeepRunLease>();
  private readonly fences = new Map<string, number>();

  async create(record: DeepRunRecordV1): Promise<"created" | "exists"> {
    if (this.records.has(record.sessionId)) return "exists";
    this.records.set(record.sessionId, cloneDeepRunRecord(record));
    return "created";
  }

  async read(sessionId: string): Promise<DeepRunRecordV1 | null> {
    const record = this.records.get(sessionId);
    return record ? cloneDeepRunRecord(record) : null;
  }

  async claim(input: {
    sessionId: string;
    workerId: string;
    token: string;
    now: number;
    leaseMs: number;
  }): Promise<DeepRunClaimResult> {
    const current = this.records.get(input.sessionId);
    if (!current) return { kind: "not_found" };
    if (isDeepRunTerminal(current)) {
      return { kind: "terminal", record: cloneDeepRunRecord(current) };
    }
    if (current.nextWakeAt > input.now) {
      return { kind: "not_due", record: cloneDeepRunRecord(current) };
    }

    const existingLease = this.leases.get(input.sessionId);
    if (existingLease && existingLease.expiresAt > input.now) {
      return { kind: "busy", record: cloneDeepRunRecord(current) };
    }

    const fencingEpoch = (this.fences.get(input.sessionId) ?? 0) + 1;
    this.fences.set(input.sessionId, fencingEpoch);
    const lease: DeepRunLease = {
      token: input.token,
      workerId: input.workerId,
      fencingEpoch,
      expiresAt: input.now + input.leaseMs,
    };
    this.leases.set(input.sessionId, lease);

    const next = cloneDeepRunRecord(current);
    const work = currentDeepWork(next);
    if (work) {
      work.status = "running";
      work.attempts += 1;
      work.startedAt = input.now;
      delete work.nextAttemptAt;
      next.totalAttempts += 1;
    }
    next.revision += 1;
    next.updatedAt = input.now;
    this.records.set(input.sessionId, next);
    return {
      kind: "claimed",
      record: cloneDeepRunRecord(next),
      lease: { ...lease },
    };
  }

  async commit(input: {
    sessionId: string;
    expectedRevision: number;
    lease: DeepRunLease;
    next: DeepRunRecordV1;
  }): Promise<DeepRunCommitResult> {
    const current = this.records.get(input.sessionId);
    if (!current) return { kind: "not_found" };
    if (isDeepRunTerminal(current)) {
      return { kind: "terminal", record: cloneDeepRunRecord(current) };
    }
    const lease = this.leases.get(input.sessionId);
    if (!sameLease(lease, input.lease) || input.lease.expiresAt <= Date.now()) {
      return { kind: "stale_lease", record: cloneDeepRunRecord(current) };
    }
    if (current.revision !== input.expectedRevision) {
      return { kind: "revision_conflict", record: cloneDeepRunRecord(current) };
    }
    const next = cloneDeepRunRecord(input.next);
    next.revision = input.expectedRevision + 1;
    this.records.set(input.sessionId, next);
    this.leases.delete(input.sessionId);
    return { kind: "committed", record: cloneDeepRunRecord(next) };
  }

  async cancel(input: {
    sessionId: string;
    now: number;
    committedAt: string;
    reasonCode?: string;
  }): Promise<DeepRunRecordV1 | null> {
    const current = this.records.get(input.sessionId);
    if (!current) return null;
    if (isDeepRunTerminal(current)) return cloneDeepRunRecord(current);

    const next = cloneDeepRunRecord(current);
    next.lifecycle = "cancelled";
    next.revision += 1;
    next.updatedAt = input.now;
    next.nextWakeAt = input.now;
    next.terminal = {
      status: "cancelled",
      committedAt: input.committedAt,
      ...(input.reasonCode ? { reasonCode: input.reasonCode } : {}),
    };
    next.session.status = "cancelled";
    next.session.updatedAt = input.committedAt;
    const work = currentDeepWork(next);
    if (work && work.status !== "done") work.status = "cancelled";
    this.records.set(input.sessionId, next);
    this.leases.delete(input.sessionId);
    return cloneDeepRunRecord(next);
  }

  async release(sessionId: string, lease: DeepRunLease): Promise<boolean> {
    const current = this.leases.get(sessionId);
    if (!sameLease(current, lease)) return false;
    this.leases.delete(sessionId);
    return true;
  }

  async findDue(now: number, limit: number): Promise<string[]> {
    return [...this.records.values()]
      .filter((record) => record.lifecycle === "active" && record.nextWakeAt <= now)
      .sort((left, right) => left.nextWakeAt - right.nextWakeAt)
      .slice(0, Math.max(0, limit))
      .map((record) => record.sessionId);
  }

  async deleteTerminal(sessionId: string): Promise<DeepRunDeleteResult> {
    const current = this.records.get(sessionId);
    if (!current) return { kind: "not_found" };
    if (!isDeepRunTerminal(current)) {
      return { kind: "active", record: cloneDeepRunRecord(current) };
    }
    const record = cloneDeepRunRecord(current);
    this.records.delete(sessionId);
    this.leases.delete(sessionId);
    this.fences.delete(sessionId);
    return { kind: "deleted", record };
  }
}

function sameLease(left: DeepRunLease | undefined, right: DeepRunLease): boolean {
  return Boolean(
    left &&
      left.token === right.token &&
      left.workerId === right.workerId &&
      left.fencingEpoch === right.fencingEpoch,
  );
}
