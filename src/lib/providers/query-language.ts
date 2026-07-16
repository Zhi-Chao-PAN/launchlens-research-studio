// Detect the dominant natural language of a user query so LLM agents can
// be told to respond in the same language. The detection is intentionally
// lightweight: a Unicode script check (CJK / Hangul / Hiragana+Katakana) plus
// a short Latin-word frequency hint. We don't need full translation-quality
// detection — just "is the user writing in Chinese, Japanese, Korean, or
// English-default" so the system prompt can include "Respond in <lang>".
//
// This runs in the Node.js server process (no DOM), so the regexes use the
// `u` flag for proper Unicode handling without browser-only APIs.

export type OutputLanguage = "en" | "zh-CN" | "ja" | "ko";

const KANJI_JAPANESE_PLACE_PATTERN = /(?:東京|大阪|京都|日本)/u;
const KANJI_JAPANESE_ORTHOGRAPHY_PATTERN = /(?:駅|価格|調査|競合)/u;

/**
 * Detect the dominant language of a free-text query. Returns "en" when the
 * query is dominantly Latin (or too short to decide), "zh-CN" / "ja" / "ko"
 * for the corresponding CJK ranges. The function never throws; an undecided
 * or empty input returns "en" as a safe default.
 */
export function detectQueryLanguage(text: string | undefined | null): OutputLanguage {
  if (!text) return "en";

  // Count code-point ranges of interest.
  let cjk = 0; // Han (Chinese, shared with ja/ko kanji)
  let hiraganaKatakana = 0; // ja-specific
  let hangul = 0; // ko-specific
  let total = 0;

  for (const ch of text) {
    // Skip whitespace and common punctuation to avoid inflating the denominator.
    if (/\s|[.,;:!?()\[\]"'`/\\-]/.test(ch)) continue;
    const code = ch.codePointAt(0);
    if (code === undefined) continue;
    total++;

    if (code >= 0x3040 && code <= 0x309f) hiraganaKatakana++; // Hiragana
    else if (code >= 0x30a0 && code <= 0x30ff) hiraganaKatakana++; // Katakana
    else if (code >= 0xac00 && code <= 0xd7af) hangul++; // Hangul syllables
    else if (code >= 0x4e00 && code <= 0x9fff) cjk++; // CJK Unified Ideographs
    // Latin A-Z/a-z is counted implicitly by falling through to "en" when
    // no CJK/kana/hangul range dominates; we don't need a counter for it.
  }

  if (total === 0) return "en";

  // Japanese has kana (hiragana+katakana) which Chinese and Korean don't use.
  // Korean has Hangul which Chinese and Japanese don't use. Chinese shares
  // Han ideographs with Japanese kanji, so without kana we call it Chinese.
  if (hiraganaKatakana / total >= 0.1) return "ja";
  if (hangul / total >= 0.1) return "ko";
  if (cjk / total >= 0.2) {
    // Some concise Japanese research queries use Kanji only. Require both a
    // Japanese place spelling and a Japanese-specific business term so
    // ordinary Simplified or Traditional Chinese remains classified as Chinese.
    if (
      KANJI_JAPANESE_PLACE_PATTERN.test(text) &&
      KANJI_JAPANESE_ORTHOGRAPHY_PATTERN.test(text)
    ) {
      return "ja";
    }
    return "zh-CN";
  }
  return "en";
}

/**
 * Human-readable label for the language, used in the system-prompt line and
 * (optionally) surfaced in the UI. Not for translation — we always show
 * the label in the user's locale.
 */
export function outputLanguageLabel(lang: OutputLanguage): string {
  switch (lang) {
    case "zh-CN":
      return "Simplified Chinese (中文)";
    case "ja":
      return "Japanese (日本語)";
    case "ko":
      return "Korean (한국어)";
    case "en":
    default:
      return "English";
  }
}
