import { describe, it, expect } from "vitest";
import { validateResearchRequest, QUERY_LIMITS, jsonError, jsonValidationError } from "@/lib/api/validation";

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
});
