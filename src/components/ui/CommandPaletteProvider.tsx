"use client";

import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from "react";
import { CommandPalette } from "./CommandPalette";
import { useHotkey } from "@/lib/hooks/use-hotkey";

interface CommandPaletteContextType {
  open: () => void;
  close: () => void;
  isOpen: boolean;
}

const CommandPaletteContext = createContext<CommandPaletteContextType | null>(null);

export function useCommandPalette(): CommandPaletteContextType {
  const ctx = useContext(CommandPaletteContext);
  if (!ctx) {
    throw new Error("useCommandPalette must be used within CommandPaletteProvider");
  }
  return ctx;
}

export function CommandPaletteProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);

  // Global ⌘K / Ctrl+K shortcut
  useHotkey({
    key: "k",
    meta: true,
    handler: () => {
      setIsOpen((open) => !open);
    },
    preventDefault: true,
    ignoreInputs: false,
  }, []);

  // Also support Ctrl+K on non-Mac
  useHotkey({
    key: "k",
    ctrl: true,
    handler: () => {
      setIsOpen((open) => !open);
    },
    preventDefault: true,
    ignoreInputs: false,
  }, []);

  const value: CommandPaletteContextType = { open, close, isOpen };

  return (
    <CommandPaletteContext.Provider value={value}>
      {children}
      <CommandPalette isOpen={isOpen} onClose={close} />
    </CommandPaletteContext.Provider>
  );
}
