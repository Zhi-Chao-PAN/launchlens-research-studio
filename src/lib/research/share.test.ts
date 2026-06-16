import { describe, it, expect, beforeEach } from "vitest";

beforeEach(() => {
  // jsdom doesn't provide window.location.hash, set up minimal mock
  (globalThis as any).window = globalThis.window || {
    location: { origin: "https://example.com", pathname: "/", search: "", hash: "" },
  };
});

import { buildShareUrl, parseSessionFromHash, clearHash } from "@/lib/research/share";

describe("buildShareUrl", () => {
  it("returns empty string on server (no window)", () => {
    const origWindow = (globalThis as any).window;
    (globalThis as any).window = undefined;
    const url = buildShareUrl("abc123");
    expect(url).toBe("");
    (globalThis as any).window = origWindow;
  });

  it("builds URL with #share: prefix", () => {
    const url = buildShareUrl("abc123");
    expect(url).toContain("#share:abc123");
  });
});

describe("parseSessionFromHash", () => {
  it("returns null for empty hash", () => {
    expect(parseSessionFromHash("")).toBe(null);
  });

  it("returns null for non-share hash", () => {
    expect(parseSessionFromHash("#section")).toBe(null);
  });

  it("parses share:sessionId hash", () => {
    expect(parseSessionFromHash("#share:abc123")).toBe("abc123");
  });

  it("strips leading #", () => {
    expect(parseSessionFromHash("share:abc123")).toBe("abc123");
  });

  it("rejects invalid session id characters", () => {
    expect(parseSessionFromHash("#share:abc!@#")).toBe(null);
  });

  it("rejects empty session id", () => {
    expect(parseSessionFromHash("#share:")).toBe(null);
  });
});

describe("clearHash", () => {
  it("does not throw without window", () => {
    const origWindow = (globalThis as any).window;
    (globalThis as any).window = undefined;
    expect(() => clearHash()).not.toThrow();
    (globalThis as any).window = origWindow;
  });
});
