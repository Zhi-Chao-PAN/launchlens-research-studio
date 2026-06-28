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
  });
});
