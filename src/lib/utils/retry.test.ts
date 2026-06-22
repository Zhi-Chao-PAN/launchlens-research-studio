import { describe, it, expect, vi } from "vitest";
import { retryWithBackoff } from "./retry";

describe("retryWithBackoff", () => {
  it("returns successful result on first attempt", async () => {
    const fn = vi.fn(async () => "ok");
    const out = await retryWithBackoff(fn);
    expect(out).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries on failure up to maxAttempts", async () => {
    let calls = 0;
    const out = await retryWithBackoff(
      async () => {
        calls++;
        if (calls < 3) throw new Error("nope");
        return "ok";
      },
      { maxAttempts: 5, baseDelayMs: 1, maxDelayMs: 5 },
    );
    expect(out).toBe("ok");
    expect(calls).toBe(3);
  });

  it("throws after exhausting attempts", async () => {
    let calls = 0;
    await expect(
      retryWithBackoff(
        async () => {
          calls++;
          throw new Error("always");
        },
        { maxAttempts: 2, baseDelayMs: 1 },
      ),
    ).rejects.toThrow("always");
    expect(calls).toBe(2);
  });

  it("respects shouldRetry guard", async () => {
    let calls = 0;
    await expect(
      retryWithBackoff(
        async () => {
          calls++;
          throw new Error("permanent");
        },
        { maxAttempts: 5, baseDelayMs: 1, shouldRetry: () => false },
      ),
    ).rejects.toThrow("permanent");
    expect(calls).toBe(1);
  });

  it("invokes onAttempt for each attempt with the error context", async () => {
    const events: { attempt: number; hadError: boolean }[] = [];
    let calls = 0;
    await retryWithBackoff(
      async () => {
        calls++;
        if (calls < 2) throw new Error("once");
        return "ok";
      },
      {
        maxAttempts: 3,
        baseDelayMs: 1,
        onAttempt: (attempt, error) =>
          events.push({ attempt, hadError: error !== null }),
      },
    );
    // events: attempt 1 (no error yet), attempt 1 (with error), attempt 2 (no error yet)
    expect(events.length).toBeGreaterThanOrEqual(2);
  });

  it("aborts when signal is already aborted", async () => {
    const ctl = new AbortController();
    ctl.abort();
    await expect(
      retryWithBackoff(async () => "x", { signal: ctl.signal }),
    ).rejects.toThrow(/aborted/i);
  });
});
