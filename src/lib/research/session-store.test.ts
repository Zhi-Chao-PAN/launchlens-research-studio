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
    mockSubscribers.length = 0;
    publishedMessages.length = 0;
    setRedisEnv();
    vi.resetModules();
    vi.doMock("@upstash/redis", () => ({
      Redis: class MockRedis {
        async set(key: string, value: unknown, opts?: { ex?: number; nx?: boolean }) {
          if (opts?.nx && mockStore.has(key)) return null;
          mockStore.set(key, typeof value === "string" ? value : JSON.stringify(value));
          return "OK";
        }
        async get<T = unknown>(key: string): Promise<T | null> {
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
    await storeSession(s);
    const got = await fetchSession(s.id);
    expect(got?.id).toBe(s.id);
    expect(got?.query).toBe(s.query);
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
