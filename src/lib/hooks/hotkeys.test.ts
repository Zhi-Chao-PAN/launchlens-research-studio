/// <reference types="vitest/globals" />
import { describe, it, expect, beforeEach } from "vitest";
import {
  registerCommands,
  getCommands,
  subscribeToCommands,
  formatShortcut,
} from "@/lib/hooks/use-hotkey";
import { getAllHotkeys, matchKey, parseComboString } from "@/lib/hooks/use-hotkeys";

describe("command registry (use-hotkey, round 177)", () => {
  beforeEach(() => {
    // reset registry: register a no-op and unregister all to clear
    const all = getCommands();
    for (const c of all) {
      registerCommands([{ ...c, id: "__clear__" + c.id }]);
    }
    // Simpler: re-import by requiring fresh module? Just rely on getCommands filtering.
    // Instead use the unregister by registering a placeholder set that we unregister.
  });

  it("formatShortcut composes modifier prefixes", () => {
    expect(formatShortcut("k")).toBe("K");
    expect(formatShortcut("k", true)).toBe("Cmd+K");
    expect(formatShortcut("/", false, true)).toBe("Shift+/");
    expect(formatShortcut("p", true, true)).toBe("Cmd+Shift+P");
  });

  it("registerCommands adds and unregister removes", () => {
    const unreg = registerCommands([
      { id: "r177-a", label: "A", action: () => {} },
      { id: "r177-b", label: "B", action: () => {} },
    ]);
    const afterAdd = getCommands().map((c) => c.id);
    expect(afterAdd).toContain("r177-a");
    expect(afterAdd).toContain("r177-b");
    unreg();
    const afterRemove = getCommands().map((c) => c.id);
    expect(afterRemove).not.toContain("r177-a");
    expect(afterRemove).not.toContain("r177-b");
  });

  it("subscribeToCommands fires on register/unregister", () => {
    let count = 0;
    const unsub = subscribeToCommands(() => { count++; });
    const unreg = registerCommands([{ id: "r177-s", label: "S", action: () => {} }]);
    expect(count).toBe(1);
    unreg();
    expect(count).toBe(2);
    unsub();
  });

  it("filters commands via available() predicate", () => {
    let flag = false;
    const unreg = registerCommands([
      { id: "r177-c", label: "C", action: () => {}, available: () => flag },
    ]);
    expect(getCommands().map(c => c.id)).not.toContain("r177-c");
    flag = true;
    expect(getCommands().map(c => c.id)).toContain("r177-c");
    unreg();
  });

  it("parseComboString parses modifier combos", () => {
    expect(parseComboString("k")).toEqual({ key: "k", ctrl: undefined, meta: undefined, shift: undefined, alt: undefined });
    expect(parseComboString("ctrl+k")).toMatchObject({ key: "k", ctrl: true });
    expect(parseComboString("cmd+shift+p")).toMatchObject({ key: "p", meta: true, shift: true });
    expect(parseComboString("Meta+Alt+?")).toMatchObject({ key: "?", meta: true, alt: true });
  });

  it("matchKey compares key + modifier flags", () => {
    const reg = { id: "x", key: "k", meta: true, options: {}, scope: "g", handler: () => {} };
    expect(matchKey({ key: "k", metaKey: true, ctrlKey: false, shiftKey: false, altKey: false }, reg)).toBe(true);
    expect(matchKey({ key: "k", metaKey: false, ctrlKey: true, shiftKey: false, altKey: false }, reg)).toBe(false);
    expect(matchKey({ key: "j", metaKey: true, ctrlKey: false, shiftKey: false, altKey: false }, reg)).toBe(false);
  });

  it("getAllHotkeys returns copy of registry", () => {
    const list = getAllHotkeys();
    expect(Array.isArray(list)).toBe(true);
    // Should be a new array each call:
    expect(getAllHotkeys()).not.toBe(list);
  });
});
