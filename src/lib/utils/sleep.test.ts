import { describe, it, expect } from "vitest";
import { sleep } from "./sleep";

describe("sleep", () => {
  it("resolves after roughly the requested delay", async () => {
    const t0 = Date.now();
    await sleep(20);
    const elapsed = Date.now() - t0;
    expect(elapsed).toBeGreaterThanOrEqual(15);
  });

  it("rejects with AbortError when aborted before firing", async () => {
    const ac = new AbortController();
    const p = sleep(500, { signal: ac.signal });
    ac.abort();
    await expect(p).rejects.toThrow(/aborted/i);
    await expect(p).rejects.toBeInstanceOf(DOMException);
  });

  it("rejects immediately when signal is already aborted", async () => {
    const ac = new AbortController();
    ac.abort();
    const t0 = Date.now();
    await expect(sleep(500, ac.signal)).rejects.toThrow(/aborted/i);
    expect(Date.now() - t0).toBeLessThan(50);
  });

  it("resolves normally when no signal is given", async () => {
    await expect(sleep(5)).resolves.toBeUndefined();
  });
});
