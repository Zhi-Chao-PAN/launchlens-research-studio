"use client";

import { useEffect, useCallback, useRef } from "react";

export interface HotkeyOptions {
  /** Prevent default browser behavior */
  preventDefault?: boolean;
  /** Only trigger when element is not in an input/textarea */
  ignoreInputs?: boolean;
  /** Enable the hotkey (default: true) */
  enabled?: boolean;
}

interface HotkeyRegistration {
  id: string;
  key: string;
  ctrl?: boolean;
  meta?: boolean;
  shift?: boolean;
  alt?: boolean;
  handler: (e: KeyboardEvent) => void;
  options: HotkeyOptions;
  scope: string;
}

// Global registry for command palette discovery
let globalRegistry: HotkeyRegistration[] = [];

function normalizeKey(key: string): string {
  return key.toLowerCase();
}

export function matchKey(e: Pick<KeyboardEvent, "key"|"ctrlKey"|"metaKey"|"shiftKey"|"altKey">, reg: HotkeyRegistration): boolean {
  if (normalizeKey(e.key) !== normalizeKey(reg.key)) return false;
  if (reg.ctrl !== undefined && reg.ctrl !== e.ctrlKey) return false;
  if (reg.meta !== undefined && reg.meta !== e.metaKey) return false;
  if (reg.shift !== undefined && reg.shift !== e.shiftKey) return false;
  if (reg.alt !== undefined && reg.alt !== e.altKey) return false;
  return true;
}

function isInputTarget(e: KeyboardEvent): boolean {
  const target = e.target as HTMLElement;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  return false;
}

/**
 * useHotkeys ? register a keyboard shortcut.
 *
 * @param combo Keyboard combo like "k", "ctrl+k", "cmd+k", "shift+?"
 * @param handler Function to call when the combo is pressed
 * @param options Options
 */
export function useHotkeys(
  combo: string | string[],
  handler: (e: KeyboardEvent) => void,
  options: HotkeyOptions & { scope?: string } = {},
) {
  const handlerRef = useRef(handler);

  // Keep ref in sync with latest handler
  useEffect(() => {
    handlerRef.current = handler;
  }, [handler]);

  const { preventDefault = true, ignoreInputs = true, enabled = true, scope = "global" } = options;

  const parseCombo = useCallback(/** @internal */(comboStr: string): Omit<HotkeyRegistration, "id" | "handler" | "options" | "scope"> => {
    const parts = comboStr.toLowerCase().split("+").map((s) => s.trim());
    const key = parts[parts.length - 1];
    const ctrl = parts.includes("ctrl") || parts.includes("control");
    const meta = parts.includes("cmd") || parts.includes("meta") || parts.includes("command");
    const shift = parts.includes("shift");
    const alt = parts.includes("alt") || parts.includes("option");
    return { key, ctrl: ctrl || undefined, meta: meta || undefined, shift: shift || undefined, alt: alt || undefined };
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const combos = Array.isArray(combo) ? combo : [combo];
    const registrations: HotkeyRegistration[] = combos.map((c) => ({
      id: scope + ":" + c + ":" + Math.random().toString(36).slice(2, 8),
      ...parseCombo(c),
      handler: (e: KeyboardEvent) => handlerRef.current(e),
      options: { preventDefault, ignoreInputs },
      scope,
    }));

    const handleKeyDown = (e: KeyboardEvent) => {
      for (const reg of registrations) {
        if (matchKey(e, reg)) {
          if (reg.options.ignoreInputs && isInputTarget(e)) continue;
          if (reg.options.preventDefault) {
            e.preventDefault();
          }
          reg.handler(e);
          break;
        }
      }
    };

    globalRegistry.push(...registrations);

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      globalRegistry = globalRegistry.filter((r) => !registrations.some((nr) => nr.id === r.id));
    };
  }, [combo, enabled, preventDefault, ignoreInputs, scope, parseCombo]);
}

/**
 * Get all registered hotkeys (for command palette / help display).
 */
/** Pure combo parser (no React dependency). */
export function parseComboString(comboStr: string): Omit<HotkeyRegistration, "id" | "handler" | "options" | "scope"> {
  const parts = comboStr.toLowerCase().split("+").map((s) => s.trim());
  const key = parts[parts.length - 1];
  const ctrl = parts.includes("ctrl") || parts.includes("control");
  const meta = parts.includes("cmd") || parts.includes("meta") || parts.includes("command");
  const shift = parts.includes("shift");
  const alt = parts.includes("alt") || parts.includes("option");
  return { key, ctrl: ctrl || undefined, meta: meta || undefined, shift: shift || undefined, alt: alt || undefined };
}

export function getAllHotkeys(): HotkeyRegistration[] {
  return [...globalRegistry];
}
