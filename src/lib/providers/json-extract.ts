import { jsonrepair } from "jsonrepair";

/**
 * Robust extraction of the first valid JSON object from an LLM response.
 *
 * Real models — especially reasoning models (MiniMax-M3, DeepSeek-R1,
 * o1-style) — frequently wrap their JSON in scaffolding that breaks a naive
 * `JSON.parse(text)`:
 *   - `<think>…</think>` reasoning blocks emitted *before* the answer,
 *   - Markdown fences (` ```json … ``` ` or ` ``` … ``` `),
 *   - leading/trailing prose ("Here is the JSON: …"),
 *   - trailing commas or other minor issues the validator won't catch.
 *
 * Without this, a successful real LLM call that returns valid structured
 * data still fails `JSON.parse` and degrades to mock — the exact
 * "looks like demo data even with a working key" failure mode that
 * rounds 204-208 worked to eliminate. This module is shared by the OpenAI
 * and Anthropic providers so both benefit.
 *
 * Strategy, in order:
 *  1. Strip `<think>…</think>` blocks entirely (reasoning is not JSON).
 *  2. If a fenced code block is present, take its inner text.
 *  3. Otherwise, scan for the first balanced `{ … }` and parse just that
 *     substring, ignoring trailing prose.
 *  4. As a last resort, try parsing the whole cleaned string.
 *
 * Throws if no JSON object can be found, so the caller can classify it as a
 * `parse_error` fallback reason.
 */
export function extractJsonObject(text: string): unknown {
  if (typeof text !== "string") {
    throw new Error("extractJsonObject: input is not a string");
  }

  // 1. Remove reasoning blocks. These can wrap the whole answer or sit
  //    before it. The `s` flag lets `.` match newlines; non-greedy so we
  //    stop at the first close tag. Case-insensitive for robustness.
  let cleaned = text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();

  // Also strip a stray unclosed <think> (model cut off mid-reasoning).
  const openTagIdx = cleaned.search(/<think>/i);
  if (openTagIdx !== -1) {
    // Drop everything from the unclosed <think> onward — there is no JSON
    // after it (the model never finished reasoning).
    cleaned = cleaned.slice(0, openTagIdx).trim();
  }

  if (!cleaned) {
    throw new Error("extractJsonObject: empty after stripping reasoning blocks");
  }

  // 2. Prefer a fenced code block if present: ```json … ``` or ``` … ```.
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch) {
    const inner = fenceMatch[1].trim();
    if (inner) {
      return parseLenient(inner);
    }
  }

  // 3. Scan for the first balanced top-level `{ … }` so trailing prose
  //    ("Here is the result: { … }. Let me know if you need more.") does
  //    not break parsing. We track brace depth and string state; we do not
  //    attempt full JSON tokenization — just enough to find the object
  //    boundary.
  const objStart = cleaned.indexOf("{");
  if (objStart !== -1) {
    const candidate = sliceBalanced(cleaned, objStart, "{", "}");
    if (candidate) {
      try {
        return parseLenient(candidate);
      } catch {
        // Fall through to the whole-string attempt below.
      }
    }
  }

  // 4. Last resort: parse the whole cleaned string.
  return parseLenient(cleaned);
}

/** Parse with minor tolerance for trailing commas (a common LLM habit). */
function parseLenient(s: string): unknown {
  // Remove trailing commas before } or ] — strictly invalid JSON but
  // produced often enough by LLMs that tolerating it is worth it. Only
  // touch commas that are directly followed by whitespace* and a closer.
  const normalized = s.replace(/,\s*([}\]])/g, "$1");
  try {
    return JSON.parse(normalized);
  } catch (error) {
    const trimmed = normalized.trimStart();
    if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
      throw error;
    }
    return JSON.parse(jsonrepair(normalized));
  }
}

/**
 * Return the substring from `startIdx` to the matching closer, respecting
 * string literals and escapes. Returns null if no balanced slice exists.
 */
function sliceBalanced(
  source: string,
  startIdx: number,
  open: string,
  close: string,
): string | null {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = startIdx; i < source.length; i++) {
    const ch = source[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === open) {
      depth++;
    } else if (ch === close) {
      depth--;
      if (depth === 0) {
        return source.slice(startIdx, i + 1);
      }
    }
  }
  return null;
}
