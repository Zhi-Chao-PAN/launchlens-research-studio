// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import {
  HEARTBEAT_KEY,
  HEARTBEAT_LOCK_KEY,
  HEARTBEAT_META_KEY,
  acquireRecoveryLock,
  emptyHeartbeat,
  readRecoveryHeartbeat,
  releaseRecoveryLock,
  writeRecoveryHeartbeat,
} from "./recovery-heartbeat";

/** Build a fake Upstash Redis with the minimum surface our module touches. */
function makeFakeRedis() {
  const store = new Map<string, string>();
  const hashStore = new Map<string, Record<string, string>>();
  const expirations = new Map<string, number>();
  return {
    store,
    hashStore,
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
 * Real interruption drill.
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
describe("interruption drill", () => {
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