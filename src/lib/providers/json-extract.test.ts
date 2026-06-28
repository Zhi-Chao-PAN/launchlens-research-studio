import { describe, it, expect } from "vitest";
import { extractJsonObject } from "./json-extract";

describe("extractJsonObject", () => {
  it("parses a plain JSON object with no scaffolding", () => {
    expect(extractJsonObject('{"ok": true}')).toEqual({ ok: true });
  });

  it("strips a <think> reasoning block emitted before the JSON (MiniMax-M3 / DeepSeek-R1)", () => {
    const raw = '<think>The user said hi. I should reply with a JSON object with ok=true.</think>\n\n{"ok": true}';
    expect(extractJsonObject(raw)).toEqual({ ok: true });
  });

  it("strips an unclosed <think> block when the model was cut off mid-reasoning", () => {
    // No JSON follows — extraction must fail (parse_error), not return junk.
    const raw = "<think>I will reason about this and never finish";
    expect(() => extractJsonObject(raw)).toThrow();
  });

  it("extracts JSON from a ```json fenced block", () => {
    const raw = 'Here is the result:\n\n```json\n{"ok": true}\n```\n\nLet me know!';
    expect(extractJsonObject(raw)).toEqual({ ok: true });
  });

  it("extracts JSON from an unfenced ``` block", () => {
    const raw = "```\n{\"ok\": true}\n```";
    expect(extractJsonObject(raw)).toEqual({ ok: true });
  });

  it("ignores trailing prose after the JSON object", () => {
    const raw = '{"ok": true}. Hope this helps!';
    expect(extractJsonObject(raw)).toEqual({ ok: true });
  });

  it("ignores leading prose before the JSON object", () => {
    const raw = 'Sure, here you go: {"ok": true}';
    expect(extractJsonObject(raw)).toEqual({ ok: true });
  });

  it("handles nested braces inside string values without miscounting depth", () => {
    const raw = '{"note": "a {b} c", "ok": true}';
    expect(extractJsonObject(raw)).toEqual({ note: "a {b} c", ok: true });
  });

  it("handles escaped quotes inside string values", () => {
    const raw = '{"note": "she said \\"hi\\"", "ok": true}';
    expect(extractJsonObject(raw)).toEqual({ note: 'she said "hi"', ok: true });
  });

  it("tolerates trailing commas (a common LLM habit)", () => {
    const raw = '{"a": 1, "b": 2,}';
    expect(extractJsonObject(raw)).toEqual({ a: 1, b: 2 });
  });

  it("tolerates trailing commas in nested arrays", () => {
    const raw = '{"items": [1, 2, 3,]}';
    expect(extractJsonObject(raw)).toEqual({ items: [1, 2, 3] });
  });

  it("repairs a missing comma in otherwise complete model JSON", () => {
    const raw = '{"a": 1 "b": 2}';
    expect(extractJsonObject(raw)).toEqual({ a: 1, b: 2 });
  });

  it("handles a <think> block that contains a fake JSON-looking string", () => {
    // The reasoning block must not be mistaken for the answer.
    const raw = '<think>maybe {\"not\": \"this\"}</think>\n{\"ok\": true}';
    expect(extractJsonObject(raw)).toEqual({ ok: true });
  });

  it("throws on empty string", () => {
    expect(() => extractJsonObject("")).toThrow();
  });

  it("throws on non-JSON prose with no braces", () => {
    expect(() => extractJsonObject("I cannot help with that.")).toThrow();
  });

  it("preserves a large nested object intact", () => {
    const obj = { market: { tam: 100, segments: [{ id: "s1", name: "x" }] }, ok: true };
    const raw = "<think>analyzing</think>\n" + JSON.stringify(obj);
    expect(extractJsonObject(raw)).toEqual(obj);
  });
});
