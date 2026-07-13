import type { AgentId, ResearchSession } from "@/lib/schema/research-schema";

export type DeepRunLifecycle = "active" | "completed" | "cancelled" | "error";

export type DeepWorkKind =
  | "specialist"
  | "semantic_pass_1"
  | "semantic_pass_2"
  | "semantic_pass_3"
  | "synthesis"
  | "finalize";

export type DeepWorkStatus =
  | "ready"
  | "running"
  | "retry_wait"
  | "done"
  | "failed"
  | "cancelled";

export interface DeepWorkUnit {
  id: string;
  kind: DeepWorkKind;
  agentId?: AgentId;
  status: DeepWorkStatus;
  attempts: number;
  maxAttempts: number;
  startedAt?: number;
  finishedAt?: number;
  nextAttemptAt?: number;
  lastError?: {
    code: string;
    message: string;
    retryable: boolean;
  };
}

export interface DeepRunTerminal {
  status: "completed" | "cancelled" | "error";
  committedAt: string;
  reasonCode?: string;
}

/**
 * Redis-authoritative Deep Research record. The public ResearchSession is a
 * projection embedded here and atomically mirrored to `rs:session:<id>`.
 */
export interface DeepRunRecordV1 {
  version: 1;
  sessionId: string;
  revision: number;
  lifecycle: DeepRunLifecycle;
  currentWorkIndex: number;
  work: DeepWorkUnit[];
  session: ResearchSession;
  createdAt: number;
  updatedAt: number;
  nextWakeAt: number;
  totalAttempts: number;
  executionProfile: {
    generationProviderId: string;
    retrievalProviderId: string;
    reviewerProviderId: string;
  };
  terminal?: DeepRunTerminal;
}

export interface DeepRunLease {
  token: string;
  workerId: string;
  fencingEpoch: number;
  expiresAt: number;
}

/** Public observer projection; contains progress but no lease or worker token. */
export interface DeepRunProgress {
  revision: number;
  lifecycle: DeepRunLifecycle;
  currentWorkIndex: number;
  totalWork: number;
  currentWork: DeepWorkUnit | null;
  nextWakeAt: number;
  totalAttempts: number;
}

export const DEEP_SPECIALIST_ORDER: readonly AgentId[] = [
  "pricing-scout",
  "channel-scout",
  "pain-detective",
  "competitor-analyst",
  "market-sizer",
] as const;

export function createDeepWorkPlan(): DeepWorkUnit[] {
  return [
    ...DEEP_SPECIALIST_ORDER.map((agentId) => ({
      id: `specialist:${agentId}`,
      kind: "specialist" as const,
      agentId,
      status: "ready" as const,
      attempts: 0,
      maxAttempts: 3,
    })),
    {
      id: "review:claim-source-entailment",
      kind: "semantic_pass_1",
      status: "ready",
      attempts: 0,
      maxAttempts: 3,
    },
    {
      id: "review:corroboration-conflict",
      kind: "semantic_pass_2",
      status: "ready",
      attempts: 0,
      maxAttempts: 3,
    },
    {
      id: "review:adjudication",
      kind: "semantic_pass_3",
      status: "ready",
      attempts: 0,
      maxAttempts: 3,
    },
    {
      id: "synthesis",
      kind: "synthesis",
      agentId: "synthesis",
      status: "ready",
      attempts: 0,
      maxAttempts: 3,
    },
    {
      id: "finalize",
      kind: "finalize",
      status: "ready",
      attempts: 0,
      maxAttempts: 5,
    },
  ];
}

export function currentDeepWork(record: DeepRunRecordV1): DeepWorkUnit | undefined {
  return record.work[record.currentWorkIndex];
}

export function isDeepRunTerminal(record: DeepRunRecordV1): boolean {
  return record.lifecycle !== "active";
}

export function cloneDeepRunRecord(record: DeepRunRecordV1): DeepRunRecordV1 {
  return structuredClone(record);
}

export function deepRunProgressFromRecord(record: DeepRunRecordV1): DeepRunProgress {
  return {
    revision: record.revision,
    lifecycle: record.lifecycle,
    currentWorkIndex: record.currentWorkIndex,
    totalWork: record.work.length,
    currentWork: record.work[record.currentWorkIndex]
      ? structuredClone(record.work[record.currentWorkIndex])
      : null,
    nextWakeAt: record.nextWakeAt,
    totalAttempts: record.totalAttempts,
  };
}
