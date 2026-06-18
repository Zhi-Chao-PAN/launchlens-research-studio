/**
 * Research scheduler - timed/recurring research runs.
 *
 * Features:
 * - Create recurring research schedules with configurable intervals
 * - Cron-like next-run calculation (hourly / daily / weekly / custom minutes)
 * - Persisted schedule state (survives restarts when storage dir is set)
 * - Integrates with batch-manager for actual execution
 * - Tracks last run, next run, total runs, success count
 *
 * Schedule lifecycle:
 *   active -> paused (toggle) -> deleted
 *
 * Interval types:
 *   hourly     - every hour on the hour
 *   daily      - every day at a specific hour (default 09:00)
 *   weekly     - every week on a specific day and hour (default Mon 09:00)
 *   interval   - every N minutes (custom)
 */

import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { createBatch } from "@/lib/research/batch-manager";

export type ScheduleInterval = "hourly" | "daily" | "weekly" | "interval";

export type ScheduleStatus = "active" | "paused";

export interface ResearchSchedule {
  id: string;
  name: string;
  query: string;
  keywords: string[];
  agent?: string;
  status: ScheduleStatus;
  interval: ScheduleInterval;
  intervalMinutes?: number;
  hourOfDay?: number;
  dayOfWeek?: number;
  createdAt: number;
  updatedAt: number;
  lastRunAt?: number;
  lastRunId?: string;
  nextRunAt: number;
  totalRuns: number;
  successRuns: number;
  failedRuns: number;
}

export interface CreateScheduleOptions {
  name: string;
  query: string;
  keywords?: string[];
  agent?: string;
  interval: ScheduleInterval;
  intervalMinutes?: number;
  hourOfDay?: number;
  dayOfWeek?: number;
}

const STORAGE_DIR = process.env.LAUNCHLENS_STORAGE_DIR || "";
const MAX_SCHEDULES = 20;
const POLL_INTERVAL_MS = 30_000;

declare global {
  var __scheduleStore: Map<string, ResearchSchedule> | undefined;
  var __schedulePoller: NodeJS.Timeout | undefined;
  var __schedulePollerRunning: boolean;
}

/* ------------------------------------------------------------------ */
/*  Storage helpers                                                    */
/* ------------------------------------------------------------------ */

function getSchedulesDir(): string | null {
  if (!STORAGE_DIR) return null;
  const dir = path.join(STORAGE_DIR, "research", "schedules");
  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
  } catch {
    return null;
  }
}

function loadSchedulesFromDisk(): Map<string, ResearchSchedule> {
  const map = new Map<string, ResearchSchedule>();
  const dir = getSchedulesDir();
  if (!dir) return map;
  try {
    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
    for (const file of files) {
      try {
        const raw = fs.readFileSync(path.join(dir, file), "utf8");
        const s = JSON.parse(raw) as ResearchSchedule;
        map.set(s.id, s);
      } catch {
        // skip corrupt files
      }
    }
  } catch {
    // best effort
  }
  return map;
}

function persistSchedule(s: ResearchSchedule): void {
  const dir = getSchedulesDir();
  if (!dir) return;
  try {
    const filePath = path.join(dir, `${s.id}.json`);
    fs.writeFileSync(filePath, JSON.stringify(s, null, 2), "utf8");
  } catch {
    // best-effort persistence
  }
}

function deleteScheduleFromDisk(id: string): void {
  const dir = getSchedulesDir();
  if (!dir) return;
  try {
    fs.unlinkSync(path.join(dir, `${id}.json`));
  } catch {
    // best-effort
  }
}

/* ------------------------------------------------------------------ */
/*  Store init                                                         */
/* ------------------------------------------------------------------ */

function getStore(): Map<string, ResearchSchedule> {
  if (!global.__scheduleStore) {
    global.__scheduleStore = loadSchedulesFromDisk();
  }
  return global.__scheduleStore;
}

/** Reset all state (for testing only). */
export function _resetScheduler(): void {
  if (global.__schedulePoller) {
    clearInterval(global.__schedulePoller);
  }
  global.__scheduleStore = undefined;
  global.__scheduleHistory = undefined;
  global.__schedulePoller = undefined;
  global.__schedulePollerRunning = false;
}

/* ------------------------------------------------------------------ */
/*  Next-run calculation                                               */
/* ------------------------------------------------------------------ */

/**
 * Calculate the next scheduled run time based on the interval configuration.
 * @param schedule The schedule configuration
 * @param fromTime Base time to calculate from (default: now)
 * @returns Timestamp of the next run
 */
export function calculateNextRun(
  schedule: Pick<ResearchSchedule, "interval" | "intervalMinutes" | "hourOfDay" | "dayOfWeek">,
  fromTime: number = Date.now()
): number {
  const now = new Date(fromTime);

  switch (schedule.interval) {
    case "hourly": {
      const next = new Date(now);
      next.setMinutes(0, 0, 0);
      next.setHours(next.getHours() + 1);
      return next.getTime();
    }

    case "daily": {
      const hour = schedule.hourOfDay ?? 9;
      const next = new Date(now);
      next.setHours(hour, 0, 0, 0);
      if (next.getTime() <= now.getTime()) {
        next.setDate(next.getDate() + 1);
      }
      return next.getTime();
    }

    case "weekly": {
      const hour = schedule.hourOfDay ?? 9;
      const day = schedule.dayOfWeek ?? 1; // Monday
      const next = new Date(now);
      next.setHours(hour, 0, 0, 0);
      const currentDay = next.getDay();
      let daysToAdd = day - currentDay;
      if (daysToAdd < 0 || (daysToAdd === 0 && next.getTime() <= now.getTime())) {
        daysToAdd += 7;
      }
      next.setDate(next.getDate() + daysToAdd);
      return next.getTime();
    }

    case "interval": {
      const minutes = schedule.intervalMinutes ?? 60;
      const safeMinutes = Math.max(1, Math.min(minutes, 10080)); // clamp 1min - 7days
      return now.getTime() + safeMinutes * 60 * 1000;
    }

    default:
      return now.getTime() + 60 * 60 * 1000; // default: 1 hour
  }
}

/**
 * Format interval description for display (Chinese labels).
 */
export function formatScheduleInterval(s: ResearchSchedule): string {
  switch (s.interval) {
    case "hourly":
      return "每小时";
    case "daily":
      return `每天 ${String(s.hourOfDay ?? 9).padStart(2, "0")}:00`;
    case "weekly": {
      const days = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
      return `${days[s.dayOfWeek ?? 1]} ${String(s.hourOfDay ?? 9).padStart(2, "0")}:00`;
    }
    case "interval":
      return `每 ${s.intervalMinutes ?? 60} 分钟`;
    default:
      return "未知";
  }
}

/* ------------------------------------------------------------------ */
/*  CRUD operations                                                    */
/* ------------------------------------------------------------------ */

/**
 * Create a new research schedule.
 */
export function createSchedule(options: CreateScheduleOptions): ResearchSchedule {
  const store = getStore();

  if (store.size >= MAX_SCHEDULES) {
    throw new Error(`已达到最大定时研究数量限制 (${MAX_SCHEDULES})`);
  }

  const now = Date.now();
  const schedule: ResearchSchedule = {
    id: randomUUID(),
    name: options.name.trim() || "未命名定时研究",
    query: options.query.trim(),
    keywords: options.keywords ?? [],
    agent: options.agent,
    status: "active",
    interval: options.interval,
    intervalMinutes: options.intervalMinutes,
    hourOfDay: options.hourOfDay,
    dayOfWeek: options.dayOfWeek,
    createdAt: now,
    updatedAt: now,
    nextRunAt: calculateNextRun(options),
    totalRuns: 0,
    successRuns: 0,
    failedRuns: 0,
  };

  if (!schedule.query) {
    throw new Error("研究问题不能为空");
  }

  store.set(schedule.id, schedule);
  persistSchedule(schedule);
  ensurePollerRunning();

  return schedule;
}

/**
 * Get a schedule by ID.
 */
export function getSchedule(id: string): ResearchSchedule | undefined {
  return getStore().get(id);
}

/**
 * List all schedules, most recently created first.
 */
export function listSchedules(): ResearchSchedule[] {
  return Array.from(getStore().values()).sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * Update a schedule.
 */
export function updateSchedule(
  id: string,
  updates: Partial<Pick<ResearchSchedule, "name" | "query" | "keywords" | "agent" | "interval" | "intervalMinutes" | "hourOfDay" | "dayOfWeek" | "status">>
): ResearchSchedule | undefined {
  const store = getStore();
  const s = store.get(id);
  if (!s) return undefined;

  const now = Date.now();
  const updated = { ...s, ...updates, updatedAt: now } as ResearchSchedule;

  const intervalChanged =
    updates.interval !== undefined ||
    updates.intervalMinutes !== undefined ||
    updates.hourOfDay !== undefined ||
    updates.dayOfWeek !== undefined ||
    updates.status === "active";

  if (intervalChanged && updated.status === "active") {
    updated.nextRunAt = calculateNextRun(updated);
  }

  store.set(id, updated);
  persistSchedule(updated);
  return updated;
}

/**
 * Toggle a schedule's status (active <-> paused).
 */
export function toggleSchedule(id: string): ResearchSchedule | undefined {
  const s = getSchedule(id);
  if (!s) return undefined;
  return updateSchedule(id, { status: s.status === "active" ? "paused" : "active" });
}

/**
 * Delete a schedule.
 */
export function deleteSchedule(id: string): boolean {
  const store = getStore();
  if (!store.has(id)) return false;
  store.delete(id);
  deleteScheduleFromDisk(id);
  return true;
}

/**
 * Manually trigger a schedule run immediately.
 */
export async function triggerScheduleNow(id: string): Promise<{ batchId: string } | null> {
  const s = getSchedule(id);
  if (!s) return null;

  const batch = await createBatch(
    [s.query],
    s.keywords,
    { agent: s.agent, priority: "high" }
  );

  const updated = { ...s, updatedAt: Date.now(), lastRunAt: Date.now(), lastRunId: batch.id };
  getStore().set(id, updated);
  persistSchedule(updated);

  return { batchId: batch.id };
}

/* ------------------------------------------------------------------ */
/*  Poller / execution engine                                          */
/* ------------------------------------------------------------------ */

/**
 * Check all active schedules and trigger any that are due.
 * Called by the poller every POLL_INTERVAL_MS.
 */
export async function tickSchedules(): Promise<number> {
  const store = getStore();
  const now = Date.now();
  let triggered = 0;

  for (const schedule of store.values()) {
    if (schedule.status !== "active") continue;
    if (schedule.nextRunAt > now) continue;

    try {
      const batch = await createBatch(
        [schedule.query],
        schedule.keywords,
        { agent: schedule.agent, priority: "normal" }
      );

      const updated: ResearchSchedule = {
        ...schedule,
        lastRunAt: now,
        lastRunId: batch.id,
        totalRuns: schedule.totalRuns + 1,
        nextRunAt: calculateNextRun(schedule, now),
        updatedAt: now,
      };

      store.set(schedule.id, updated);
      persistSchedule(updated);
      triggered++;
    } catch {
      const updated: ResearchSchedule = {
        ...schedule,
        nextRunAt: calculateNextRun(schedule, now),
        updatedAt: now,
      };
      store.set(schedule.id, updated);
      persistSchedule(updated);
    }
  }

  return triggered;
}

/**
 * Start the background poller if it's not already running.
 * Safe to call multiple times.
 */
export function ensurePollerRunning(): void {
  if (global.__schedulePollerRunning) return;
  if (global.__schedulePoller) {
    clearInterval(global.__schedulePoller);
  }

  global.__schedulePollerRunning = true;
  global.__schedulePoller = setInterval(() => {
    void tickSchedules();
  }, POLL_INTERVAL_MS);

  if (global.__schedulePoller.unref) {
    global.__schedulePoller.unref();
  }
}

/**
 * Get scheduler statistics.
 */
export function getSchedulerStats(): {
  total: number;
  active: number;
  paused: number;
  nextRunAt?: number;
  totalRuns: number;
} {
  const schedules = listSchedules();
  const active = schedules.filter((s) => s.status === "active");
  const nextRun = active.reduce<number | undefined>((earliest, s) => {
    if (earliest === undefined) return s.nextRunAt;
    return Math.min(earliest, s.nextRunAt);
  }, undefined);
  const totalRuns = schedules.reduce((sum, s) => sum + s.totalRuns, 0);

  return {
    total: schedules.length,
    active: active.length,
    paused: schedules.length - active.length,
    nextRunAt: nextRun,
    totalRuns,
  };
}


/* ------------------------------------------------------------------ */
/*  Schedule history & failure tracking                                */
/* ------------------------------------------------------------------ */

export interface ScheduleRunRecord {
  id: string;
  scheduleId: string;
  batchId?: string;
  status: "success" | "failed" | "skipped" | "missed";
  startedAt: number;
  completedAt?: number;
  errorMessage?: string;
  retryCount?: number;
}

const MAX_HISTORY_PER_SCHEDULE = 20;
const MAX_MISSED_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes = "missed"

declare global {
  var __scheduleHistory: Map<string, ScheduleRunRecord[]> | undefined;
}

function getHistoryStore(): Map<string, ScheduleRunRecord[]> {
  if (!global.__scheduleHistory) {
    global.__scheduleHistory = new Map();
  }
  return global.__scheduleHistory;
}

export function getScheduleHistory(scheduleId: string): ScheduleRunRecord[] {
  const store = getHistoryStore();
  return store.get(scheduleId) ?? [];
}

function saveScheduleHistory(scheduleId: string, history: ScheduleRunRecord[]): void {
  const store = getHistoryStore();
  const trimmed = history.slice(0, MAX_HISTORY_PER_SCHEDULE);
  store.set(scheduleId, trimmed);
}

function addHistoryRecord(
  scheduleId: string,
  record: Omit<ScheduleRunRecord, "id" | "startedAt"> & { startedAt?: number }
): ScheduleRunRecord {
  const history = getScheduleHistory(scheduleId);
  const newRecord: ScheduleRunRecord = {
    id: "sh_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8),
    scheduleId,
    batchId: record.batchId,
    status: record.status,
    startedAt: record.startedAt ?? Date.now(),
    completedAt: record.completedAt,
    errorMessage: record.errorMessage,
    retryCount: record.retryCount ?? 0,
  };
  history.unshift(newRecord);
  saveScheduleHistory(scheduleId, history);
  return newRecord;
}

export function clearScheduleHistory(scheduleId: string): void {
  const store = getHistoryStore();
  store.delete(scheduleId);
}

/* ------------------------------------------------------------------ */
/*  Retry state tracking                                               */
/* ------------------------------------------------------------------ */

export function isScheduleInRetry(scheduleId: string): boolean {
  const s = getSchedule(scheduleId);
  if (!s) return false;
  // @ts-expect-error - extended field
  return s._retryScheduledAt !== undefined && s._retryScheduledAt > Date.now();
}

export function getRetryCount(scheduleId: string): number {
  const s = getSchedule(scheduleId);
  if (!s) return 0;
  // @ts-expect-error - extended field
  return s._currentRetry ?? 0;
}

export function resetRetryState(scheduleId: string): void {
  const store = getStore();
  const s = store.get(scheduleId);
  if (!s) return;
  // @ts-expect-error - extended retry field
    s._currentRetry = 0;
  // @ts-expect-error - extended retry field
    s._retryScheduledAt = undefined;
  store.set(scheduleId, s);
}

/* ------------------------------------------------------------------ */
/*  Missed schedule detection                                          */
/* ------------------------------------------------------------------ */

export function isScheduleMissed(scheduleId: string): boolean {
  const s = getSchedule(scheduleId);
  if (!s) return false;
  if (s.status !== "active") return false;
  return Date.now() - s.nextRunAt > MAX_MISSED_THRESHOLD_MS;
}

export function getMissedSchedules(): ResearchSchedule[] {
  return listSchedules().filter((s) => isScheduleMissed(s.id));
}

export async function catchUpMissedSchedules(): Promise<number> {
  const missed = getMissedSchedules();
  let caughtUp = 0;

  for (const schedule of missed) {
    try {
      const result = await triggerScheduleNow(schedule.id);
      if (result) {
        addHistoryRecord(schedule.id, {
          batchId: result.batchId,
          status: "success",
          completedAt: Date.now(),
        });
        caughtUp++;
      }
    } catch {
      // skip failed catch-ups
    }
  }

  return caughtUp;
}

/* ------------------------------------------------------------------ */
/*  Bulk operations                                                    */
/* ------------------------------------------------------------------ */

export function pauseAllSchedules(): number {
  const schedules = listSchedules();
  let count = 0;
  for (const s of schedules) {
    if (s.status === "active") {
      updateSchedule(s.id, { status: "paused" });
      count++;
    }
  }
  return count;
}

export function resumeAllSchedules(): number {
  const schedules = listSchedules();
  let count = 0;
  for (const s of schedules) {
    if (s.status === "paused") {
      updateSchedule(s.id, { status: "active" });
      count++;
    }
  }
  return count;
}

export function bulkPauseSchedules(scheduleIds: string[]): number {
  let count = 0;
  for (const id of scheduleIds) {
    const s = getSchedule(id);
    if (s && s.status === "active") {
      updateSchedule(id, { status: "paused" });
      count++;
    }
  }
  return count;
}

export function bulkResumeSchedules(scheduleIds: string[]): number {
  let count = 0;
  for (const id of scheduleIds) {
    const s = getSchedule(id);
    if (s && s.status === "paused") {
      updateSchedule(id, { status: "active" });
      count++;
    }
  }
  return count;
}

export function bulkDeleteSchedules(scheduleIds: string[]): number {
  let count = 0;
  for (const id of scheduleIds) {
    if (deleteSchedule(id)) {
      count++;
    }
  }
  return count;
}

/* ------------------------------------------------------------------ */
/*  Extended statistics                                                */
/* ------------------------------------------------------------------ */

export interface SchedulerStatsExtended {
  total: number;
  active: number;
  paused: number;
  nextRunAt?: number;
  totalRuns: number;
  successRuns: number;
  failedRuns: number;
  successRate: number;
  missedCount: number;
  schedulesWithHistory: number;
  avgRunsPerSchedule: number;
  mostActiveSchedule?: { id: string; name: string; totalRuns: number };
  leastActiveSchedule?: { id: string; name: string; totalRuns: number };
}

export function getSchedulerStatsExtended(): SchedulerStatsExtended {
  const schedules = listSchedules();
  const active = schedules.filter((s) => s.status === "active");

  const totalRuns = schedules.reduce((sum, s) => sum + s.totalRuns, 0);
  const successRuns = schedules.reduce((sum, s) => sum + s.successRuns, 0);
  const failedRuns = schedules.reduce((sum, s) => sum + s.failedRuns, 0);

  const successRate = totalRuns > 0 ? Math.round((successRuns / totalRuns) * 10000) / 100 : 0;

  const missedCount = schedules.filter((s) => isScheduleMissed(s.id)).length;

  const schedulesWithHistory = schedules.filter(
    (s) => getScheduleHistory(s.id).length > 0
  ).length;

  const avgRunsPerSchedule = schedules.length > 0
    ? Math.round((totalRuns / schedules.length) * 100) / 100
    : 0;

  const sortedByRuns = [...schedules].sort((a, b) => b.totalRuns - a.totalRuns);
  const activeWithRuns = sortedByRuns.filter((s) => s.totalRuns > 0);

  const nextRun = active.reduce<number | undefined>((earliest, s) => {
    if (earliest === undefined) return s.nextRunAt;
    return Math.min(earliest, s.nextRunAt);
  }, undefined);

  return {
    total: schedules.length,
    active: active.length,
    paused: schedules.length - active.length,
    nextRunAt: nextRun,
    totalRuns,
    successRuns,
    failedRuns,
    successRate,
    missedCount,
    schedulesWithHistory,
    avgRunsPerSchedule,
    mostActiveSchedule: activeWithRuns.length > 0
      ? {
          id: activeWithRuns[0].id,
          name: activeWithRuns[0].name,
          totalRuns: activeWithRuns[0].totalRuns,
        }
      : undefined,
    leastActiveSchedule: activeWithRuns.length > 0
      ? {
          id: activeWithRuns[activeWithRuns.length - 1].id,
          name: activeWithRuns[activeWithRuns.length - 1].name,
          totalRuns: activeWithRuns[activeWithRuns.length - 1].totalRuns,
        }
      : undefined,
  };
}

/* ------------------------------------------------------------------ */
/*  Result recording                                                   */
/* ------------------------------------------------------------------ */

export function recordScheduleResult(
  scheduleId: string,
  batchId: string,
  status: "success" | "failed",
  errorMessage?: string
): void {
  const store = getStore();
  const s = store.get(scheduleId);
  if (!s) return;

  const updated: ResearchSchedule = {
    ...s,
    totalRuns: s.totalRuns + 1,
    successRuns: s.successRuns + (status === "success" ? 1 : 0),
    failedRuns: s.failedRuns + (status === "failed" ? 1 : 0),
    updatedAt: Date.now(),
    lastRunAt: Date.now(),
    lastRunId: batchId,
  };

  store.set(scheduleId, updated);
  persistSchedule(updated);

  addHistoryRecord(scheduleId, {
    batchId,
    status,
    completedAt: Date.now(),
    errorMessage,
  });

  if (status === "success") {
    resetRetryState(scheduleId);
  }
}

/* ------------------------------------------------------------------ */
/*  Pure schedule helpers (round 156) — stateless, side-effect free   */
/* ------------------------------------------------------------------ */

export interface ScheduleSummary {
  id: string;
  name: string;
  status: ScheduleStatus;
  intervalLabel: string;
  totalRuns: number;
  successRate: number;
  isDue: boolean;
  isMissed: boolean;
  msUntilNextRun: number;
  lastRunAgeMs: number;
  health: "healthy" | "due" | "missed" | "paused" | "never-run";
}

export function summarizeSchedule(
  schedule: ResearchSchedule,
  nowMs: number = Date.now(),
): ScheduleSummary {
  const successRate = schedule.totalRuns > 0
    ? Math.round((schedule.successRuns / schedule.totalRuns) * 10000) / 100
    : 0;
  const msUntilNext = schedule.nextRunAt - nowMs;
  const isDue = schedule.status === "active" && msUntilNext <= 0;
  const lastRunAge = schedule.lastRunAt ? nowMs - schedule.lastRunAt : -1;
  const isMissed = schedule.status === "active" && msUntilNext < -MAX_MISSED_THRESHOLD_MS;
  let health: ScheduleSummary["health"] = "healthy";
  if (schedule.status === "paused") health = "paused";
  else if (schedule.totalRuns === 0) health = "never-run";
  else if (isMissed) health = "missed";
  else if (isDue) health = "due";
  return {
    id: schedule.id,
    name: schedule.name,
    status: schedule.status,
    intervalLabel: formatScheduleInterval(schedule),
    totalRuns: schedule.totalRuns,
    successRate,
    isDue,
    isMissed,
    msUntilNextRun: msUntilNext,
    lastRunAgeMs: lastRunAge,
    health,
  };
}

/** Returns true if the schedule is active and its nextRunAt is in the past (due or overdue). */
export function isScheduleDue(schedule: ResearchSchedule, nowMs: number = Date.now()): boolean {
  return schedule.status === "active" && schedule.nextRunAt <= nowMs;
}

/** Validate create/update options and return a normalized copy or throw. Does not touch store. */
export function validateScheduleOptions(opts: CreateScheduleOptions): CreateScheduleOptions {
  if (!opts.query?.trim()) throw new Error("研究问题不能为空");
  const name = (opts.name || "").trim() || "未命名定时研究";
  const keywords = (opts.keywords || []).filter((k) => typeof k === "string" && k.trim().length > 0);
  const out: CreateScheduleOptions = { ...opts, name, keywords };
  if (out.interval === "interval") {
    out.intervalMinutes = Math.max(1, Math.min(out.intervalMinutes ?? 60, 10080));
  }
  if (out.interval === "daily" || out.interval === "weekly") {
    out.hourOfDay = Math.max(0, Math.min(out.hourOfDay ?? 9, 23));
  }
  if (out.interval === "weekly") {
    out.dayOfWeek = Math.max(0, Math.min(out.dayOfWeek ?? 1, 6));
  }
  return out;
}

/** Compute run-state breakdown for a batch of schedules, no I/O. */
export function summarizeSchedules(schedules: ResearchSchedule[], nowMs: number = Date.now()): {
  total: number; active: number; paused: number; due: number; missed: number; neverRun: number;
  nextRunAt?: number; successRate: number;
} {
  let active = 0, paused = 0, due = 0, missed = 0, neverRun = 0;
  let totalRuns = 0, successRuns = 0;
  let nextRun: number | undefined;
  for (const s of schedules) {
    if (s.status === "active") active++; else paused++;
    if (s.totalRuns === 0) neverRun++;
    totalRuns += s.totalRuns;
    successRuns += s.successRuns;
    if (s.status === "active" && s.nextRunAt <= nowMs) due++;
    if (s.status === "active" && nowMs - s.nextRunAt > MAX_MISSED_THRESHOLD_MS) missed++;
    if (s.status === "active") nextRun = nextRun === undefined ? s.nextRunAt : Math.min(nextRun, s.nextRunAt);
  }
  return {
    total: schedules.length, active, paused, due, missed, neverRun,
    nextRunAt: nextRun,
    successRate: totalRuns > 0 ? Math.round((successRuns / totalRuns) * 10000) / 100 : 0,
  };
}

/** Export schedules to CSV for analytics. */
export function schedulesToCsv(schedules: ResearchSchedule[]): string {
  const header = "id,name,status,interval,keywords,totalRuns,successRuns,failedRuns,successRate,nextRunAt,lastRunAt,createdAt";
  const rows = schedules.map((s) => {
    const sr = s.totalRuns > 0 ? Math.round((s.successRuns / s.totalRuns) * 10000) / 100 : 0;
    return [
      s.id, JSON.stringify(s.name), s.status, formatScheduleInterval(s),
      JSON.stringify(s.keywords.join("|")), s.totalRuns, s.successRuns, s.failedRuns,
      sr, s.nextRunAt, s.lastRunAt ?? "", s.createdAt,
    ].join(",");
  });
  return [header, ...rows].join("\n");
}

/** Deep structural equality for two schedules. */
export function schedulesEqual(a: ResearchSchedule, b: ResearchSchedule): boolean {
  if (a.id !== b.id) return false;
  if (a.name !== b.name || a.query !== b.query) return false;
  if (a.status !== b.status || a.interval !== b.interval) return false;
  if ((a.intervalMinutes ?? 0) !== (b.intervalMinutes ?? 0)) return false;
  if ((a.hourOfDay ?? -1) !== (b.hourOfDay ?? -1)) return false;
  if ((a.dayOfWeek ?? -1) !== (b.dayOfWeek ?? -1)) return false;
  if (a.totalRuns !== b.totalRuns || a.successRuns !== b.successRuns || a.failedRuns !== b.failedRuns) return false;
  if ((a.lastRunAt ?? 0) !== (b.lastRunAt ?? 0)) return false;
  if (a.nextRunAt !== b.nextRunAt) return false;
  if (a.keywords.length !== b.keywords.length) return false;
  return a.keywords.every((k, i) => k === b.keywords[i]);
}

/** Empty/seed schedule row for forms or placeholders. */
export function emptyScheduleTemplate(): CreateScheduleOptions {
  return {
    name: "",
    query: "",
    keywords: [],
    interval: "daily",
    hourOfDay: 9,
  };
}

/** Count runs recorded in history for a given status. */
export function countHistoryByStatus(history: ScheduleRunRecord[]): Record<ScheduleRunRecord["status"], number> {
  const out = { success: 0, failed: 0, skipped: 0, missed: 0 };
  for (const r of history) out[r.status] = (out[r.status] || 0) + 1;
  return out;
}

