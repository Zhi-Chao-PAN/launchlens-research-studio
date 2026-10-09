import { describe, it, expect } from "vitest";
import {
  parseApiErrorResponse,
  networkError,
  wrapThrownError,
  type StructuredApiError,
} from "@/lib/api/error-codes";

function mockResponse(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): Response {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

describe("parseApiErrorResponse", () => {
  it("parses RATE_LIMITED with Retry-After header", async () => {
    const res = mockResponse(
      429,
      { error: "Slow down", code: "RATE_LIMITED", resetMs: 6000 },
      { "Retry-After": "6", "X-RateLimit-Remaining": "0" },
    );
    const err = await parseApiErrorResponse(res);
    expect(err.code).toBe("RATE_LIMITED");
    expect(err.field).toBe("general");
    expect(err.retryAfterSeconds).toBe(6);
    expect(err.message).toBe("Slow down");
  });

  it("falls back to resetMs when Retry-After header is missing", async () => {
    const res = mockResponse(429, { error: "Slow", code: "RATE_LIMITED", resetMs: 4200 });
    const err = await parseApiErrorResponse(res);
    expect(err.retryAfterSeconds).toBe(5); // ceil(4200/1000)
  });

  it("maps QUERY_TOO_SHORT to query field and preserves details", async () => {
    const res = mockResponse(400, {
      error: "Query too short",
      code: "QUERY_TOO_SHORT",
      field: "query",
      details: "Got 1 characters.",
    });
    const err = await parseApiErrorResponse(res);
    expect(err.code).toBe("QUERY_TOO_SHORT");
    expect(err.field).toBe("query");
    expect(err.details).toBe("Got 1 characters.");
  });

  it("maps KEYWORDS_TOO_MANY to keywords field", async () => {
    const res = mockResponse(400, {
      error: "Too many keywords",
      code: "KEYWORDS_TOO_MANY",
      field: "keywords",
    });
    const err = await parseApiErrorResponse(res);
    expect(err.field).toBe("keywords");
    expect(err.code).toBe("KEYWORDS_TOO_MANY");
  });

  it("maps 405 to METHOD_NOT_ALLOWED even without code field", async () => {
    const res = mockResponse(405, { error: "Use POST" });
    const err = await parseApiErrorResponse(res);
    expect(err.code).toBe("METHOD_NOT_ALLOWED");
    expect(err.field).toBe("general");
  });

  it("maps 500 to INTERNAL_ERROR", async () => {
    const res = mockResponse(500, { error: "boom" });
    const err = await parseApiErrorResponse(res);
    expect(err.code).toBe("INTERNAL_ERROR");
  });

  it("handles non-JSON body gracefully", async () => {
    const res = new Response("<html>Bad Gateway</html>", {
      status: 502,
      statusText: "Bad Gateway",
      headers: { "Content-Type": "text/html" },
    });
    const err = await parseApiErrorResponse(res);
    expect(err.code).toBe("INTERNAL_ERROR");
    expect(err.message).toMatch(/502|Bad Gateway/);
  });

  it("gracefully handles completely empty 400", async () => {
    const res = mockResponse(400, {});
    const err = await parseApiErrorResponse(res);
    expect(err.code).toBe("VALIDATION_ERROR");
    expect(err.field).toBe("general");
  });

  it("clamps negative/zero retryAfter to at least 1 when using resetMs", async () => {
    // resetMs of 0 should not produce a 0 retryAfterSeconds that immediately
    // looks "ready"; wait at least 1 second tick.
    const res = mockResponse(429, { code: "RATE_LIMITED", error: "wait", resetMs: 0 });
    const err = await parseApiErrorResponse(res);
    expect(err.retryAfterSeconds).toBe(1);
  });
});

describe("networkError", () => {
  it("returns NETWORK_ERROR code on general field", () => {
    const err = networkError();
    expect(err.code).toBe("NETWORK_ERROR");
    expect(err.field).toBe("general");
    expect(err.message).toMatch(/Network/i);
  });

  it("accepts a custom message", () => {
    const err = networkError("Offline");
    expect(err.message).toBe("Offline");
  });
});

describe("wrapThrownError", () => {
  it("converts TypeError to networkError", () => {
    const err = wrapThrownError(new TypeError("Failed to fetch"));
    expect(err.code).toBe("NETWORK_ERROR");
  });

  it("preserves Error message", () => {
    const err = wrapThrownError(new Error("kaboom"));
    expect(err.code).toBe("UNKNOWN");
    expect(err.message).toBe("kaboom");
  });

  it("handles non-Error throws", () => {
    const err = wrapThrownError("string throw");
    expect(err.code).toBe("UNKNOWN");
    expect(err.message).toMatch(/unexpected/i);
  });

  it("StructuredApiError shape is frozen (type-level compile check)", () => {
    // A compile-time-only check: ensures all discriminated fields exist.
    const e: StructuredApiError = {
      code: "INVALID_JSON",
      field: "general",
      message: "x",
    };
    expect(e.code).toBe("INVALID_JSON");
  });
});
