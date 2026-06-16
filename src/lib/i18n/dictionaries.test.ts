import { describe, it, expect } from "vitest";
import { DICTIONARIES, SUPPORTED_LOCALES, translate, DEFAULT_LOCALE } from "./dictionaries";

describe("i18n dictionaries", () => {
  it("default locale is English", () => {
    expect(DEFAULT_LOCALE).toBe("en");
  });
  it("all locales have the same key set", () => {
    const enKeys = Object.keys(DICTIONARIES.en).sort();
    for (const l of SUPPORTED_LOCALES) {
      const keys = Object.keys(DICTIONARIES[l]).sort();
      expect(keys).toEqual(enKeys);
    }
  });
  it("no empty translation strings", () => {
    for (const l of SUPPORTED_LOCALES) {
      for (const [k, v] of Object.entries(DICTIONARIES[l])) {
        expect(v && v.length > 0, l + ":" + k).toBe(true);
      }
    }
  });
  it("translate returns the requested locale", () => {
    expect(translate("zh-CN", "hero.title")).toContain("市场");
    expect(translate("ja", "hero.title")).toContain("市場");
    expect(translate("en", "hero.title")).toContain("Research");
  });
  it("translate falls back to English for unknown keys via fallback param", () => {
    expect(translate("zh-CN", "missing.key" as never, "fallback")).toBe("fallback");
  });
});
