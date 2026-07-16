import { createHash } from "node:crypto";

import type { Stage2TrackingContext } from "@/lib/analytics/stage2-context";
import {
  hashStage2TrackingContext,
  type Stage2TrackingHashes,
} from "@/lib/analytics/stage2-server";
import { getRedis } from "./redis-client";

export const RESEARCH_FUNNEL_EVENTS = [
  "workspace_viewed",
  "deep_selected",
  "query_filled",
  "research_started",
  "research_completed",
  "share_created",
  "brief_exported",
] as const;

export type ResearchFunnelEvent = (typeof RESEARCH_FUNNEL_EVENTS)[number];
export type ResearchFunnelMode = "standard" | "deep";

export type ResearchFunnelModeSummary = {
  selected: number;
  queryFilled: number;
  started: number;
  completed: number;
  shared: number;
  completionRate: number | null;
  shareRate: number | null;
};

export type ResearchFunnelSummary = {
  configured: boolean;
  windowDays: number;
  started: number;
  completed: number;
  handoff: number;
  viewed: number;
  deepSelected: number;
  queryFilled: number;
  shared: number;
  completionRate: number | null;
  handoffRate: number | null;
  deepSelectionRate: number | null;
  queryFillRate: number | null;
  startRate: number | null;
  shareRate: number | null;
  modes: Record<ResearchFunnelMode, ResearchFunnelModeSummary>;
};

export type ResearchFunnelEventOptions = {
  occurredAt?: Date;
  stage2?: Stage2TrackingContext | null;
  mode?: ResearchFunnelMode;
};

export type ResearchStage2FunnelSummary = ResearchFunnelSummary & {
  stage2ParticipantTracked: boolean;
  stage2BatchTracked: boolean;
};

const RETENTION_DAYS = 90;
const RETENTION_SECONDS = RETENTION_DAYS * 24 * 60 * 60;
const EVENT_KEY = (eventName: ResearchFunnelEvent) =>
  `rs:analytics:funnel:${eventName}`;
const MODE_EVENT_KEY = (
  eventName: ResearchFunnelEvent,
  mode: ResearchFunnelMode,
) => `${EVENT_KEY(eventName)}:mode:${mode}`;
const STAGE2_BATCH_KEY = (
  eventName: ResearchFunnelEvent,
  stage2BatchHash: string,
) => `rs:analytics:stage2:funnel:${eventName}:batch:${stage2BatchHash}`;
const STAGE2_PARTICIPANT_KEY = (
  eventName: ResearchFunnelEvent,
  stage2ParticipantHash: string,
) =>
  `rs:analytics:stage2:funnel:${eventName}:participant:${stage2ParticipantHash}`;

function journeyHash(sessionId: string) {
  return createHash("sha256").update(sessionId, "utf8").digest("hex");
}

function rate(numerator: number, denominator: number) {
  return denominator > 0
    ? Number((numerator / denominator).toFixed(4))
    : null;
}

function normalizeEventOptions(
  options: Date | ResearchFunnelEventOptions | undefined,
): Required<Pick<ResearchFunnelEventOptions, "occurredAt">> &
  Pick<ResearchFunnelEventOptions, "stage2" | "mode"> {
  if (options instanceof Date) return { occurredAt: options, stage2: undefined, mode: undefined };
  return {
    occurredAt: options?.occurredAt ?? new Date(),
    stage2: options?.stage2,
    mode: options?.mode,
  };
}

function stage2Members(sessionId: string, hashes: Stage2TrackingHashes) {
  const journey = journeyHash(sessionId);
  return {
    journey,
    batchMember: hashes.stage2ParticipantHash
      ? `${hashes.stage2ParticipantHash}:${journey}`
      : journey,
  };
}

function stage2Keys(
  eventName: ResearchFunnelEvent,
  hashes: Stage2TrackingHashes | undefined,
) {
  if (!hashes) return [];
  return [
    ...(hashes.stage2BatchHash
      ? [STAGE2_BATCH_KEY(eventName, hashes.stage2BatchHash)]
      : []),
    ...(hashes.stage2ParticipantHash
      ? [STAGE2_PARTICIPANT_KEY(eventName, hashes.stage2ParticipantHash)]
      : []),
  ];
}

export async function recordResearchFunnelEvent(
  eventName: ResearchFunnelEvent,
  sessionId: string,
  options?: Date | ResearchFunnelEventOptions,
): Promise<boolean> {
  const redis = getRedis();
  if (!redis || !sessionId) return false;

  const { occurredAt, stage2, mode } = normalizeEventOptions(options);
  const score = occurredAt.getTime();
  const key = EVENT_KEY(eventName);
  const modeKey = mode ? MODE_EVENT_KEY(eventName, mode) : null;
  const hashes = hashStage2TrackingContext(stage2);
  const stage2EventKeys = stage2Keys(eventName, hashes);
  const stage2EventMembers = hashes ? stage2Members(sessionId, hashes) : null;
  const cutoff = score - RETENTION_DAYS * 24 * 60 * 60 * 1000;

  try {
    await redis.zadd(key, { score, member: journeyHash(sessionId) });
    if (modeKey) await redis.zadd(modeKey, { score, member: journeyHash(sessionId) });
    for (const stage2Key of stage2EventKeys) {
      await redis.zadd(stage2Key, {
        score,
        member: stage2Key.includes(":batch:")
          ? stage2EventMembers?.batchMember ?? journeyHash(sessionId)
          : stage2EventMembers?.journey ?? journeyHash(sessionId),
      });
    }
    await Promise.all([
      redis.zremrangebyscore(key, 0, cutoff),
      redis.expire(key, RETENTION_SECONDS),
      ...(modeKey
        ? [redis.zremrangebyscore(modeKey, 0, cutoff), redis.expire(modeKey, RETENTION_SECONDS)]
        : []),
      ...stage2EventKeys.flatMap((stage2Key) => [
        redis.zremrangebyscore(stage2Key, 0, cutoff),
        redis.expire(stage2Key, RETENTION_SECONDS),
      ]),
    ]);
    return true;
  } catch (error) {
    console.error(
      `[funnel-analytics] failed to record ${eventName}:`,
      error instanceof Error ? error.message : "unknown Redis error",
    );
    return false;
  }
}

async function countFunnelKeys(
  keyForEvent: (eventName: ResearchFunnelEvent) => string,
  cutoff: number,
) {
  const redis = getRedis();
  if (!redis) return null;
  const [started, completed, handoff] = await Promise.all([
    redis.zcount(keyForEvent("research_started"), cutoff, "+inf"),
    redis.zcount(keyForEvent("research_completed"), cutoff, "+inf"),
    redis.zcount(keyForEvent("brief_exported"), cutoff, "+inf"),
  ]);
  return { started, completed, handoff };
}

async function countFunnelEvents(cutoff: number) {
  const redis = getRedis();
  if (!redis) return null;
  const entries = await Promise.all(
    RESEARCH_FUNNEL_EVENTS.map(async (eventName) => [
      eventName,
      await redis.zcount(EVENT_KEY(eventName), cutoff, "+inf"),
    ] as const),
  );
  return Object.fromEntries(entries) as Record<ResearchFunnelEvent, number>;
}

async function summarizeMode(
  mode: ResearchFunnelMode,
  cutoff: number,
): Promise<ResearchFunnelModeSummary> {
  const redis = getRedis();
  if (!redis) {
    return {
      selected: 0,
      queryFilled: 0,
      started: 0,
      completed: 0,
      shared: 0,
      completionRate: null,
      shareRate: null,
    };
  }
  const [selected, queryFilled, started, completed, shared] = await Promise.all([
    redis.zcount(MODE_EVENT_KEY("deep_selected", mode), cutoff, "+inf"),
    redis.zcount(MODE_EVENT_KEY("query_filled", mode), cutoff, "+inf"),
    redis.zcount(MODE_EVENT_KEY("research_started", mode), cutoff, "+inf"),
    redis.zcount(MODE_EVENT_KEY("research_completed", mode), cutoff, "+inf"),
    redis.zcount(MODE_EVENT_KEY("share_created", mode), cutoff, "+inf"),
  ]);
  return {
    selected,
    queryFilled,
    started,
    completed,
    shared,
    completionRate: rate(completed, started),
    shareRate: rate(shared, completed),
  };
}

function emptyModeSummary(): ResearchFunnelModeSummary {
  return {
    selected: 0,
    queryFilled: 0,
    started: 0,
    completed: 0,
    shared: 0,
    completionRate: null,
    shareRate: null,
  };
}

export async function summarizeResearchFunnel(
  requestedWindowDays = 30,
  now = new Date(),
): Promise<ResearchFunnelSummary> {
  const windowDays = Math.min(
    RETENTION_DAYS,
    Math.max(1, Math.trunc(requestedWindowDays) || 30),
  );
  const redis = getRedis();
  if (!redis) {
    return {
      configured: false,
      windowDays,
      viewed: 0,
      deepSelected: 0,
      queryFilled: 0,
      started: 0,
      completed: 0,
      handoff: 0,
      shared: 0,
      completionRate: null,
      handoffRate: null,
      deepSelectionRate: null,
      queryFillRate: null,
      startRate: null,
      shareRate: null,
      modes: { standard: emptyModeSummary(), deep: emptyModeSummary() },
    };
  }

  const cutoff = now.getTime() - windowDays * 24 * 60 * 60 * 1000;
  const [counts, standard, deep] = await Promise.all([
    countFunnelEvents(cutoff),
    summarizeMode("standard", cutoff),
    summarizeMode("deep", cutoff),
  ]);
  if (!counts) return summarizeResearchFunnel(windowDays, now);
  const started = counts.research_started;
  const completed = counts.research_completed;
  const handoff = counts.brief_exported;
  const viewed = counts.workspace_viewed;
  const deepSelected = counts.deep_selected;
  const queryFilled = counts.query_filled;
  const shared = counts.share_created;

  return {
    configured: true,
    windowDays,
    viewed,
    deepSelected,
    queryFilled,
    started,
    completed,
    handoff,
    shared,
    completionRate: rate(completed, started),
    handoffRate: rate(handoff, completed),
    deepSelectionRate: rate(deepSelected, viewed),
    queryFillRate: rate(queryFilled, viewed),
    startRate: rate(started, queryFilled),
    shareRate: rate(shared, completed),
    modes: { standard, deep },
  };
}

export async function summarizeResearchStage2Funnel(
  context: Stage2TrackingContext,
  requestedWindowDays = 30,
  now = new Date(),
): Promise<ResearchStage2FunnelSummary> {
  const windowDays = Math.min(
    RETENTION_DAYS,
    Math.max(1, Math.trunc(requestedWindowDays) || 30),
  );
  const redis = getRedis();
  const hashes = hashStage2TrackingContext(context);
  if (!redis || !hashes) {
    return {
      configured: false,
      windowDays,
      viewed: 0,
      deepSelected: 0,
      queryFilled: 0,
      started: 0,
      completed: 0,
      handoff: 0,
      shared: 0,
      completionRate: null,
      handoffRate: null,
      deepSelectionRate: null,
      queryFillRate: null,
      startRate: null,
      shareRate: null,
      modes: { standard: emptyModeSummary(), deep: emptyModeSummary() },
      stage2ParticipantTracked: false,
      stage2BatchTracked: false,
    };
  }

  const cutoff = now.getTime() - windowDays * 24 * 60 * 60 * 1000;
  const keyForEvent = hashes.stage2ParticipantHash
    ? (eventName: ResearchFunnelEvent) =>
        STAGE2_PARTICIPANT_KEY(eventName, hashes.stage2ParticipantHash!)
    : (eventName: ResearchFunnelEvent) =>
        STAGE2_BATCH_KEY(eventName, hashes.stage2BatchHash!);
  const counts = await countFunnelKeys(keyForEvent, cutoff);
  if (!counts) {
    return {
      configured: false,
      windowDays,
      viewed: 0,
      deepSelected: 0,
      queryFilled: 0,
      started: 0,
      completed: 0,
      handoff: 0,
      shared: 0,
      completionRate: null,
      handoffRate: null,
      deepSelectionRate: null,
      queryFillRate: null,
      startRate: null,
      shareRate: null,
      modes: { standard: emptyModeSummary(), deep: emptyModeSummary() },
      stage2ParticipantTracked: Boolean(hashes.stage2ParticipantHash),
      stage2BatchTracked: Boolean(hashes.stage2BatchHash),
    };
  }

  return {
    configured: true,
    windowDays,
    viewed: 0,
    deepSelected: 0,
    queryFilled: 0,
    started: counts.started,
    completed: counts.completed,
    handoff: counts.handoff,
    shared: 0,
    completionRate: rate(counts.completed, counts.started),
    handoffRate: rate(counts.handoff, counts.completed),
    deepSelectionRate: null,
    queryFillRate: null,
    startRate: null,
    shareRate: null,
    modes: { standard: emptyModeSummary(), deep: emptyModeSummary() },
    stage2ParticipantTracked: Boolean(hashes.stage2ParticipantHash),
    stage2BatchTracked: Boolean(hashes.stage2BatchHash),
  };
}
