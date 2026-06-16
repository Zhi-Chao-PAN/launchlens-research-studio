import { describe, it, expect } from "vitest";
import { bucketProgress, PROGRESS_BUCKETS } from "./perf-utils";

describe("bucketProgress", () => {
  it("returns 0 for non-finite input", () => {
    expect(bucketProgress(NaN)).toBe(0);
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
});
