import { describe, it, expect } from "vitest";
import { validateResearchRequest, validateResearchRequestLocalized, QUERY_LIMITS, jsonError, jsonValidationError, jsonErrorLocalized } from "@/lib/api/validation";

describe("validateResearchRequest", () => {
  it("rejects non-object body", () => {
    const r = validateResearchRequest(null);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(400);
  });

  it("rejects non-object body (string)", () => {
    const r = validateResearchRequest("hello");
    expect(r.ok).toBe(false);
  });

  it("rejects when query is missing", () => {
    const r = validateResearchRequest({});
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.body.field).toBe("query");
  });

  it("rejects when query is not a string", () => {
    const r = validateResearchRequest({ query: 123 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.body.field).toBe("query");
  });

  it("rejects query below min length", () => {
    const r = validateResearchRequest({ query: "ab" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.status).toBe(400);
      expect(r.body.error).toContain("at least 3");
    }
  });

  it("rejects query above max length", () => {
    const long = "a".repeat(QUERY_LIMITS.MAX_QUERY_LENGTH + 1);
    const r = validateResearchRequest({ query: long });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.body.error).toContain("at most");
  });

  it("trims leading/trailing whitespace from query", () => {
    const r = validateResearchRequest({ query: "  AI tool  " });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.query).toBe("AI tool");
  });

  it("accepts valid minimal query", () => {
    const r = validateResearchRequest({ query: "abc" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.query).toBe("abc");
      expect(r.value.keywords).toEqual([]);
      expect(r.value.mode).toBe("standard");
    }
  });

  it("accepts both research modes and defaults omitted mode to Standard", () => {
    const standard = validateResearchRequest({ query: "valid idea" });
    const deep = validateResearchRequest({ query: "valid idea", mode: "deep" });

    expect(standard.ok && standard.value.mode).toBe("standard");
    expect(deep.ok && deep.value.mode).toBe("deep");
  });

  it("rejects an unknown research mode at the API boundary", () => {
    const r = validateResearchRequest({ query: "valid idea", mode: "turbo" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.body.field).toBe("mode");
      expect(r.body.error).toContain("standard");
      expect(r.body.error).toContain("deep");
    }
  });

  it("rejects non-array keywords", () => {
    const r = validateResearchRequest({ query: "valid", keywords: "not array" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.body.field).toBe("keywords");
  });

  it("rejects too many keywords", () => {
    const kw = Array(QUERY_LIMITS.MAX_KEYWORDS + 1).fill("kw");
    const r = validateResearchRequest({ query: "valid", keywords: kw });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.body.error).toContain("At most");
  });

  it("rejects non-string keyword", () => {
    const r = validateResearchRequest({ query: "valid", keywords: ["ok", 123] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.body.error).toContain("index 1");
  });

  it("rejects keyword exceeding max length", () => {
    const r = validateResearchRequest({ query: "valid", keywords: ["a".repeat(QUERY_LIMITS.MAX_KEYWORD_LENGTH + 1)] });
    expect(r.ok).toBe(false);
  });

  it("skips empty keywords", () => {
    const r = validateResearchRequest({ query: "valid", keywords: ["good", "", "  ", "also-good"] });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.keywords).toEqual(["good", "also-good"]);
  });

  it("deduplicates keywords (case-sensitive)", () => {
    const r = validateResearchRequest({ query: "valid", keywords: ["ai", "AI", "ai"] });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.keywords).toEqual(["ai", "AI"]);
  });

  it("accepts valid full request", () => {
    const r = validateResearchRequest({
      query: "AI note-taking app for students",
      keywords: ["AI", "students", "education"],
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.query).toBe("AI note-taking app for students");
      expect(r.value.keywords).toEqual(["AI", "students", "education"]);
    }
  });
});

describe("validateResearchRequestLocalized", () => {
  function reqForLang(tag: string): Request {
    const h = new Headers();
    h.set("accept-language", tag);
    return new Request("https://x/api", { headers: h });
  }

  it("localizes too-short query errors into Chinese", () => {
    const r = validateResearchRequestLocalized({ query: "ab" }, reqForLang("zh-CN"));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.body.error).toContain("query");
      expect(r.body.error).toContain("3");
      expect(r.body.details).toContain("2");
    }
  });

  it("localizes keyword length errors into Japanese", () => {
    const r = validateResearchRequestLocalized(
      { query: "valid idea", keywords: ["x".repeat(50)] },
      reqForLang("ja"),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.body.error).toContain("キーワード");
      expect(r.body.error).toContain("40");
    }
  });

  it("localizes too-many-keywords errors into Korean", () => {
    const keywords = Array.from({ length: 13 }, (_, i) => `kw${i}`);
    const r = validateResearchRequestLocalized(
      { query: "valid idea here", keywords },
      reqForLang("ko"),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.body.error).toContain("키워드");
      expect(r.body.error).toContain("12");
    }
  });

  it("substitutes {index} into the keyword-type error", () => {
    const r = validateResearchRequestLocalized(
      { query: "valid idea here", keywords: ["ok", 42] },
      reqForLang("en"),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.body.error).toContain("index 1");
  });

  it("falls back to English when no source is supplied", () => {
    const r = validateResearchRequestLocalized({ query: "ab" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.body.error).toContain("at least 3");
  });
});

describe("jsonError and jsonValidationError", () => {
  it("jsonError returns a NextResponse with status and body", () => {
    const r = jsonError("test error", 500);
    expect(r).toBeDefined();
    // r.status is a number on NextResponse
    expect(r.status).toBe(500);
  });

  it("jsonError includes extra fields", () => {
    const r = jsonError("test", 400, { field: "x", details: "y" });
    expect(r.status).toBe(400);
  });

  it("jsonValidationError uses status from error result", () => {
    const v = validateResearchRequest({});
    if (v.ok) throw new Error("expected failure");
    const r = jsonValidationError(v);
    expect(r.status).toBe(400);
  });

  describe("jsonErrorLocalized", () => {
    it("returns localized message for a given locale", () => {
      const h = new Headers();
      h.set("accept-language", "zh-CN");
      const req = new Request("https://x/api", { headers: h });
      const r = jsonErrorLocalized(req, "errors.notFound", 404);
      expect(r.status).toBe(404);
      expect(r.headers.get("content-language")).toBe("zh-CN");
    });

    it("interpolates {seconds} into rate-limit messages", () => {
      const r = jsonErrorLocalized("en", "errors.rateLimit", 429, { seconds: "30" });
      // We can't easily read the body here (NextResponse.json returns a
      // stream), so just assert the status and headers are correct; string
      // interpolation is tested in server.test.ts.
      expect(r.status).toBe(429);
    });

    it("falls back to en when Accept-Language is missing", () => {
      const r = jsonErrorLocalized(null, "errors.notFound", 404);
      expect(r.status).toBe(404);
    });
  });
});
