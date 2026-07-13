import type {
  DeepRunLease,
  DeepRunRecordV1,
} from "./model";

export type DeepRunClaimResult =
  | { kind: "claimed"; record: DeepRunRecordV1; lease: DeepRunLease }
  | { kind: "busy"; record: DeepRunRecordV1 }
  | { kind: "not_due"; record: DeepRunRecordV1 }
  | { kind: "terminal"; record: DeepRunRecordV1 }
  | { kind: "not_found" };

export type DeepRunCommitResult =
  | { kind: "committed"; record: DeepRunRecordV1 }
  | { kind: "revision_conflict"; record: DeepRunRecordV1 }
  | { kind: "stale_lease"; record?: DeepRunRecordV1 }
  | { kind: "terminal"; record: DeepRunRecordV1 }
  | { kind: "not_found" };

export type DeepRunDeleteResult =
  | { kind: "deleted"; record: DeepRunRecordV1 }
  | { kind: "active"; record: DeepRunRecordV1 }
  | { kind: "not_found" };

export interface DeepRunRepository {
  create(record: DeepRunRecordV1): Promise<"created" | "exists">;
  read(sessionId: string): Promise<DeepRunRecordV1 | null>;
  claim(input: {
    sessionId: string;
    workerId: string;
    token: string;
    now: number;
    leaseMs: number;
  }): Promise<DeepRunClaimResult>;
  commit(input: {
    sessionId: string;
    expectedRevision: number;
    lease: DeepRunLease;
    next: DeepRunRecordV1;
  }): Promise<DeepRunCommitResult>;
  cancel(input: {
    sessionId: string;
    now: number;
    committedAt: string;
    reasonCode?: string;
  }): Promise<DeepRunRecordV1 | null>;
  release(sessionId: string, lease: DeepRunLease): Promise<boolean>;
  findDue(now: number, limit: number): Promise<string[]>;
  /** Delete only a terminal live-session record; active work fails closed. */
  deleteTerminal(sessionId: string): Promise<DeepRunDeleteResult>;
}

export class DeepRunRepositoryUnavailableError extends Error {
  constructor(message = "Durable Deep Research storage is unavailable.") {
    super(message);
    this.name = "DeepRunRepositoryUnavailableError";
  }
}
