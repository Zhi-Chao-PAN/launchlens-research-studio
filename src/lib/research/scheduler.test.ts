import {
  _resetScheduler,
  calculateNextRun,
  createSchedule,
  getSchedule,
  listSchedules,
  updateSchedule,
  toggleSchedule,
  deleteSchedule,
  getSchedulerStats,
  tickSchedules,
  formatScheduleInterval,
  triggerScheduleNow,
} from "@/lib/research/scheduler";

vi.mock("@/lib/research/batch-manager", () => ({
  createBatch: vi.fn().mockResolvedValue({
    id: "batch-mock-1",
    total: 1,
    completed: 0,
    failed: 0,
    status: "running",
    runs: [{ id: "run-1", query: "test", status: "queued", priority: "normal", retryCount: 0 }],
    createdAt: Date.now(),
    priority: "normal",
    concurrency: 2,
    retriesPerRun: 1,
    progress: 0,
    _seq: 0,
  }),
  getBatch: vi.fn().mockResolvedValue(null),
}));

beforeEach(() => {
  _resetScheduler();
  vi.clearAllMocks();
  vi.useFakeTimers({ now: new Date("2025-06-15T14:30:00.000Z") });
});

afterEach(() => {
  vi.useRealTimers();
});

// Helpers for local-time assertions (calculateNextRun uses local setHours/setDate)
function getLocalHour(ts: number): number {
  return new Date(ts).getHours();
}
function getLocalDate(ts: number): number {
  return new Date(ts).getDate();
}
function getLocalDay(ts: number): number {
  return new Date(ts).getDay();
}

describe("calculateNextRun", () => {
  it("hourly: returns next hour on the hour", () => {
    const base = Date.now(); // 14:30 local
    const next = calculateNextRun({ interval: "hourly" }, base);
    const d = new Date(next);
    expect(d.getMinutes()).toBe(0);
    expect(d.getSeconds()).toBe(0);
    expect(next - base).toBeGreaterThan(0);
    expect(next - base).toBeLessThanOrEqual(60 * 60 * 1000);
  });

  it("daily: returns today at hour if hour hasn't passed", () => {
    const baseHour = new Date().getHours(); // 14 (local)
    const next = calculateNextRun({ interval: "daily", hourOfDay: baseHour + 1 }, Date.now());
    expect(getLocalHour(next)).toBe(baseHour + 1);
    expect(getLocalDate(next)).toBe(getLocalDate(Date.now()));
  });

  it("daily: returns tomorrow if hour has already passed", () => {
    const baseHour = new Date().getHours();
    const next = calculateNextRun({ interval: "daily", hourOfDay: baseHour - 1 }, Date.now());
    expect(getLocalHour(next)).toBe(baseHour - 1);
    expect(getLocalDate(next)).toBe(getLocalDate(Date.now()) + 1);
  });

  it("daily: defaults to 9 AM", () => {
    const base = new Date("2025-06-15T08:00:00").getTime(); // local 8 AM
    const next = calculateNextRun({ interval: "daily" }, base);
    expect(getLocalHour(next)).toBe(9);
  });

  it("weekly: moves to correct day of week", () => {
    const base = Date.now();
    const baseDay = new Date(base).getDay();
    const targetDay = (baseDay + 2) % 7; // 2 days from now
    const next = calculateNextRun({ interval: "weekly", dayOfWeek: targetDay, hourOfDay: 9 }, base);
    expect(getLocalDay(next)).toBe(targetDay);
    expect(getLocalHour(next)).toBe(9);
    expect(next - base).toBeGreaterThan(0);
    expect(next - base).toBeLessThanOrEqual(7 * 24 * 60 * 60 * 1000);
  });

  it("weekly: same day but time passed -> next week", () => {
    const baseDay = new Date().getDay();
    const baseHour = new Date().getHours();
    const next = calculateNextRun(
      { interval: "weekly", dayOfWeek: baseDay, hourOfDay: baseHour - 1 },
      Date.now()
    );
    expect(getLocalDay(next)).toBe(baseDay);
    expect(next - Date.now()).toBeGreaterThan(6 * 24 * 60 * 60 * 1000);
  });

  it("interval: adds N minutes to now", () => {
    const base = Date.now();
    const next = calculateNextRun({ interval: "interval", intervalMinutes: 30 }, base);
    expect(next - base).toBe(30 * 60 * 1000);
  });

  it("interval: clamps minimum to 1 minute", () => {
    const base = Date.now();
    const next = calculateNextRun({ interval: "interval", intervalMinutes: 0 }, base);
    expect(next - base).toBe(60 * 1000);
  });

  it("interval: clamps maximum to 7 days", () => {
    const base = Date.now();
    const next = calculateNextRun({ interval: "interval", intervalMinutes: 99999 }, base);
    expect(next - base).toBe(10080 * 60 * 1000);
  });

  it("interval: defaults to 60 minutes", () => {
    const base = Date.now();
    const next = calculateNextRun({ interval: "interval" }, base);
    expect(next - base).toBe(60 * 60 * 1000);
  });
});

describe("formatScheduleInterval", () => {
  it("formats hourly", () => {
    const s = createSchedule({ name: "test", query: "q", interval: "hourly" });
    expect(formatScheduleInterval(s)).toBe("每小时");
  });

  it("formats daily with hour", () => {
    const s = createSchedule({ name: "test", query: "q", interval: "daily", hourOfDay: 14 });
    expect(formatScheduleInterval(s)).toBe("每天 14:00");
  });

  it("formats weekly with day and hour", () => {
    const s = createSchedule({ name: "test", query: "q", interval: "weekly", dayOfWeek: 3, hourOfDay: 10 });
    expect(formatScheduleInterval(s)).toBe("周三 10:00");
  });

  it("formats interval minutes", () => {
    const s = createSchedule({ name: "test", query: "q", interval: "interval", intervalMinutes: 45 });
    expect(formatScheduleInterval(s)).toBe("每 45 分钟");
  });
});

describe("createSchedule", () => {
  it("creates a schedule with all fields", () => {
    const s = createSchedule({
      name: "Daily Market Scan",
      query: "AI market trends",
      keywords: ["ai", "market"],
      agent: "analyst",
      interval: "daily",
      hourOfDay: 8,
    });

    expect(s.id).toBeTruthy();
    expect(s.name).toBe("Daily Market Scan");
    expect(s.query).toBe("AI market trends");
    expect(s.keywords).toEqual(["ai", "market"]);
    expect(s.agent).toBe("analyst");
    expect(s.status).toBe("active");
    expect(s.interval).toBe("daily");
    expect(s.hourOfDay).toBe(8);
    expect(s.totalRuns).toBe(0);
    expect(s.successRuns).toBe(0);
    expect(s.failedRuns).toBe(0);
    expect(s.createdAt).toBeGreaterThan(0);
    expect(s.nextRunAt).toBeGreaterThan(s.createdAt);
  });

  it("generates a default name for empty name", () => {
    const s = createSchedule({ name: "  ", query: "test", interval: "hourly" });
    expect(s.name).toBe("未命名定时研究");
  });

  it("throws error for empty query", () => {
    expect(() => createSchedule({ name: "test", query: "", interval: "hourly" })).toThrow("不能为空");
  });

  it("enforces max schedules cap", () => {
    for (let i = 0; i < 20; i++) {
      createSchedule({ name: `s${i}`, query: `q${i}`, interval: "hourly" });
    }
    expect(() => createSchedule({ name: "s21", query: "q21", interval: "hourly" })).toThrow();
  });
});

describe("getSchedule & listSchedules", () => {
  it("returns undefined for unknown id", () => {
    expect(getSchedule("nonexistent")).toBeUndefined();
  });

  it("lists schedules newest first", () => {
    const s1 = createSchedule({ name: "first", query: "q1", interval: "hourly" });
    vi.advanceTimersByTime(10);
    const s2 = createSchedule({ name: "second", query: "q2", interval: "hourly" });
    vi.advanceTimersByTime(10);
    const s3 = createSchedule({ name: "third", query: "q3", interval: "hourly" });

    const list = listSchedules();
    expect(list.length).toBe(3);
    expect(list[0].id).toBe(s3.id);
    expect(list[1].id).toBe(s2.id);
    expect(list[2].id).toBe(s1.id);
  });
});

describe("updateSchedule", () => {
  it("updates name and query", () => {
    const s = createSchedule({ name: "old", query: "old query", interval: "hourly" });
    vi.advanceTimersByTime(1);
    const updated = updateSchedule(s.id, { name: "new", query: "new query" });
    expect(updated?.name).toBe("new");
    expect(updated?.query).toBe("new query");
    expect(updated?.updatedAt).toBeGreaterThan(s.updatedAt);
  });

  it("returns undefined for unknown id", () => {
    expect(updateSchedule("nope", { name: "x" })).toBeUndefined();
  });

  it("recalculates nextRun when interval changes", () => {
    const s = createSchedule({ name: "test", query: "q", interval: "hourly" });
    const originalNext = s.nextRunAt;
    const updated = updateSchedule(s.id, { interval: "interval", intervalMinutes: 120 });
    expect(updated?.nextRunAt).not.toBe(originalNext);
    expect(updated?.nextRunAt - s.createdAt).toBe(120 * 60 * 1000);
  });

  it("does not recalculate nextRun when status changes to paused", () => {
    const s = createSchedule({ name: "test", query: "q", interval: "hourly" });
    const originalNext = s.nextRunAt;
    const updated = updateSchedule(s.id, { status: "paused" });
    expect(updated?.nextRunAt).toBe(originalNext);
  });

  it("recalculates nextRun when reactivated", () => {
    const s = createSchedule({ name: "test", query: "q", interval: "hourly" });
    const paused = updateSchedule(s.id, { status: "paused" });
    vi.advanceTimersByTime(60 * 60 * 1000); // 1 hour later
    const reactivated = updateSchedule(s.id, { status: "active" });
    expect(reactivated?.nextRunAt).toBeGreaterThan(paused?.nextRunAt ?? 0);
  });
});

describe("toggleSchedule", () => {
  it("toggles active -> paused -> active", () => {
    const s = createSchedule({ name: "test", query: "q", interval: "hourly" });
    expect(s.status).toBe("active");

    const paused = toggleSchedule(s.id);
    expect(paused?.status).toBe("paused");

    const reactivated = toggleSchedule(s.id);
    expect(reactivated?.status).toBe("active");
  });

  it("returns undefined for unknown id", () => {
    expect(toggleSchedule("nope")).toBeUndefined();
  });
});

describe("deleteSchedule", () => {
  it("deletes a schedule", () => {
    const s = createSchedule({ name: "test", query: "q", interval: "hourly" });
    expect(listSchedules().length).toBe(1);

    const result = deleteSchedule(s.id);
    expect(result).toBe(true);
    expect(listSchedules().length).toBe(0);
    expect(getSchedule(s.id)).toBeUndefined();
  });

  it("returns false for unknown id", () => {
    expect(deleteSchedule("nope")).toBe(false);
  });
});

describe("triggerScheduleNow", () => {
  it("triggers a batch immediately", async () => {
    const { createBatch } = await import("@/lib/research/batch-manager");
    const s = createSchedule({ name: "test", query: "q", interval: "daily" });

    const result = await triggerScheduleNow(s.id);
    expect(result).not.toBeNull();
    expect(result?.batchId).toBe("batch-mock-1");
    expect(createBatch).toHaveBeenCalled();

    const updated = getSchedule(s.id);
    expect(updated?.lastRunAt).toBeTruthy();
    expect(updated?.lastRunId).toBe("batch-mock-1");
  });

  it("returns null for unknown id", async () => {
    const result = await triggerScheduleNow("nope");
    expect(result).toBeNull();
  });
});

describe("tickSchedules", () => {
  it("triggers schedules whose nextRunAt has passed", async () => {
    const s = createSchedule({ name: "test", query: "q", interval: "hourly" });
    const store = global.__scheduleStore!;
    const direct = store.get(s.id)!;
    direct.nextRunAt = Date.now() - 1000;
    store.set(s.id, direct);

    const triggered = await tickSchedules();
    expect(triggered).toBe(1);

    const updated = getSchedule(s.id);
    expect(updated?.totalRuns).toBe(1);
    expect(updated?.lastRunAt).toBeTruthy();
    expect(updated?.nextRunAt).toBeGreaterThan(Date.now());
  });

  it("does not trigger paused schedules", async () => {
    const s = createSchedule({ name: "test", query: "q", interval: "hourly" });
    toggleSchedule(s.id);

    const store = global.__scheduleStore!;
    const direct = store.get(s.id)!;
    direct.nextRunAt = Date.now() - 1000;
    store.set(s.id, direct);

    const triggered = await tickSchedules();
    expect(triggered).toBe(0);
  });

  it("does not trigger schedules whose time has not come", async () => {
    createSchedule({ name: "test", query: "q", interval: "interval", intervalMinutes: 60 });

    const triggered = await tickSchedules();
    expect(triggered).toBe(0);
  });
});

describe("getSchedulerStats", () => {
  it("returns empty stats when no schedules", () => {
    const stats = getSchedulerStats();
    expect(stats.total).toBe(0);
    expect(stats.active).toBe(0);
    expect(stats.paused).toBe(0);
    expect(stats.nextRunAt).toBeUndefined();
    expect(stats.totalRuns).toBe(0);
  });

  it("returns correct stats with mixed schedules", () => {
    const s1 = createSchedule({ name: "a", query: "q1", interval: "interval", intervalMinutes: 30 });
    const s2 = createSchedule({ name: "b", query: "q2", interval: "daily" });
    toggleSchedule(s2.id);

    const stats = getSchedulerStats();
    expect(stats.total).toBe(2);
    expect(stats.active).toBe(1);
    expect(stats.paused).toBe(1);
    expect(stats.nextRunAt).toBe(s1.nextRunAt);
  });

  it("tracks total runs across all schedules", async () => {
    const s1 = createSchedule({ name: "a", query: "q1", interval: "hourly" });
    const s2 = createSchedule({ name: "b", query: "q2", interval: "hourly" });

    const store = global.__scheduleStore!;
    store.get(s1.id)!.nextRunAt = Date.now() - 1000;
    store.get(s2.id)!.nextRunAt = Date.now() - 1000;

    await tickSchedules();
    const stats = getSchedulerStats();
    expect(stats.totalRuns).toBe(2);
  });
});