/// <reference types="vitest/globals" />
import { recordFlip, snapshotFlips, clearFlips } from "@/lib/utils/flip-history";

describe("flip-history", () => {
  beforeEach(() => {
    clearFlips();
  });

  it("records and snapshots events", () => {
    recordFlip("breaker_open", "provider:openai", { detail: "5 consecutive failures" });
    recordFlip("provider_flip", "active", { from: "openai", to: "mock" });

    const snap = snapshotFlips();
    expect(snap).toHaveLength(2);
    expect(snap[0].type).toBe("breaker_open");
    expect(snap[0].key).toBe("provider:openai");
    expect(snap[1].type).toBe("provider_flip");
    expect(snap[1].from).toBe("openai");
    expect(snap[1].to).toBe("mock");
    expect(snap[0].id).toBeLessThan(snap[1].id);
    expect(snap[0].timestamp).toBeGreaterThan(0);
  });

  it("caps at MAX_EVENTS (50) keeping most recent", () => {
    for (let i = 0; i < 60; i++) {
      recordFlip("breaker_close", "test:" + i);
    }
    const snap = snapshotFlips();
    expect(snap).toHaveLength(50);
    expect(snap[0].key).toBe("test:10");
    expect(snap[49].key).toBe("test:59");
  });

  it("honors limit parameter", () => {
    for (let i = 0; i < 10; i++) {
      recordFlip("breaker_open", "k" + i);
    }
    const snap = snapshotFlips(3);
    expect(snap).toHaveLength(3);
    expect(snap[0].key).toBe("k7");
  });

  it("clearFlips resets state", () => {
    recordFlip("breaker_open", "x");
    clearFlips();
    expect(snapshotFlips()).toHaveLength(0);

    // After clear, new events should start from id 1
    const ev = recordFlip("breaker_close", "y");
    expect(ev.id).toBe(1);
  });

  it("events have monotonically increasing ids", () => {
    const ids: number[] = [];
    for (let i = 0; i < 5; i++) {
      ids.push(recordFlip("breaker_open", "k" + i).id);
    }
    for (let i = 1; i < ids.length; i++) {
      expect(ids[i]).toBeGreaterThan(ids[i - 1]);
    }
  });
});
