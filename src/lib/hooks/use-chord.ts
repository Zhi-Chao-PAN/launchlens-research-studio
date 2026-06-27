"use client";

import { useEffect, useRef } from "react";

/**
 * R221: chord (sequence) keyboard shortcut support.
 *
 * The existing useHotkeys hook only handles single-key and modifier
 * combinations (e.g. "ctrl+k", "shift+?"). The KeyboardCheatsheet
 * advertises sequences like "G then H" (press G, then press H, both
 * within a short window) but pressing G then H on the keyboard did
 * nothing because the modifier+key matcher doesn't understand chords.
 *
 * useChord takes a map of { firstKey: [secondKey, ...] } and a 1.5s
 * window. After the first key is pressed, the next keypress within
 * the window fires the matching handler (if any) and clears the chord
 * state. A keypress outside the window is treated as either a fresh
 * first key (if it's in the map) or ignored.
 *
 * Multiple second keys are allowed per first key so that several
 * chords can share the same prefix (e.g. G+H, G+S, G+T, G+B all
 * start with G).
 *
 * Inputs are skipped (no chord fires while typing) to avoid stealing
 * characters from text fields.
 */

export interface ChordOptions {
  /** Max ms between first and second keypress (default 1500). */
  windowMs?: number;
  /** Skip when an input/textarea/contentEditable is focused (default true). */
  ignoreInputs?: boolean;
  /** Disable the chord entirely. */
  enabled?: boolean;
}

/**
 * Map of first key -> list of valid second keys. All keys are compared
 * case-insensitively for single-character entries.
 */
export type ChordMap = Record<string, string[]>;

function isInputTarget(e: KeyboardEvent): boolean {
  const target = e.target as HTMLElement;
  const tag = target?.tagName;
  if (!tag) return false;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  return false;
}

function normalizeKey(key: string): string {
  return key.length === 1 ? key.toLowerCase() : key;
}

/** Lowercased lookup index built once per render for O(1) matching. */
function buildIndex(map: ChordMap): Record<string, Set<string>> {
  const index: Record<string, Set<string>> = {};
  for (const first of Object.keys(map)) {
    const firstNorm = normalizeKey(first);
    const seconds = map[first] ?? [];
    const set = new Set<string>();
    for (const s of seconds) set.add(normalizeKey(s));
    index[firstNorm] = set;
  }
  return index;
}

export function useChord(
  map: ChordMap,
  handler: (firstKey: string, secondKey: string) => void,
  options: ChordOptions = {},
): void {
  const { windowMs = 1500, ignoreInputs = true, enabled = true } = options;
  const handlerRef = useRef(handler);
  const firstKeyRef = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep ref in sync with the latest handler.
  useEffect(() => {
    handlerRef.current = handler;
  }, [handler]);

  useEffect(() => {
    if (!enabled) return;

    const index = buildIndex(map);

    const onKey = (e: KeyboardEvent) => {
      // Only single-character keys are valid chord members — a modifier
      // chord would conflict with useHotkeys' single-key bindings.
      if (e.key.length !== 1) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (ignoreInputs && isInputTarget(e)) return;
      const key = normalizeKey(e.key);

      const current = firstKeyRef.current;
      if (current === null) {
        // Look for a matching first key.
        if (Object.prototype.hasOwnProperty.call(index, key)) {
          firstKeyRef.current = key;
          if (timerRef.current) clearTimeout(timerRef.current);
          timerRef.current = setTimeout(() => {
            firstKeyRef.current = null;
            timerRef.current = null;
          }, windowMs);
        }
        return;
      }

      // We have a pending first key — try to match second.
      const seconds = index[current];
      if (seconds && seconds.has(key)) {
        // Match: fire handler and clear.
        const matchedFirst = current;
        const matchedSecond = key;
        firstKeyRef.current = null;
        if (timerRef.current) {
          clearTimeout(timerRef.current);
          timerRef.current = null;
        }
        handlerRef.current(matchedFirst, matchedSecond);
      } else if (Object.prototype.hasOwnProperty.call(index, key)) {
        // Second key is itself a valid first key for some other chord —
        // restart with it as the new first key.
        firstKeyRef.current = key;
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
          firstKeyRef.current = null;
          timerRef.current = null;
        }, windowMs);
      } else {
        // Mismatch: discard the pending chord.
        firstKeyRef.current = null;
        if (timerRef.current) {
          clearTimeout(timerRef.current);
          timerRef.current = null;
        }
      }
    };

    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [map, windowMs, ignoreInputs, enabled]);
}
