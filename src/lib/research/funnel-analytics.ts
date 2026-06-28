import { createHash } from "node:crypto";

import type { Stage2TrackingContext } from "@/lib/analytics/stage2-context";
import {
  hashStage2TrackingContext,
  type Stage2TrackingHashes,
} from "@/lib/analytics/stage2-server";
import { getRedis } from "./redis-client";

export const RESEARCH_FUNNEL_EVENTS = [
  "research_started",
  "research_completed",
  "brief_exported",
] as const;

export type ResearchFunnelEvent = (typeof RESEARCH_FUNNEL_EVENTS)[number];

export type ResearchFunnelSummary = {
  configured: boolean;
  windowDays: number;
  started: number;
  completed: number;
  handoff: number;
  completionRate: number | null;
  handoffRate: number | null;
};

export type ResearchFunnelEventOptions = {
  occurredAt?: Date;
  stage2?: Stage2TrackingContext | null;
};

export type ResearchStage2FunnelSummary = ResearchFunnelSummary & {
  stage2ParticipantTracked: boolean;
  stage2BatchTracked: boolean;
};

const RETENTION_DAYS = 90;
const RETENTION_SECONDS = RETENTION_DAYS * 24 * 60 * 60;
const EVENT_KEY = (eventName: ResearchFunnelEvent) =>
  `rs:analytics:funnel:${eventName}`;
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
  Pick<ResearchFunnelEventOptions, "stage2"> {
  if (options instanceof Date) return { occurredAt: options };
  return {
    occurredAt: options?.occurredAt ?? new Date(),
    stage2: options?.stage2,
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

  const { occurredAt, stage2 } = normalizeEventOptions(options);
  const score = occurredAt.getTime();
  const key = EVENT_KEY(eventName);
  const hashes = hashStage2TrackingContext(stage2);
  const stage2EventKeys = stage2Keys(eventName, hashes);
  const stage2EventMembers = hashes ? stage2Members(sessionId, hashes) : null;
  const cutoff = score - RETENTION_DAYS * 24 * 60 * 60 * 1000;

  try {
    await redis.zadd(key, { score, member: journeyHash(sessionId) });
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
      started: 0,
      completed: 0,
      handoff: 0,
      completionRate: null,
      handoffRate: null,
    };
  }

  const cutoff = now.getTime() - windowDays * 24 * 60 * 60 * 1000;
  const [started, completed, handoff] = await Promise.all([
    redis.zcount(EVENT_KEY("research_started"), cutoff, "+inf"),
    redis.zcount(EVENT_KEY("research_completed"), cutoff, "+inf"),
    redis.zcount(EVENT_KEY("brief_exported"), cutoff, "+inf"),
  ]);

  return {
    configured: true,
    windowDays,
    started,
    completed,
    handoff,
    completionRate: rate(completed, started),
    handoffRate: rate(handoff, completed),
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
      started: 0,
      completed: 0,
      handoff: 0,
      completionRate: null,
      handoffRate: null,
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
      started: 0,
      completed: 0,
      handoff: 0,
      completionRate: null,
      handoffRate: null,
      stage2ParticipantTracked: Boolean(hashes.stage2ParticipantHash),
      stage2BatchTracked: Boolean(hashes.stage2BatchHash),
    };
  }

  return {
    configured: true,
    windowDays,
    started: counts.started,
    completed: counts.completed,
    handoff: counts.handoff,
    completionRate: rate(counts.completed, counts.started),
    handoffRate: rate(counts.handoff, counts.completed),
    stage2ParticipantTracked: Boolean(hashes.stage2ParticipantHash),
    stage2BatchTracked: Boolean(hashes.stage2BatchHash),
  };
}
