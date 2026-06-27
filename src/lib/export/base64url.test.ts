import { describe, it, expect } from "vitest";
import { encodeBase64UrlUtf8, briefHashFor, BRIEF_HASH_PREFIX } from "./base64url";

// Symmetric decoder, mirrors launchlens-ai's decodeBase64UrlUtf8.
// We re-decode here to assert round-trip behavior of our encoder —
// any drift from the canonical decoder would be caught.
function decodeBase64UrlUtf8(value: string): string {
  const normalized = decodeURIComponent(value.trim())
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const padding = normalized.length % 4;
  const padded =
    padding === 0 ? normalized : normalized + "=".repeat(4 - padding);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

describe("encodeBase64UrlUtf8", () => {
  it("round-trips ASCII", () => {
    const encoded = encodeBase64UrlUtf8("hello world");
    expect(encoded).not.toMatch(/[+/=]/);
    expect(decodeBase64UrlUtf8(encoded)).toBe("hello world");
  });

  it("round-trips Chinese characters (UTF-8)", () => {
    const input = "中文测试 brief 含 UTF-8 字符";
    const encoded = encodeBase64UrlUtf8(input);
    expect(encoded).not.toMatch(/[+/=]/);
    expect(decodeBase64UrlUtf8(encoded)).toBe(input);
  });

  it("round-trips JSON with CJK + emoji + escapes", () => {
    const json = JSON.stringify({
      idea: "面向中国创业者的 GTM 工具 — ¥/$ pricing, 🚀 launch",
      audience: "Founders 在 SEA market",
      meta: { opportunityScore: 87, emoji: "🎯" },
    });
    const encoded = encodeBase64UrlUtf8(json);
    expect(encoded).not.toMatch(/[+/=]/);
    expect(decodeBase64UrlUtf8(encoded)).toBe(json);
  });

  it("produces a URL-safe alphabet (no + / =)", () => {
    const input = "subject\n+species/value?query=1&x=2";
    const encoded = encodeBase64UrlUtf8(input);
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeBase64UrlUtf8(encoded)).toBe(input);
  });

  it("produces no padding (= is stripped)", () => {
    // The exact length that yields padding in standard base64 — 1 byte
    // input produces "AA==" in standard b64, so encoded must be "AA".
    const encoded = encodeBase64UrlUtf8("a");
    expect(encoded).not.toMatch(/=/);
    expect(decodeBase64UrlUtf8(encoded)).toBe("a");
  });

  it("handles empty string", () => {
    expect(encodeBase64UrlUtf8("")).toBe("");
    expect(decodeBase64UrlUtf8("")).toBe("");
  });

  it("throws on non-string input", () => {
    // @ts-expect-error - intentional bad input
    expect(() => encodeBase64UrlUtf8(null)).toThrow(TypeError);
    // @ts-expect-error - intentional bad input
    expect(() => encodeBase64UrlUtf8(42)).toThrow(TypeError);
  });
});

describe("briefHashFor", () => {
  it("prepends the canonical #brief= prefix", () => {
    expect(briefHashFor("{}")).toBe(BRIEF_HASH_PREFIX + encodeBase64UrlUtf8("{}"));
    expect(BRIEF_HASH_PREFIX).toBe("#brief=");
  });

  it("round-trips a real brief envelope (Chinese)", () => {
    const envelope = JSON.stringify({
      schemaVersion: "1.0.0",
      source: "launchlens-research-studio",
      exportedAt: new Date().toISOString(),
      sessionId: "abcdef123",
      query: "咖啡订阅服务 — 面向 Z 世代",
      input: {
        idea: "为城市 Z 世代提供每周送达的精品咖啡订阅",
        audience: "22-30 岁都市白领、月可支配收入 ≥ 5000 元",
        market: "中国精品咖啡市场 TAM ¥120B, 年增长 18%",
        tone: "Practical, crisp, and founder-friendly",
        constraints: "首期 SKU ≤ 6 款;首月不补贴",
      },
      meta: {
        opportunityScore: 78,
        riskScore: 35,
        completedAgents: ["market-sizer", "competitor-analyst"],
        truncated: [],
      },
    });
    const hash = briefHashFor(envelope);
    expect(hash.startsWith("#brief=")).toBe(true);
    const decoded = decodeBase64UrlUtf8(hash.slice("#brief=".length));
    expect(JSON.parse(decoded)).toEqual(JSON.parse(envelope));
  });
});
