import { describe, it, expect } from "vitest";
import { safeEqual } from "./middleware";

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
