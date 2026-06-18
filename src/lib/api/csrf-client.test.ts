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
