// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useChord, type ChordMap } from "./use-chord";

/**
 * Helper: dispatch a keydown event with given key + modifier flags.
 */
function pressKey(key: string, opts: { ctrl?: boolean; meta?: boolean; alt?: boolean; target?: HTMLElement } = {}) {
  const target = opts.target ?? document.body;
  const event = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
    ctrlKey: !!opts.ctrl,
    metaKey: !!opts.meta,
    altKey: !!opts.alt,
  });
  Object.defineProperty(event, "target", { value: target });
  target.dispatchEvent(event);
}

/** Synthesize an <input> focused as the active target. */
function focusedInput(): HTMLInputElement {
  const input = document.createElement("input");
  document.body.appendChild(input);
  input.focus();
  return input;
}

describe("useChord (R221)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("fires handler when first + second key pressed in sequence within window", () => {
    const handler = vi.fn();
    const map: ChordMap = { g: ["h"] };
    renderHook(() => useChord(map, handler));

    pressKey("g");
    pressKey("h");
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith("g", "h");
  });

  it("supports multiple second keys sharing the same first key", () => {
    const handler = vi.fn();
    const map: ChordMap = { g: ["h", "s", "t", "b"] };
    renderHook(() => useChord(map, handler));

    pressKey("g");
    pressKey("t");
    expect(handler).toHaveBeenCalledWith("g", "t");

    pressKey("g");
    pressKey("b");
    expect(handler).toHaveBeenCalledTimes(2);
    expect(handler).toHaveBeenLastCalledWith("g", "b");
  });

  it("does not fire when second key does not match any chord", () => {
    const handler = vi.fn();
    const map: ChordMap = { g: ["h", "s"] };
    renderHook(() => useChord(map, handler));

    pressKey("g");
    pressKey("x");
    expect(handler).not.toHaveBeenCalled();
  });

  it("does not fire when window expires before second key", () => {
    const handler = vi.fn();
    const map: ChordMap = { g: ["h"] };
    renderHook(() => useChord(map, handler, { windowMs: 1000 }));

    pressKey("g");
    act(() => {
      vi.advanceTimersByTime(1500);
    });
    pressKey("h");
    expect(handler).not.toHaveBeenCalled();
  });

  it("restarts chord when a second key that is itself a first key is pressed", () => {
    const handler = vi.fn();
    const map: ChordMap = { g: ["h", "s"] };
    renderHook(() => useChord(map, handler));

    // g then g (g is a valid first key, but not a valid second for g) -> restart
    pressKey("g");
    pressKey("g");
    expect(handler).not.toHaveBeenCalled();
    pressKey("s");
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith("g", "s");
  });

  it("does not fire while an input/textarea is focused (ignoreInputs default)", () => {
    const handler = vi.fn();
    const map: ChordMap = { g: ["h"] };
    renderHook(() => useChord(map, handler));

    const input = focusedInput();
    pressKey("g", { target: input });
    pressKey("h", { target: input });
    expect(handler).not.toHaveBeenCalled();
  });

  it("ignores modifier chords (ctrl/meta/alt held)", () => {
    const handler = vi.fn();
    const map: ChordMap = { g: ["h"] };
    renderHook(() => useChord(map, handler));

    pressKey("g", { ctrl: true });
    pressKey("h");
    expect(handler).not.toHaveBeenCalled();
  });

  it("is a no-op when enabled=false", () => {
    const handler = vi.fn();
    const map: ChordMap = { g: ["h"] };
    renderHook(() => useChord(map, handler, { enabled: false }));

    pressKey("g");
    pressKey("h");
    expect(handler).not.toHaveBeenCalled();
  });

  it("matches case-insensitively (G uppercase = g lowercase)", () => {
    const handler = vi.fn();
    const map: ChordMap = { g: ["h"] };
    renderHook(() => useChord(map, handler));

    pressKey("G");
    pressKey("H");
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith("g", "h");
  });

  it("clears the pending chord on unmount", () => {
    const handler = vi.fn();
    const map: ChordMap = { g: ["h"] };
    const { unmount } = renderHook(() => useChord(map, handler));

    pressKey("g");
    unmount();
    // After unmount, the listener is gone; pressing h must not fire.
    pressKey("h");
    expect(handler).not.toHaveBeenCalled();
  });
});
