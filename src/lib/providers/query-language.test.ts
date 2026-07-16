import { describe, it, expect } from "vitest";
import { detectQueryLanguage, outputLanguageLabel } from "./query-language";

describe("detectQueryLanguage", () => {
  it("returns 'en' for empty or whitespace-only input", () => {
    expect(detectQueryLanguage("")).toBe("en");
    expect(detectQueryLanguage("   ")).toBe("en");
    expect(detectQueryLanguage(undefined)).toBe("en");
    expect(detectQueryLanguage(null)).toBe("en");
  });

  it("returns 'en' for Latin-only input", () => {
    expect(detectQueryLanguage("Open a bar in Chinese highway service areas")).toBe("en");
    expect(detectQueryLanguage("B2B SaaS for indie founders")).toBe("en");
  });

  it("returns 'zh-CN' for Simplified Chinese input", () => {
    expect(detectQueryLanguage("在中国的高速服务区开酒吧")).toBe("zh-CN");
    expect(detectQueryLanguage("为中国农村星巴克")).toBe("zh-CN");
  });

  it("returns 'ja' for Japanese input (kana present)", () => {
    // Hiragana + kanji + katakana mix is unambiguously Japanese.
    expect(detectQueryLanguage("東京でベジタリアン向けのカフェを開く")).toBe("ja");
    expect(detectQueryLanguage("こんにちは")).toBe("ja");
  });

  it("recognizes conservative Kanji-only Japanese research queries", () => {
    expect(detectQueryLanguage("東京駅前朝食店価格調査")).toBe("ja");
    expect(detectQueryLanguage("日本市場調査")).toBe("ja");
    expect(detectQueryLanguage("调查东京站早餐价格")).toBe("zh-CN");
    expect(detectQueryLanguage("東京市場調查")).toBe("zh-CN");
  });

  it("returns 'ko' for Korean input (Hangul present)", () => {
    expect(detectQueryLanguage("한국的高速服务区에酒吧을 열다")).toBe("ko");
    expect(detectQueryLanguage("안녕하세요")).toBe("ko");
  });

  it("treats English with CJK characters in product names as the CJK language when CJK is dominant", () => {
    // Mixed query where CJK clearly wins.
    expect(detectQueryLanguage("在中国的高速服务区开酒吧 service area bar")).toBe("zh-CN");
  });

  it("returns 'en' for queries with only stray CJK characters (e.g. a name)", () => {
    // One CJK character among 30 Latin → English.
    expect(detectQueryLanguage("Launch a product named 星 for indie founders in 2026")).toBe("en");
  });
});

describe("outputLanguageLabel", () => {
  it("returns a human-readable label for every supported language", () => {
    expect(outputLanguageLabel("en")).toMatch(/English/);
    expect(outputLanguageLabel("zh-CN")).toMatch(/中文/);
    expect(outputLanguageLabel("ja")).toMatch(/日本語/);
    expect(outputLanguageLabel("ko")).toMatch(/한국어/);
  });
});
