// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import {
  HEARTBEAT_KEY,
  HEARTBEAT_LOCK_KEY,
  HEARTBEAT_META_KEY,
  RECOVERY_HISTORY_KEY,
  acquireRecoveryLock,
  appendRecoveryHistoryEntry,
  emptyHeartbeat,
  readRecoveryHeartbeat,
  readRecoveryHistory,
  releaseRecoveryLock,
  writeRecoveryHeartbeat,
} from "./recovery-heartbeat";

/** Build a fake Upstash Redis with the minimum surface our module touches. */
function makeFakeRedis() {
  const store = new Map<string, string>();
  const hashStore = new Map<string, Record<string, string>>();
  const lists = new Map<string, string[]>();
  const expirations = new Map<string, number>();
  return {
    store,
    hashStore,
    lists,
    expirations,
    async get<T = string>(key: string): Promise<T | null> {
      const raw = store.get(key);
      return raw === undefined ? null : (raw as unknown as T);
    },
    async set(
      key: string,
      value: string,
      opts?: { nx?: boolean; ex?: number },
    ): Promise<unknown> {
      if (opts?.nx && store.has(key)) {
        return null;
      }
      store.set(key, value);
      if (opts?.ex) expirations.set(key, opts.ex);
      return "OK";
    },
    async hset(
      key: string,
      value: Record<string, string>,
    ): Promise<unknown> {
      const prev = hashStore.get(key) ?? {};
      hashStore.set(key, { ...prev, ...value });
      return 1;
    },
    async expire(key: string, seconds: number): Promise<unknown> {
      expirations.set(key, seconds);
      return 1;
    },
    async del(key: string): Promise<unknown> {
      store.delete(key);
      hashStore.delete(key);
      lists.delete(key);
      expirations.delete(key);
      return 1;
    },
    async hgetall<T = Record<string, string | null>>(
      key: string,
    ): Promise<T | null> {
      const v = hashStore.get(key);
      if (!v) return null;
      return { ...v } as unknown as T;
    },
    async lpush(key: string, ...values: string[]): Promise<unknown> {
      const arr = lists.get(key) ?? [];
      // Upstash LPUSH inserts at the head, in order. Iterating in arg
      // order matches the real semantics: the last argument ends up at
      // the leftmost position.
      for (let i = values.length - 1; i >= 0; i--) {
        arr.unshift(values[i]);
      }
      lists.set(key, arr);
      return arr.length;
    },
    async ltrim(key: string, start: number, stop: number): Promise<unknown> {
      const arr = lists.get(key);
      if (!arr) return 0;
      // Negative indices are interpreted from the tail.
      const len = arr.length;
      const normStart = start < 0 ? Math.max(len + start, 0) : start;
      const normStop = stop < 0 ? len + stop : stop;
      lists.set(key, arr.slice(normStart, normStop + 1));
      return 1;
    },
    async lrange<T = string>(key: string, start: number, stop: number): Promise<T[] | null> {
      const arr = lists.get(key);
      if (!arr) return [];
      const len = arr.length;
      const normStart = start < 0 ? Math.max(len + start, 0) : start;
      const normStop = stop < 0 ? len + stop : stop;
      return arr.slice(normStart, normStop + 1) as unknown as T[];
    },
    async eval(_script: string, keys: string[], args: string[]): Promise<number> {
      const key = keys[0];
      if (store.get(key) !== args[0]) return 0;
      store.delete(key);
      expirations.delete(key);
      return 1;
    },
  };
}

describe("readRecoveryHeartbeat", () => {
  it("returns an empty heartbeat when Redis is missing", async () => {
    const hb = await readRecoveryHeartbeat({ redis: null });
    expect(hb).toEqual(emptyHeartbeat());
  });

  it("returns lastOkAt when Redis has a string timestamp", async () => {
    const fake = makeFakeRedis();
    await fake.set(HEARTBEAT_KEY, "2026-07-13T00:00:00.000Z");
    await fake.hset(HEARTBEAT_META_KEY, {
      lastOkDurationMs: "1200",
      lastDispatched: "5",
      lastFailed: "1",
    });
    const hb = await readRecoveryHeartbeat({ redis: fake as never });
    expect(hb.lastOkAt).toBe("2026-07-13T00:00:00.000Z");
    expect(hb.lastOkDurationMs).toBe(1200);
    expect(hb.lastDispatched).toBe(5);
    expect(hb.lastFailed).toBe(1);
  });

  it("swallows Redis errors and returns an empty heartbeat", async () => {
    const boom = {
      get: vi.fn(async () => {
        throw new Error("upstash offline");
      }),
      hgetall: vi.fn(async () => {
        throw new Error("upstash offline");
      }),
    };
    const hb = await readRecoveryHeartbeat({ redis: boom as never });
    expect(hb).toEqual(emptyHeartbeat());
  });
});

describe("writeRecoveryHeartbeat", () => {
  it("writes lastOkAt on success", async () => {
    const fake = makeFakeRedis();
    await writeRecoveryHeartbeat({
      ok: true,
      requestId: "req-1",
      durationMs: 432,
      dispatched: 7,
      failed: 2,
      redis: fake as never,
      now: () => new Date("2026-07-13T01:00:00.000Z"),
    });
    expect(fake.store.get(HEARTBEAT_KEY)).toBe("2026-07-13T01:00:00.000Z");
    const meta = fake.hashStore.get(HEARTBEAT_META_KEY)!;
    expect(meta.requestId).toBe("req-1");
    expect(meta.lastDispatched).toBe("7");
    expect(meta.lastFailed).toBe("2");
    expect(meta.lastOkAt).toBe("2026-07-13T01:00:00.000Z");
  });

  it("writes lastErrorCode but does NOT touch lastOkAt on failure", async () => {
    const fake = makeFakeRedis();
    await writeRecoveryHeartbeat({
      ok: false,
      requestId: "req-2",
      durationMs: 100,
      errorCode: "ECONNRESET",
      redis: fake as never,
      now: () => new Date("2026-07-13T02:00:00.000Z"),
    });
    expect(fake.store.has(HEARTBEAT_KEY)).toBe(false);
    const meta = fake.hashStore.get(HEARTBEAT_META_KEY)!;
    expect(meta.lastErrorCode).toBe("ECONNRESET");
    expect(meta.lastErrorAt).toBe("2026-07-13T02:00:00.000Z");
  });

  it("is a no-op when Redis is missing", async () => {
    await expect(
      writeRecoveryHeartbeat({
        ok: true,
        requestId: "req-3",
        durationMs: 0,
        redis: null,
      }),
    ).resolves.toBeUndefined();
  });
});

describe("acquireRecoveryLock", () => {
  it("returns acquired=true on first caller", async () => {
    const fake = makeFakeRedis();
    const result = await acquireRecoveryLock({
      requestId: "req-a",
      redis: fake as never,
    });
    expect(result.acquired).toBe(true);
    expect(fake.store.get(HEARTBEAT_LOCK_KEY)).toBe("req-a");
  });

  it("returns acquired=false and exposes heldBy on second concurrent caller", async () => {
    const fake = makeFakeRedis();
    await acquireRecoveryLock({ requestId: "req-a", redis: fake as never });
    const second = await acquireRecoveryLock({
      requestId: "req-b",
      redis: fake as never,
    });
    expect(second.acquired).toBe(false);
    expect(second.heldBy).toBe("req-a");
  });

  it("treats Redis absence as acquired so the tick can still run", async () => {
    const result = await acquireRecoveryLock({ requestId: "x", redis: null });
    expect(result.acquired).toBe(true);
  });
});

describe("releaseRecoveryLock", () => {
  it("only releases the lock if we still own it", async () => {
    const fake = makeFakeRedis();
    await acquireRecoveryLock({ requestId: "req-a", redis: fake as never });
    // Simulate another caller stealing the lock after our TTL expired.
    fake.store.set(HEARTBEAT_LOCK_KEY, "someone-else");
    await releaseRecoveryLock("req-a", { redis: fake as never });
    expect(fake.store.get(HEARTBEAT_LOCK_KEY)).toBe("someone-else");

    // Owner can still clear their own lock.
    fake.store.set(HEARTBEAT_LOCK_KEY, "req-b");
    await releaseRecoveryLock("req-b", { redis: fake as never });
    expect(fake.store.has(HEARTBEAT_LOCK_KEY)).toBe(false);
  });
});

/**
 * Simulated interruption unit drill.
 *
 * Simulates a tick that acquired the lock, then the lambda was
 * SIGKILLed before it could release or write a heartbeat. A second
 * tick arrives during the lock TTL: it must be deduped, NOT allowed
 * to write a heartbeat (because the previous tick is technically
 * still "running" from Redis's point of view). After the lock TTL
 * expires, a third tick must acquire the lock and write a fresh
 * heartbeat -- the durable "recovery delayed -> recovered" transition.
 *
 * This is the only test that exercises the full happy-path-after-
 * interruption sequence. If this passes, the system can self-heal from
 * a crashed recovery tick without operator intervention.
 */
describe("simulated interruption unit drill", () => {
  it("dedupes concurrent ticks while holder is alive, then recovers after TTL", async () => {
    const fake = makeFakeRedis();
    // 1) Tick A acquires the lock with a short TTL, simulating a tick
    //    that started, then was killed before its finally{} could run.
    const first = await acquireRecoveryLock({
      requestId: "tick-A",
      redis: fake as never,
      ttlSeconds: 1,
    });
    expect(first.acquired).toBe(true);

    // No heartbeat yet because the tick never got to writeRecoveryHeartbeat.

    // 2) Tick B arrives 100ms later while Tick A's lock is still live.
    const second = await acquireRecoveryLock({
      requestId: "tick-B",
      redis: fake as never,
    });
    expect(second.acquired).toBe(false);
    expect(second.heldBy).toBe("tick-A");

    // 3) Upstash SET ... NX EX is atomic but our fake doesn't model
    //    real TTL expiry; emulate the TTL expiring by clearing the
    //    lock key, which is what Redis would do on its own.
    fake.store.delete(HEARTBEAT_LOCK_KEY);

    // 4) Tick C arrives after the TTL has expired. The lock is free
    //    and the gate can self-heal.
    const third = await acquireRecoveryLock({
      requestId: "tick-C",
      redis: fake as never,
    });
    expect(third.acquired).toBe(true);

    // 5) Tick C successfully writes a fresh heartbeat.
    await writeRecoveryHeartbeat({
      ok: true,
      requestId: "tick-C",
      durationMs: 250,
      dispatched: 4,
      failed: 0,
      redis: fake as never,
      now: () => new Date("2026-07-13T05:00:00.000Z"),
    });
    const hb = await readRecoveryHeartbeat({ redis: fake as never });
    expect(hb.lastOkAt).toBe("2026-07-13T05:00:00.000Z");
    expect(hb.lastOkDurationMs).toBe(250);
    expect(hb.lastDispatched).toBe(4);

    // 6) Tick C releases its lock; the next tick should be free too.
    await releaseRecoveryLock("tick-C", { redis: fake as never });
    const fourth = await acquireRecoveryLock({
      requestId: "tick-D",
      redis: fake as never,
    });
    expect(fourth.acquired).toBe(true);
  });
});

/**
 * Phase 1C: the recovery heartbeat now also records a bounded, ordered
 * series of recent ticks so the capability gate can require a *series*
 * of consecutive successful ticks before declaring healthy. Single-sample
 * heuristics are explicitly forbidden -- one cold deploy tick is not
 * evidence that the cron source actually meets its cadence.
 */
describe("recovery history series", () => {
  it("readRecoveryHistory returns [] when Redis is missing", async () => {
    const history = await readRecoveryHistory({ redis: null });
    expect(history).toEqual([]);
  });

  it("readRecoveryHistory returns [] when no entries have been written", async () => {
    const fake = makeFakeRedis();
    expect(await readRecoveryHistory({ redis: fake as never })).toEqual([]);
  });

  it("appendRecoveryHistoryEntry writes JSON-serializable entries", async () => {
    const fake = makeFakeRedis();
    await appendRecoveryHistoryEntry(
      {
        ok: true,
        at: "2026-07-13T05:00:00.000Z",
        durationMs: 200,
        dispatched: 4,
        failed: 0,
        errorCode: null,
        requestId: "tick-A",
      },
      { redis: fake as never, maxEntries: 16, ttlSeconds: 3600 },
    );
    const stored = fake.lists.get(RECOVERY_HISTORY_KEY)!;
    expect(stored).toHaveLength(1);
    expect(JSON.parse(stored[0])).toMatchObject({
      ok: true,
      requestId: "tick-A",
      dispatched: 4,
    });
    expect(fake.expirations.get(RECOVERY_HISTORY_KEY)).toBe(3600);
  });

  it("readRecoveryHistory returns entries oldest-first even though Redis stores newest-first", async () => {
    const fake = makeFakeRedis();
    // Push three entries; LPUSH semantics put the last arg at index 0.
    await appendRecoveryHistoryEntry(
      { ok: true, at: "2026-07-13T05:00:00.000Z", durationMs: 1, dispatched: 0, failed: 0, errorCode: null, requestId: "a" },
      { redis: fake as never },
    );
    await appendRecoveryHistoryEntry(
      { ok: true, at: "2026-07-13T05:05:00.000Z", durationMs: 1, dispatched: 0, failed: 0, errorCode: null, requestId: "b" },
      { redis: fake as never },
    );
    await appendRecoveryHistoryEntry(
      { ok: false, at: "2026-07-13T05:10:00.000Z", durationMs: 1, dispatched: 0, failed: 1, errorCode: "X", requestId: "c" },
      { redis: fake as never },
    );
    const history = await readRecoveryHistory({ redis: fake as never });
    expect(history.map((e) => e.requestId)).toEqual(["a", "b", "c"]);
  });

  it("history is bounded by maxEntries via LTRIM", async () => {
    const fake = makeFakeRedis();
    for (let i = 0; i < 8; i++) {
      await appendRecoveryHistoryEntry(
        {
          ok: true,
          at: `2026-07-13T05:0${i}:00.000Z`,
          durationMs: i,
          dispatched: 0,
          failed: 0,
          errorCode: null,
          requestId: `tick-${i}`,
        },
        { redis: fake as never, maxEntries: 5 },
      );
    }
    const history = await readRecoveryHistory({ redis: fake as never });
    expect(history).toHaveLength(5);
    // Newest 5 should be tick-3..tick-7 (oldest at index 0).
    expect(history.map((e) => e.requestId)).toEqual([
      "tick-3",
      "tick-4",
      "tick-5",
      "tick-6",
      "tick-7",
    ]);
  });

  it("historyLimit returns the newest bounded window rather than the oldest entries", async () => {
    const fake = makeFakeRedis();
    for (let i = 0; i < 6; i += 1) {
      await appendRecoveryHistoryEntry(
        {
          ok: true,
          at: `2026-07-13T05:0${i}:00.000Z`,
          durationMs: i,
          dispatched: 0,
          failed: 0,
          errorCode: null,
          requestId: `tick-${i}`,
        },
        { redis: fake as never },
      );
    }
    const history = await readRecoveryHistory({ redis: fake as never, historyLimit: 3 });
    expect(history.map((entry) => entry.requestId)).toEqual(["tick-3", "tick-4", "tick-5"]);
  });

  it("writeRecoveryHeartbeat also pushes to the history list", async () => {
    const fake = makeFakeRedis();
    await writeRecoveryHeartbeat({
      ok: true,
      requestId: "tick-w",
      durationMs: 250,
      dispatched: 4,
      failed: 0,
      redis: fake as never,
      now: () => new Date("2026-07-13T05:00:00.000Z"),
    });
    const history = await readRecoveryHistory({ redis: fake as never });
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      ok: true,
      requestId: "tick-w",
      at: "2026-07-13T05:00:00.000Z",
    });
  });

  it("writeRecoveryHeartbeat records an ok=false entry when the tick failed", async () => {
    const fake = makeFakeRedis();
    await writeRecoveryHeartbeat({
      ok: false,
      requestId: "tick-f",
      durationMs: 100,
      errorCode: "ECONNRESET",
      redis: fake as never,
      now: () => new Date("2026-07-13T06:00:00.000Z"),
    });
    const history = await readRecoveryHistory({ redis: fake as never });
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ ok: false, errorCode: "ECONNRESET" });
  });

  it("writeRecoveryHeartbeat still records history when Redis meta write throws", async () => {
    // If the heartbeat meta write fails we must still update the series,
    // otherwise the gate would silently miss the tick.
    const partialRedis = {
      ...makeFakeRedis(),
      hset: vi.fn(async () => {
        throw new Error("meta-bucket offline");
      }),
    };
    await writeRecoveryHeartbeat({
      ok: true,
      requestId: "tick-x",
      durationMs: 10,
      redis: partialRedis as never,
      now: () => new Date("2026-07-13T07:00:00.000Z"),
    });
    const history = await readRecoveryHistory({ redis: partialRedis as never });
    expect(history).toHaveLength(1);
    expect(history[0].requestId).toBe("tick-x");
  });

  it("readRecoveryHistory swallows malformed entries without throwing", async () => {
    const fake = makeFakeRedis();
    fake.lists.set(RECOVERY_HISTORY_KEY, [
      JSON.stringify({ ok: true, at: "2026-07-13T05:00:00.000Z", durationMs: 1, dispatched: 0, failed: 0, errorCode: null, requestId: "ok" }),
      "not json {{{",
      JSON.stringify({ ok: false /* missing at */, durationMs: 1, dispatched: 0, failed: 0, errorCode: "x", requestId: "bad" }),
    ]);
    const history = await readRecoveryHistory({ redis: fake as never });
    expect(history.map((e) => e.requestId)).toEqual(["ok"]);
  });

  it("readRecoveryHistory accepts objects returned by Upstash JSON decoding", async () => {
    const fake = makeFakeRedis();
    fake.lists.set(RECOVERY_HISTORY_KEY, [
      {
        ok: true,
        at: "2026-07-13T08:00:00.000Z",
        durationMs: 5,
        dispatched: 1,
        failed: 0,
        errorCode: null,
        requestId: "decoded-object",
      },
    ] as unknown as string[]);
    const history = await readRecoveryHistory({ redis: fake as never });
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ requestId: "decoded-object", ok: true });
  });
});
