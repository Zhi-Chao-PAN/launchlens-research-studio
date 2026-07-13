import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { middleware, safeEqual } from "./middleware";

type NextRequestInit = ConstructorParameters<typeof NextRequest>[1];

function makeRequest(path: string, init: NextRequestInit = {}) {
  return new NextRequest(`https://launchlens.test${path}`, init);
}

describe("safeEqual", () => {
  it("returns true for identical strings", () => {
    expect(safeEqual("abc123", "abc123")).toBe(true);
  });

  it("returns true for empty strings", () => {
    expect(safeEqual("", "")).toBe(true);
  });

  it("returns false for different lengths", () => {
    expect(safeEqual("abc", "abcd")).toBe(false);
    expect(safeEqual("abcd", "abc")).toBe(false);
  });

  it("returns false for a single-character difference", () => {
    expect(safeEqual("abc123", "abc124")).toBe(false);
    // First character differs — exercises the early-iteration branch.
    expect(safeEqual("xbc123", "abc123")).toBe(false);
    // Last character differs — exercises the late-iteration branch.
    expect(safeEqual("abc12x", "abc123")).toBe(false);
  });

  it("returns false when every character differs", () => {
    expect(safeEqual("aaaaaa", "bbbbbb")).toBe(false);
  });

  it("returns false for case differences", () => {
    // Base64 tokens are case-sensitive, so 'A' !== 'a'.
    expect(safeEqual("Abc123", "abc123")).toBe(false);
  });

  it("handles base64-style tokens", () => {
    // Realistic shape — 32 bytes encoded to base64url = ~43 chars.
    const tok = "abcDEF123_-XYZdef456_-abcDEF123_-XYZdef456_-";
    expect(safeEqual(tok, tok)).toBe(true);
    expect(safeEqual(tok, tok.replace(/a/, "A"))).toBe(false);
  });
});

describe("middleware CSRF exemptions", () => {
  it("allows the web-vitals beacon endpoint without a CSRF header", () => {
    const response = middleware(makeRequest("/api/vitals", { method: "POST" }));

    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("lets the exact cron endpoint reach its route-level shared-secret verifier", () => {
    const response = middleware(makeRequest("/api/cron/scheduler", {
      method: "POST",
      headers: { "x-cron-secret": "candidate-secret" },
    }));

    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("still rejects non-exempt mutating API requests without CSRF in strict mode", async () => {
    const previousStrict = process.env.LAUNCHLENS_CSRF_STRICT;
    process.env.LAUNCHLENS_CSRF_STRICT = "1";
    try {
      const response = middleware(makeRequest("/api/research", { method: "POST" }));

      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toMatchObject({
        error: "csrf_failed",
        reason: "missing-csrf",
      });
    } finally {
      if (previousStrict === undefined) delete process.env.LAUNCHLENS_CSRF_STRICT;
      else process.env.LAUNCHLENS_CSRF_STRICT = previousStrict;
    }
  });
});
