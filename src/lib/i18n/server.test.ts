import { describe, it, expect } from "vitest";
import { createServerI18n } from "./server";

function makeRequest(acceptLanguage?: string): Request {
  const headers = new Headers();
  if (acceptLanguage) headers.set("accept-language", acceptLanguage);
  return new Request("https://example.com/api/test", { headers });
}

describe("createServerI18n", () => {
  it("defaults to en when no Accept-Language is provided", () => {
    const { locale, t } = createServerI18n(null);
    expect(locale).toBe("en");
    expect(t("errors.badRequest")).toContain("Invalid");
  });

  it("picks exact locale match", () => {
    const { locale } = createServerI18n(makeRequest("zh-CN,en;q=0.8"));
    expect(locale).toBe("zh-CN");
  });

  it("picks primary-language match (zh-TW → zh-CN)", () => {
    const { locale } = createServerI18n(makeRequest("zh-TW,en;q=0.5"));
    expect(locale).toBe("zh-CN");
  });

  it("respects q-factor ordering", () => {
    const { locale } = createServerI18n(makeRequest("en;q=0.5,ja;q=0.9"));
    expect(locale).toBe("ja");
  });

  it("falls back to en for unsupported primary languages", () => {
    const { locale } = createServerI18n(makeRequest("fr-FR,fr;q=0.9"));
    expect(locale).toBe("en");
  });

  it("interpolates {seconds} placeholder", () => {
    const { t } = createServerI18n(makeRequest("en"));
    expect(t("errors.rateLimit", { seconds: "42" })).toContain("42");
    expect(t("errors.rateLimit", { seconds: "42" })).toContain("Too many");
  });

  it("returns the same text for the ko locale (rate limit)", () => {
    const { locale, t } = createServerI18n(makeRequest("ko-KR"));
    expect(locale).toBe("ko");
    expect(t("errors.rateLimit", { seconds: "10" })).toContain("10");
  });
});
