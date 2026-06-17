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