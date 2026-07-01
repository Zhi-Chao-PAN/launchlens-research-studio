import { describe, it, expect } from "vitest";
import { createConcurrencyLimiter } from "./concurrency-limiter";

describe("createConcurrencyLimiter", () => {
  it("never exceeds the configured max concurrency", async () => {
    const lim = createConcurrencyLimiter(2);
    let active = 0;
    let peak = 0;
    const task = async (i: number) => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 10));
      active--;
      return i;
    };
    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) => lim.run(() => task(i))),
    );
    expect(peak).toBeLessThanOrEqual(2);
    expect(results).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(lim.active).toBe(0);
    expect(lim.waiting).toBe(0);
  });

  it("resolves with fn's value and rejects with fn's error", async () => {
    const lim = createConcurrencyLimiter(1);
    await expect(lim.run(async () => "ok")).resolves.toBe("ok");
    await expect(lim.run(async () => { throw new Error("boom"); })).rejects.toThrow("boom");
  });

  it("preserves order within a limit of 1 (serial)", async () => {
    const lim = createConcurrencyLimiter(1);
    const order: number[] = [];
    await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        lim.run(async () => {
          order.push(i);
          await new Promise((r) => setTimeout(r, 5));
        }),
      ),
    );
    expect(order).toEqual([0, 1, 2, 3, 4]);
  });

  it("clamps an invalid max (0/negative) to 1", async () => {
    const lim = createConcurrencyLimiter(0);
    expect(await lim.run(async () => 42)).toBe(42);
    const lim2 = createConcurrencyLimiter(-5);
    let peak = 0;
    let active = 0;
    const task = async () => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 5));
      active--;
    };
    await Promise.all(Array.from({ length: 4 }, () => lim2.run(task)));
    expect(peak).toBe(1);
  });

  it("preserves FIFO order across the queue", async () => {
    const lim = createConcurrencyLimiter(1);
    const order: number[] = [];
    // Start one slow task to occupy the slot, then enqueue 4 more.
    const slow = lim.run(async () => {
      order.push(0);
      await new Promise((r) => setTimeout(r, 20));
    });
    // Give the slow task a tick to actually start.
    await new Promise((r) => setTimeout(r, 1));
    const queued = Array.from({ length: 4 }, (_, i) =>
      lim.run(async () => {
        order.push(i + 1);
        await new Promise((r) => setTimeout(r, 1));
      }),
    );
    await slow;
    await Promise.all(queued);
    // The slow task is first; the queued tasks run in enqueue order.
    expect(order).toEqual([0, 1, 2, 3, 4]);
    expect(lim.waiting).toBe(0);
  });

  it("reports the waiting count while callers queue up", async () => {
    const lim = createConcurrencyLimiter(1);
    let release: (() => void) | null = null;
    const blocker = lim.run(
      () => new Promise<void>((r) => { release = r; }),
    );
    // Give blocker a tick so it occupies the slot.
    await new Promise((r) => setTimeout(r, 1));
    expect(lim.active).toBe(1);
    expect(lim.waiting).toBe(0);

    const queued: Array<Promise<unknown>> = [];
    queued.push(lim.run(async () => "a"));
    queued.push(lim.run(async () => "b"));
    queued.push(lim.run(async () => "c"));
    expect(lim.waiting).toBe(3);

    release!();
    const results = await Promise.all(queued);
    expect(results).toEqual(["a", "b", "c"]);
    expect(lim.active).toBe(0);
    expect(lim.waiting).toBe(0);
    await blocker;
  });

  it("a rejection releases the slot and does not poison subsequent runs", async () => {
    const lim = createConcurrencyLimiter(1);
    await expect(lim.run(async () => { throw new Error("nope"); })).rejects.toThrow("nope");
    // After the rejection, active should drop back to 0 and a fresh
    // task should run immediately.
    expect(lim.active).toBe(0);
    const order: string[] = [];
    await Promise.all([
      lim.run(async () => { order.push("after-fail"); }),
      lim.run(async () => { order.push("parallel"); }),
    ]);
    expect(order.sort()).toEqual(["after-fail", "parallel"]);
  });
});
