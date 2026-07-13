// Unit tests for session-store.
//
// The session-store module wraps Redis (Upstash REST API) for the cross-
// instance session state and Pub/Sub event fan-out used by the research
// engine. These tests cover:
//   1. The degraded path — every function is a no-op / safe return when
//      no Redis env is set. This is the path tests and local dev use, and
//      proves the in-memory engine behavior is preserved.
//   2. The configured path with a mocked Upstash Redis client — verifies
//      each helper's contract (set/get/del, publish/subscribe, lock NX,
//      TTL, JSON deserialization) without making real network calls.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ResearchEvent, ResearchSession } from "@/lib/schema/research-schema";
import { buildResearchValidation } from "./validation-ledger";

// Capture original env so each test can mutate freely without leaking.
const ORIGINAL_ENV = { ...process.env };

function clearRedisEnv(): void {
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
}

function setRedisEnv(): void {
  process.env.UPSTASH_REDIS_REST_URL = "https://test-redis.upstash.io";
  process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";
}

// ---------------------------------------------------------------------------
// Degraded path (no Redis)
// ---------------------------------------------------------------------------

describe("session-store — degraded (no Redis)", () => {
  beforeEach(() => {
    clearRedisEnv();
    vi.resetModules();
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("storeSession is a no-op (does not throw)", async () => {
    const { storeSession } = await import("./session-store");
    const fakeSession = makeFakeSession();
    await expect(storeSession(fakeSession)).resolves.toBeUndefined();
  });

  it("fetchSession returns null", async () => {
    const { fetchSession } = await import("./session-store");
    await expect(fetchSession("anything")).resolves.toBeNull();
  });

  it("removeSession is a no-op (does not throw)", async () => {
    const { removeSession } = await import("./session-store");
    await expect(removeSession("anything")).resolves.toBeUndefined();
  });

  it("setCancelFlag is a no-op", async () => {
    const { setCancelFlag } = await import("./session-store");
    await expect(setCancelFlag("anything")).resolves.toBeUndefined();
  });

  it("isCancelledRemotely returns false (local Set is the source of truth)", async () => {
    const { isCancelledRemotely } = await import("./session-store");
    await expect(isCancelledRemotely("anything")).resolves.toBe(false);
  });

  it("acquireRunLock always returns true (no contention in single-instance)", async () => {
    const { acquireRunLock } = await import("./session-store");
    await expect(acquireRunLock("anything")).resolves.toBe(true);
  });

  it("releaseRunLock is a no-op", async () => {
    const { releaseRunLock } = await import("./session-store");
    await expect(releaseRunLock("anything")).resolves.toBeUndefined();
  });

  it("isRunLocked returns false", async () => {
    const { isRunLocked } = await import("./session-store");
    await expect(isRunLocked("anything")).resolves.toBe(false);
  });

  it("publishEvent is a no-op (does not throw)", async () => {
    const { publishEvent } = await import("./session-store");
    const ev = makeFakeEvent();
    expect(() => publishEvent("anything", ev)).not.toThrow();
  });

  it("subscribeEvents returns a no-op unsub function", async () => {
    const { subscribeEvents } = await import("./session-store");
    const cb = vi.fn();
    const unsub = subscribeEvents("anything", cb);
    expect(typeof unsub).toBe("function");
    expect(() => unsub()).not.toThrow();
    // No callback was ever invoked — Redis path is inert.
    expect(cb).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Configured path (with mocked Upstash client)
// ---------------------------------------------------------------------------

describe("session-store — with mocked Upstash client", () => {
  // The shared in-memory mock store backs every operation the SDK exposes
  // here. It mirrors the subset of @upstash/redis we use so we can assert
  // exactly how each session-store helper interacts with the client.
  const mockStore = new Map<string, string>();
  const mockExpiry = new Map<string, number>();
  const publishedMessages: Array<{ channel: string; message: unknown }> = [];
  const mockSubscribers: Array<{
    channels: string[];
    listeners: Map<string, Set<(msg: unknown) => void>>;
    unsubscribe: () => Promise<void>;
    removeAllListeners: () => void;
    on: (type: string, listener: (msg: unknown) => void) => void;
    _simulateMessage: (type: string, msg: unknown) => void;
  }> = [];

  beforeEach(() => {
    mockStore.clear();
    mockExpiry.clear();
    mockSubscribers.length = 0;
    publishedMessages.length = 0;
    setRedisEnv();
    vi.resetModules();
    vi.doMock("@upstash/redis", () => ({
      Redis: class MockRedis {
        async set(key: string, value: unknown, opts?: { ex?: number; nx?: boolean }) {
          if (opts?.nx && mockStore.has(key)) return null;
          mockStore.set(key, typeof value === "string" ? value : JSON.stringify(value));
          if (opts?.ex) {
            mockExpiry.set(key, Date.now() + opts.ex * 1000);
          } else {
            mockExpiry.delete(key);
          }
          return "OK";
        }
        async eval<TArgs extends unknown[], TData = unknown>(
          _script: string,
          keys: string[],
          args: TArgs,
        ): Promise<TData> {
          const key = keys[0];
          const payload = String(args[0]);
          const incomingStatus = String(args[1]);
          const incomingUpdatedAt = String(args[2]);
          const requestedTtlMs = Number(args[3]);
          const statusRank = (status: string): number => {
            if (status === "pending") return 0;
            if (status === "running") return 1;
            if (status === "completed" || status === "cancelled" || status === "error") {
              return 2;
            }
            return -1;
          };

          const expiresAt = mockExpiry.get(key);
          if (expiresAt !== undefined && expiresAt <= Date.now()) {
            mockStore.delete(key);
            mockExpiry.delete(key);
          }

          const incomingRank = statusRank(incomingStatus);
          if (incomingRank < 0 || !Number.isFinite(requestedTtlMs) || requestedTtlMs < 1) {
            return -1 as TData;
          }

          const existingRaw = mockStore.get(key);
          if (existingRaw !== undefined) {
            try {
              const existing = JSON.parse(existingRaw) as Partial<ResearchSession>;
              const existingStatus = String(existing.status ?? "");
              const existingUpdatedAt = String(existing.updatedAt ?? "");
              const existingRank = statusRank(existingStatus);
              if (
                existingRank > incomingRank ||
                (existingRank === 2 &&
                  incomingRank === 2 &&
                  existingStatus !== incomingStatus) ||
                (existingStatus === incomingStatus &&
                  existingUpdatedAt !== "" &&
                  incomingUpdatedAt !== "" &&
                  incomingUpdatedAt < existingUpdatedAt)
              ) {
                return 0 as TData;
              }
            } catch {
              // Match the Lua script: malformed legacy data can be replaced.
            }
          }

          const existingExpiry = mockExpiry.get(key);
          mockStore.set(key, payload);
          if (existingRaw !== undefined && existingExpiry === undefined) {
            mockExpiry.delete(key);
          } else {
            const requestedExpiry = Date.now() + requestedTtlMs;
            mockExpiry.set(
              key,
              existingExpiry !== undefined && existingExpiry > requestedExpiry
                ? existingExpiry
                : requestedExpiry,
            );
          }
          return 1 as TData;
        }
        async get<T = unknown>(key: string): Promise<T | null> {
          const expiresAt = mockExpiry.get(key);
          if (expiresAt !== undefined && expiresAt <= Date.now()) {
            mockStore.delete(key);
            mockExpiry.delete(key);
          }
          const v = mockStore.get(key);
          if (v === undefined) return null;
          // Mirror Upstash's auto-deserialization (parses JSON values).
          try {
            return JSON.parse(v) as T;
          } catch {
            return v as unknown as T;
          }
        }
        async del(key: string) {
          mockExpiry.delete(key);
          return mockStore.delete(key) ? 1 : 0;
        }
        async publish(channel: string, message: unknown): Promise<number> {
          // Record published messages so tests can assert fan-out if needed.
          publishedMessages.push({ channel, message });
          return 0;
        }
        subscribe(channels: string | string[]) {
          const arr = Array.isArray(channels) ? channels : [channels];
          const listeners = new Map<string, Set<(msg: unknown) => void>>();
          const sub = {
            channels: arr,
            listeners,
            on(type: string, listener: (msg: unknown) => void) {
              if (!listeners.has(type)) listeners.set(type, new Set());
              listeners.get(type)!.add(listener);
            },
            async unsubscribe() {
              listeners.clear();
            },
            removeAllListeners() {
              listeners.clear();
            },
            _simulateMessage(type: string, msg: unknown) {
              listeners.get(type)?.forEach((cb) => cb(msg));
            },
          };
          mockSubscribers.push(sub);
          return sub;
        }
      },
    }));
  });

  afterEach(() => {
    vi.doUnmock("@upstash/redis");
    process.env = { ...ORIGINAL_ENV };
  });

  it("storeSession writes session JSON via redis.set", async () => {
    const { storeSession } = await import("./session-store");
    const s = makeFakeSession();
    await storeSession(s);
    expect(mockStore.has(`rs:session:${s.id}`)).toBe(true);
  });

  it("fetchSession returns the stored session", async () => {
    const { storeSession, fetchSession } = await import("./session-store");
    const s = makeFakeSession();
    s.validation = buildResearchValidation(s, "2026-07-13T12:00:00.000Z");
    await storeSession(s);
    const got = await fetchSession(s.id);
    expect(got?.id).toBe(s.id);
    expect(got?.query).toBe(s.query);
    expect(got?.validation).toMatchObject({
      generatedAt: "2026-07-13T12:00:00.000Z",
      protocol: { executedPasses: 1, deepMultiPassExecuted: false },
      semanticValidation: { status: "not_run" },
    });
  });

  it("keeps completed sessions recoverable after the live-session window", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-29T00:00:00.000Z"));
    try {
      const { storeSession, fetchSession } = await import("./session-store");
      const completed = makeFakeSession();
      completed.status = "completed";

      await storeSession(completed);
      vi.setSystemTime(new Date("2026-06-29T00:31:00.000Z"));

      await expect(fetchSession(completed.id)).resolves.toMatchObject({
        id: completed.id,
        status: "completed",
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it.each(["completed", "cancelled", "error"] as const)(
    "keeps a cross-instance %s snapshot sticky when a late running write arrives",
    async (terminalStatus) => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-07-13T10:00:00.000Z"));
      try {
        const firstInstance = await import("./session-store");
        const terminal = makeFakeSession();
        terminal.id = `cross-instance-${terminalStatus}`;
        terminal.status = terminalStatus;
        terminal.updatedAt = "2026-07-13T10:00:00.000Z";
        await firstInstance.storeSession(terminal);

        const key = `rs:session:${terminal.id}`;
        const terminalPayload = mockStore.get(key);
        const terminalExpiry = mockExpiry.get(key);

        // A fresh module graph represents another serverless instance. Its
        // local write queue cannot see the first instance's terminal write.
        vi.resetModules();
        vi.setSystemTime(new Date("2026-07-13T10:01:00.000Z"));
        const secondInstance = await import("./session-store");
        const lateRunning = {
          ...JSON.parse(JSON.stringify(terminal)),
          status: "running",
          updatedAt: "2026-07-13T10:01:00.000Z",
          query: "stale running payload",
        } as ResearchSession;
        await secondInstance.storeSession(lateRunning);

        expect(mockStore.get(key)).toBe(terminalPayload);
        expect(mockExpiry.get(key)).toBe(terminalExpiry);
        await expect(secondInstance.fetchSession(terminal.id)).resolves.toMatchObject({
          status: terminalStatus,
          query: "test query",
        });
      } finally {
        vi.useRealTimers();
      }
    },
  );

  it("keeps the first terminal outcome when another instance reports a different terminal status", async () => {
    const firstInstance = await import("./session-store");
    const completed = makeFakeSession();
    completed.id = "terminal-conflict";
    completed.status = "completed";
    completed.updatedAt = "2026-07-13T10:00:00.000Z";
    await firstInstance.storeSession(completed);

    vi.resetModules();
    const secondInstance = await import("./session-store");
    await secondInstance.storeSession({
      ...completed,
      status: "cancelled",
      updatedAt: "2026-07-13T10:01:00.000Z",
    });

    await expect(secondInstance.fetchSession(completed.id)).resolves.toMatchObject({
      status: "completed",
      updatedAt: "2026-07-13T10:00:00.000Z",
    });
  });

  it("does not regress a running session to a late pending creation snapshot", async () => {
    const firstInstance = await import("./session-store");
    const running = makeFakeSession();
    running.id = "active-monotonic";
    running.status = "running";
    running.updatedAt = "2026-07-13T10:00:00.000Z";
    await firstInstance.storeSession(running);

    vi.resetModules();
    const secondInstance = await import("./session-store");
    await secondInstance.storeSession({
      ...running,
      status: "pending",
      updatedAt: "2026-07-13T10:01:00.000Z",
    });

    await expect(secondInstance.fetchSession(running.id)).resolves.toMatchObject({
      status: "running",
      updatedAt: "2026-07-13T10:00:00.000Z",
    });
  });

  it("accepts a newer same-terminal revision without shortening its existing TTL", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-13T10:00:00.000Z"));
    try {
      const firstInstance = await import("./session-store");
      const completed = makeFakeSession();
      completed.id = "terminal-ttl";
      completed.status = "completed";
      completed.updatedAt = "2026-07-13T10:00:00.000Z";
      await firstInstance.storeSession(completed);

      const key = `rs:session:${completed.id}`;
      const originalExpiry = mockExpiry.get(key);
      process.env.LAUNCHLENS_TERMINAL_SESSION_TTL_SECONDS = "3600";
      vi.setSystemTime(new Date("2026-07-13T10:01:00.000Z"));
      vi.resetModules();
      const secondInstance = await import("./session-store");
      await secondInstance.storeSession({
        ...completed,
        updatedAt: "2026-07-13T10:01:00.000Z",
        query: "newer terminal payload",
      });

      expect(mockExpiry.get(key)).toBe(originalExpiry);
      await expect(secondInstance.fetchSession(completed.id)).resolves.toMatchObject({
        status: "completed",
        query: "newer terminal payload",
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("fetchSession returns null when key is absent", async () => {
    const { fetchSession } = await import("./session-store");
    await expect(fetchSession("missing")).resolves.toBeNull();
  });

  it("removeSession also clears the cancel flag", async () => {
    const { setCancelFlag, removeSession } = await import("./session-store");
    await setCancelFlag("sid");
    expect(mockStore.has("rs:cancel:sid")).toBe(true);
    await removeSession("sid");
    expect(mockStore.has("rs:cancel:sid")).toBe(false);
    expect(mockStore.has("rs:session:sid")).toBe(false);
  });

  it("setCancelFlag + isCancelledRemotely round-trip", async () => {
    const { setCancelFlag, isCancelledRemotely } = await import("./session-store");
    await expect(isCancelledRemotely("sid")).resolves.toBe(false);
    await setCancelFlag("sid");
    // Local cancel cache is set; immediate read should reflect it.
    await expect(isCancelledRemotely("sid")).resolves.toBe(true);
  });

  it("acquireRunLock succeeds once then fails (NX semantics)", async () => {
    const { acquireRunLock } = await import("./session-store");
    await expect(acquireRunLock("sid")).resolves.toBe(true);
    await expect(acquireRunLock("sid")).resolves.toBe(false);
  });

  it("releaseRunLock allows re-acquisition", async () => {
    const { acquireRunLock, releaseRunLock } = await import("./session-store");
    await acquireRunLock("sid");
    await releaseRunLock("sid");
    await expect(acquireRunLock("sid")).resolves.toBe(true);
  });

  it("isRunLocked reflects lock presence", async () => {
    const { acquireRunLock, isRunLocked, releaseRunLock } = await import("./session-store");
    await expect(isRunLocked("sid")).resolves.toBe(false);
    await acquireRunLock("sid");
    await expect(isRunLocked("sid")).resolves.toBe(true);
    await releaseRunLock("sid");
    await expect(isRunLocked("sid")).resolves.toBe(false);
  });

  it("subscribeEvents returns a working unsub; subscriber receives messages", async () => {
    const { subscribeEvents } = await import("./session-store");
    const cb = vi.fn();
    const unsub = subscribeEvents("sid", cb);
    expect(mockSubscribers.length).toBe(1);
    expect(mockSubscribers[0].channels).toEqual(["rs:events:sid"]);
    // Simulate the SDK firing a 'message' event with a parsed payload.
    mockSubscribers[0]._simulateMessage("message", { type: "progress", timestamp: "now" });
    expect(cb).toHaveBeenCalledWith(expect.objectContaining({ type: "progress" }));
    unsub();
    // After unsub, further messages are ignored (the listener flag flips off).
    cb.mockClear();
    mockSubscribers[0]._simulateMessage("message", { type: "progress" });
    expect(cb).not.toHaveBeenCalled();
  });

  it("subscribeEvents parses string payloads as JSON (defensive)", async () => {
    const { subscribeEvents } = await import("./session-store");
    const cb = vi.fn();
    subscribeEvents("sid", cb);
    mockSubscribers[0]._simulateMessage(
      "message",
      JSON.stringify({ type: "status", timestamp: "x" }),
    );
    expect(cb).toHaveBeenCalledWith(expect.objectContaining({ type: "status" }));
  });

  it("publishEvent does not throw even if Redis mock would fail", async () => {
    const { publishEvent } = await import("./session-store");
    const ev = makeFakeEvent();
    expect(() => publishEvent("sid", ev)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function makeFakeSession(): ResearchSession {
  return {
    id: `sess_${Math.random().toString(36).slice(2)}`,
    query: "test query",
    keywords: ["kw1"],
    mode: "standard",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: "pending",
    agents: {
      "market-sizer": { id: "market-sizer", status: "idle", progress: 0, currentStep: "Waiting" },
      "competitor-analyst": { id: "competitor-analyst", status: "idle", progress: 0, currentStep: "Waiting" },
      "pain-detective": { id: "pain-detective", status: "idle", progress: 0, currentStep: "Waiting" },
      "pricing-scout": { id: "pricing-scout", status: "idle", progress: 0, currentStep: "Waiting" },
      "channel-scout": { id: "channel-scout", status: "idle", progress: 0, currentStep: "Waiting" },
      synthesis: { id: "synthesis", status: "idle", progress: 0, currentStep: "Waiting" },
    },
    citations: [],
  };
}

function makeFakeEvent(): ResearchEvent {
  return {
    type: "progress",
    agentId: "market-sizer",
    timestamp: new Date().toISOString(),
    data: { step: "step 1", progress: 10 },
  };
}
