import { describe, it, expect } from "vitest";
import { parseAcceptLanguage, createServerI18n } from "./server-i18n";

describe("parseAcceptLanguage", () => {
  it("returns default locale for empty header", () => {
    expect(parseAcceptLanguage("")).toBe("en");
    expect(parseAcceptLanguage(null)).toBe("en");
    expect(parseAcceptLanguage(undefined)).toBe("en");
  });

  it("matches exact locale", () => {
    expect(parseAcceptLanguage("zh-CN")).toBe("zh-CN");
    expect(parseAcceptLanguage("ja")).toBe("ja");
    expect(parseAcceptLanguage("en")).toBe("en");
  });

  it("matches by prefix", () => {
    expect(parseAcceptLanguage("zh-TW")).toBe("zh-CN");
    expect(parseAcceptLanguage("zh-Hans")).toBe("zh-CN");
    expect(parseAcceptLanguage("en-US")).toBe("en");
    expect(parseAcceptLanguage("en-GB")).toBe("en");
    expect(parseAcceptLanguage("ja-JP")).toBe("ja");
  });

  it("respects quality values", () => {
    expect(parseAcceptLanguage("en;q=0.8, ja;q=1.0")).toBe("ja");
    expect(parseAcceptLanguage("zh-CN;q=0.5, en;q=0.9")).toBe("en");
  });

  it("falls back to default for unknown languages", () => {
    expect(parseAcceptLanguage("fr")).toBe("en");
    expect(parseAcceptLanguage("de-DE")).toBe("en");
  });

  it("handles complex Accept-Language headers", () => {
    const header = "en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7,ja;q=0.6";
    expect(parseAcceptLanguage(header)).toBe("en");
  });
});

describe("createServerI18n", () => {
  it("detects locale from Request headers", () => {
    const req = new Request("http://localhost/", {
      headers: { "Accept-Language": "zh-CN" },
    });
    const i18n = createServerI18n(req);
    expect(i18n.locale).toBe("zh-CN");
    expect(i18n.t("query.submit", "Start Research")).toBe("开始调研");
  });

  it("detects locale from Headers object", () => {
    const headers = new Headers({ "Accept-Language": "ja" });
    const i18n = createServerI18n(headers);
    expect(i18n.locale).toBe("ja");
  });

  it("formats with interpolation", () => {
    const req = new Request("http://localhost/", {
      headers: { "Accept-Language": "zh-CN" },
    });
    const i18n = createServerI18n(req);
    const result = i18n.fmt("api.queryTooShort", { min: 3 }, "min 3 chars");
    expect(result).toContain("3");
  });

  it("falls back to default locale for unknown language", () => {
    const req = new Request("http://localhost/", {
      headers: { "Accept-Language": "fr" },
    });
    const i18n = createServerI18n(req);
    expect(i18n.locale).toBe("en");
  });

  it("handles Next 16 HeadersAdapter shape (own 'headers' prop but .get() on the object)", () => {
    // Next 16's ReadonlyHeaders (from `await headers()`) is a Headers subclass
    // whose constructor sets `this.headers = <Proxy of plain object>`. That
    // makes the naive `"headers" in x` duck-type misfire. Our extractHeaders
    // must pick `.get()` over `.headers` and NOT crash with `.get is not a function`.
    const underlying = { "accept-language": "ja" };
    const headersLike = {
      headers: underlying, // misleading own property
      get(name: string) {
        return (underlying as Record<string, string>)[name.toLowerCase()] ?? null;
      },
    } as unknown as Headers;
    const i18n = createServerI18n(headersLike);
    expect(i18n.locale).toBe("ja");
    expect(i18n.t("query.submit", "Start Research")).toBe("リサーチ開始");
  });

  it("handles a Request-like object that is not instanceof Request", () => {
    // Pure duck-typed Request shape (no prototype chain link to Request).
    const inner = new Headers({ "Accept-Language": "zh-CN" });
    const reqLike = { headers: inner, url: "/x", method: "GET" } as unknown as Request;
    const i18n = createServerI18n(reqLike);
    expect(i18n.locale).toBe("zh-CN");
  });
});
