import { describe, it, expect } from "vitest";
import {
  normalizeMethod, isCsrfSafeMethod, withCsrfHeader, isValidFetchUrl,
  buildCsrfInit, csrfErrorMessage, CSRF_HEADER, CSRF_SAFE_METHODS,
} from "@/lib/api/csrf-client";

describe("csrf-client pure helpers (round 165)", () => {
  it("normalizeMethod uppercases and defaults to GET", () => {
    expect(normalizeMethod("post")).toBe("POST");
    expect(normalizeMethod("  get  ")).toBe("GET");
    expect(normalizeMethod(undefined)).toBe("GET");
    expect(normalizeMethod("<script>")).toBe("GET");
  });

  it("isCsrfSafeMethod classifies correctly", () => {
    for (const m of CSRF_SAFE_METHODS) expect(isCsrfSafeMethod(m)).toBe(true);
    expect(isCsrfSafeMethod("post")).toBe(false);
    expect(isCsrfSafeMethod("DELETE")).toBe(false);
  });

  it("withCsrfHeader merges headers and respects existing", () => {
    const a = withCsrfHeader({ "Content-Type": "application/json" }, "tok1");
    expect(a[CSRF_HEADER]).toBe("tok1");
    expect(a["Content-Type"]).toBe("application/json");

    // user-provided CSRF header wins
    const b = withCsrfHeader({ [CSRF_HEADER]: "mine" }, "tok1");
    expect(b[CSRF_HEADER]).toBe("mine");

    // null token does not add header
    const c = withCsrfHeader({}, null);
    expect(c[CSRF_HEADER]).toBeUndefined();

    // supports Headers instance
    const h = new Headers({ "X-Foo": "bar" });
    const d = withCsrfHeader(h, "t2");
    expect(d[CSRF_HEADER]).toBe("t2");
    expect(d["x-foo"]).toBe("bar");
  });

  it("isValidFetchUrl rejects bad schemes", () => {
    expect(isValidFetchUrl("/api/x")).toBe(true);
    expect(isValidFetchUrl("https://example.com/api")).toBe(true);
    expect(isValidFetchUrl("")).toBe(false);
    expect(isValidFetchUrl("javascript:alert(1)")).toBe(false);
    expect(isValidFetchUrl("DATA:text/plain,hi")).toBe(false);
    expect(isValidFetchUrl(null)).toBe(false);
  });

  it("buildCsrfInit attaches token only for unsafe methods", () => {
    const safe = buildCsrfInit({ method: "GET" }, "tok");
    expect((safe.headers as any)[CSRF_HEADER]).toBeUndefined();
    const post = buildCsrfInit({ method: "post" }, "tok");
    expect((post.headers as any)[CSRF_HEADER]).toBe("tok");
    const put = buildCsrfInit({ method: "PUT" }, null);
    expect((put.headers as any)[CSRF_HEADER]).toBeUndefined();
  });

  it("csrfErrorMessage maps TypeError to user-friendly text", () => {
    expect(csrfErrorMessage(new TypeError("Failed to fetch"))).toContain("Network");
    expect(csrfErrorMessage(new Error("boom"))).toBe("boom");
    expect(csrfErrorMessage("oops")).toContain("Unknown");
  });
});

import { parseRateLimit, RateLimitError, fetchWithCsrfStrict } from "@/lib/api/csrf-client";

describe("429 rate-limit helpers (round 183)", () => {
  it("non-429 responses return limited:false", () => {
    const res = new Response(null, { status: 200 });
    expect(parseRateLimit(res).limited).toBe(false);
  });

  it("parses Retry-After in seconds", () => {
    const res = new Response(null, { status: 429, headers: { "retry-after": "30" } });
    const info = parseRateLimit(res);
    expect(info.limited).toBe(true);
    expect(info.retryAfterMs).toBe(30_000);
  });

  it("parses Retry-After as HTTP-date", () => {
    const future = new Date(Date.now() + 5000).toUTCString();
    const res = new Response(null, { status: 429, headers: { "retry-after": future } });
    const info = parseRateLimit(res);
    expect(info.limited).toBe(true);
    expect(info.retryAfterMs).toBeGreaterThanOrEqual(3000);
    expect(info.retryAfterMs).toBeLessThanOrEqual(7000);
  });

  it("defaults to 5s when no Retry-After header", () => {
    const res = new Response(null, { status: 429 });
    expect(parseRateLimit(res).retryAfterMs).toBe(5000);
  });

  it("clamps retryAfter to 60s ceiling", () => {
    const res = new Response(null, { status: 429, headers: { "retry-after": "600" } });
    expect(parseRateLimit(res).retryAfterMs).toBe(60_000);
  });

  it("RateLimitError carries retryAfterMs", () => {
    const e = new RateLimitError("x", 1234);
    expect(e.name).toBe("RateLimitError");
    expect(e.retryAfterMs).toBe(1234);
    expect(e.message).toBe("x");
  });

  it("fetchWithCsrfStrict throws RateLimitError when server returns 429", async () => {
    const origFetch = (globalThis as any).fetch;
    (globalThis as any).fetch = () =>
      Promise.resolve(new Response(JSON.stringify({ error: "rate_limited" }), {
        status: 429,
        headers: { "retry-after": "2" },
      }));
    try {
      await expect(fetchWithCsrfStrict("/x", { method: "POST", throwOnRateLimit: true }))
        .rejects.toBeInstanceOf(RateLimitError);
      const err: any = await fetchWithCsrfStrict("/x", { method: "POST", throwOnRateLimit: true }).catch((e) => e);
      expect(err.retryAfterMs).toBe(2000);
      expect(err.message).toBe("rate_limited");
    } finally {
      (globalThis as any).fetch = origFetch;
    }
  });

  it("fetchWithCsrfStrict without throwOnRateLimit returns 429 response as-is", async () => {
    const origFetch = (globalThis as any).fetch;
    (globalThis as any).fetch = () => Promise.resolve(new Response(null, { status: 429 }));
    try {
      const res = await fetchWithCsrfStrict("/x", { method: "POST" });
      expect(res.status).toBe(429);
    } finally {
      (globalThis as any).fetch = origFetch;
    }
  });
});
