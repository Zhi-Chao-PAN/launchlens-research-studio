import { useEffect, useRef } from "react";

type KeyHandler = (event: KeyboardEvent) => void;

interface HotkeyOptions {
  /** Only trigger when not in input/textarea */
  ignoreInputs?: boolean;
  /** Prevent default browser behavior */
  preventDefault?: boolean;
  /** Stop event propagation */
  stopPropagation?: boolean;
}

interface HotkeyConfig extends HotkeyOptions {
  key: string;
  ctrl?: boolean;
  meta?: boolean;
  shift?: boolean;
  alt?: boolean;
  handler: KeyHandler;
}

// Normalize key name for comparison
function normalizeKey(key: string): string {
  return key.toLowerCase().trim();
}

function matchesKey(event: KeyboardEvent, config: HotkeyConfig): boolean {
  const keyMatch = normalizeKey(event.key) === normalizeKey(config.key);

  const shiftMatch = config.shift ? event.shiftKey : true;
  const altMatch = config.alt ? event.altKey : true;
  
  // For ctrl/meta combos, either works (Cmd on Mac, Ctrl on Windows/Linux)
  const modifierMatch =
    (config.ctrl || config.meta)
      ? (event.ctrlKey || event.metaKey) &&
        (!config.shift || event.shiftKey) &&
        (!config.alt || event.altKey)
      : (!event.ctrlKey && !event.metaKey) &&
        shiftMatch && altMatch;
  
  return keyMatch && modifierMatch;
}

function isInputTarget(target: EventTarget | null): boolean {
  if (!target) return false;
  const el = target as HTMLElement;
  const tagName = el.tagName?.toLowerCase();
  return (
    tagName === "input" ||
    tagName === "textarea" ||
    tagName === "select" ||
    el.isContentEditable ||
    el.closest?.("[contenteditable=true]") !== null
  );
}

/**
 * Register a global keyboard shortcut.
 * 
 * Usage:
 * useHotkey({ key: "k", meta: true, handler: () => openPalette() });
 */
export function useHotkey(
  config: Omit<HotkeyConfig, "handler"> & { handler: KeyHandler },
  deps: unknown[] = [],
): void {
  const handlerRef = useRef<KeyHandler>(config.handler);
  
  // Keep handler reference fresh
  useEffect(() => {
    handlerRef.current = config.handler;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deps is a caller-supplied dependency array spread by design
  }, [config.handler, ...deps]);

  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if (!matchesKey(event, config)) return;

      if (config.ignoreInputs !== false && isInputTarget(event.target)) {
        return;
      }

      if (config.preventDefault !== false) {
        event.preventDefault();
      }

      if (config.stopPropagation) {
        event.stopPropagation();
      }

      handlerRef.current(event);
    };

    window.addEventListener("keydown", listener, { capture: false });
    return () => window.removeEventListener("keydown", listener);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- config fields listed individually (avoid re-registering on every render); deps is caller-supplied
  }, [
    config.key,
    config.ctrl,
    config.meta,
    config.shift,
    config.alt,
    config.ignoreInputs,
    config.preventDefault,
    config.stopPropagation,
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deps is a caller-supplied dependency array spread by design
    ...deps,
  ]);
}

export interface Command {
  id: string;
  label: string;
  description?: string;
  icon?: string;
  shortcut?: string; // e.g. "⌘K" or "G H"
  category?: string;
  action: () => void;
  // Filter function for conditional availability
  available?: () => boolean;
}

// Command palette store
let globalCommands: Command[] = [];
const listeners = new Set<() => void>();

function notifyListeners() {
  for (const l of listeners) l();
}

export function registerCommands(commands: Command[]): () => void {
  globalCommands = [...globalCommands, ...commands];
  notifyListeners();
  
  return () => {
    const ids = new Set(commands.map((c) => c.id));
    globalCommands = globalCommands.filter((c) => !ids.has(c.id));
    notifyListeners();
  };
}

export function getCommands(): Command[] {
  return globalCommands.filter((c) => !c.available || c.available());
}

export function subscribeToCommands(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// Helper: format shortcut string from config
export function formatShortcut(key: string, meta?: boolean, shift?: boolean): string {
  const parts: string[] = [];
  if (meta) parts.push("Cmd+");
  if (shift) parts.push("Shift+");
  parts.push(key.toUpperCase());
  return parts.join("");
}
