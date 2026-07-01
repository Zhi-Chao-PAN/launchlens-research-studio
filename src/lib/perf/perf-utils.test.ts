import { describe, it, expect, vi } from "vitest";
import { bucketProgress, debounceRaf, PROGRESS_BUCKETS } from "./perf-utils";

type RafSpy = {
  callbacks: FrameRequestCallback[];
  schedule: (cb: FrameRequestCallback) => number;
  reset: () => void;
};

function makeRafSpy(): RafSpy {
  const callbacks: FrameRequestCallback[] = [];
  let counter = 0;
  return {
    callbacks,
    schedule: (cb: FrameRequestCallback): number => {
      callbacks.push(cb);
      counter += 1;
      return counter;
    },
    reset: () => {
      callbacks.length = 0;
    },
  };
}

function installRafStub(spy: RafSpy): () => void {
  const orig = globalThis.requestAnimationFrame;
  const stub: typeof requestAnimationFrame = ((cb: FrameRequestCallback): number =>
    spy.schedule(cb)) as typeof requestAnimationFrame;
  (globalThis as { requestAnimationFrame: typeof requestAnimationFrame }).requestAnimationFrame = stub;
  return () => {
    (globalThis as { requestAnimationFrame: typeof requestAnimationFrame }).requestAnimationFrame = orig;
  };
}

describe("bucketProgress", () => {
  it("returns 0 for non-finite input", () => {
    expect(bucketProgress(NaN)).toBe(0);
    expect(bucketProgress(-Infinity)).toBe(0);
    expect(bucketProgress(Infinity)).toBe(100);
  });
  it("clamps below zero", () => {
    expect(bucketProgress(-50)).toBe(0);
  });
  it("clamps above one hundred", () => {
    expect(bucketProgress(250)).toBe(100);
  });
  it("snaps to nearest bucket", () => {
    expect(bucketProgress(7)).toBe(10);
    expect(bucketProgress(33)).toBe(40);
    expect(bucketProgress(63)).toBe(70);
    expect(bucketProgress(78)).toBe(85);
  });
  it("only returns values from the bucket list", () => {
    for (let i = 0; i <= 100; i++) {
      const b = bucketProgress(i);
      expect(PROGRESS_BUCKETS).toContain(b);
    }
  });
  it("breaks ties in favor of the earlier (smaller) bucket", () => {
    // 5 is equidistant from 0 and 10; the implementation uses < (strict)
    // so 0 wins. Document that so a refactor that flips to <= would be
    // caught as a behaviour change.
    expect(bucketProgress(5)).toBe(0);
  });
});

describe("debounceRaf", () => {
  it("coalesces multiple calls into one invocation per animation frame", () => {
    const spy = makeRafSpy();
    const restore = installRafStub(spy);
    try {
      const fn = vi.fn();
      const debounced = debounceRaf(fn);
      debounced("a");
      debounced("b");
      debounced("c");
      expect(fn).not.toHaveBeenCalled();
      const pending = spy.callbacks.splice(0);
      pending.forEach((cb) => cb(performance.now()));
      expect(fn).toHaveBeenCalledTimes(1);
      expect(fn).toHaveBeenCalledWith("c");
    } finally {
      restore();
    }
  });

  it("schedules a fresh frame after a previous one fires", () => {
    const spy = makeRafSpy();
    const restore = installRafStub(spy);
    try {
      const fn = vi.fn();
      const debounced = debounceRaf(fn);
      debounced("first");
      spy.callbacks.splice(0).forEach((cb) => cb(performance.now()));
      expect(fn).toHaveBeenCalledTimes(1);
      debounced("second");
      expect(spy.callbacks.length).toBe(1);
      spy.callbacks.splice(0).forEach((cb) => cb(performance.now()));
      expect(fn).toHaveBeenCalledTimes(2);
      expect(fn).toHaveBeenLastCalledWith("second");
    } finally {
      restore();
    }
  });

  it("falls back to setTimeout when requestAnimationFrame is unavailable", () => {
    const orig = globalThis.requestAnimationFrame;
    // Simulate a non-browser environment by removing the API.
    delete (globalThis as { requestAnimationFrame?: typeof requestAnimationFrame }).requestAnimationFrame;
    try {
      const fn = vi.fn();
      const debounced = debounceRaf(fn);
      debounced("payload");
      // The fallback uses setTimeout(~16ms), so we wait long enough for
      // the timer to fire. 50ms is safely above the 16ms fallback.
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          expect(fn).toHaveBeenCalledWith("payload");
          resolve();
        }, 50);
      });
    } finally {
      (globalThis as { requestAnimationFrame: typeof requestAnimationFrame }).requestAnimationFrame = orig;
    }
  });
});
