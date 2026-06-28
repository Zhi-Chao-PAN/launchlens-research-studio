import { createHash } from "node:crypto";

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

const RETENTION_DAYS = 90;
const RETENTION_SECONDS = RETENTION_DAYS * 24 * 60 * 60;
const EVENT_KEY = (eventName: ResearchFunnelEvent) =>
  `rs:analytics:funnel:${eventName}`;

function journeyHash(sessionId: string) {
  return createHash("sha256").update(sessionId, "utf8").digest("hex");
}

function rate(numerator: number, denominator: number) {
  return denominator > 0
    ? Number((numerator / denominator).toFixed(4))
    : null;
}

export async function recordResearchFunnelEvent(
  eventName: ResearchFunnelEvent,
  sessionId: string,
  occurredAt = new Date(),
): Promise<boolean> {
  const redis = getRedis();
  if (!redis || !sessionId) return false;

  const score = occurredAt.getTime();
  const key = EVENT_KEY(eventName);
  const cutoff = score - RETENTION_DAYS * 24 * 60 * 60 * 1000;

  try {
    await redis.zadd(key, { score, member: journeyHash(sessionId) });
    await Promise.all([
      redis.zremrangebyscore(key, 0, cutoff),
      redis.expire(key, RETENTION_SECONDS),
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
