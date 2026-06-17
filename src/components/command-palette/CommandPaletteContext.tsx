"use client";

import { createContext, useContext, useState, useCallback, ReactNode } from "react";

export interface Command {
  id: string;
  label: string;
  description?: string;
  icon?: string;
  shortcut?: string;
  category: "navigation" | "action" | "setting" | "template";
  keywords?: string[];
  action: () => void;
}

interface CommandPaletteContextType {
  isOpen: boolean;
  openPalette: () => void;
  closePalette: () => void;
  togglePalette: () => void;
  commands: Command[];
  registerCommands: (cmds: Command[]) => () => void;
  runCommand: (id: string) => void;
}

const CommandPaletteContext = createContext<CommandPaletteContextType | null>(null);

export function CommandPaletteProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [commands, setCommands] = useState<Command[]>([]);

  const openPalette = useCallback(() => setIsOpen(true), []);
  const closePalette = useCallback(() => setIsOpen(false), []);
  const togglePalette = useCallback(() => setIsOpen((v) => !v), []);

  const registerCommands = useCallback((cmds: Command[]) => {
    setCommands((prev) => [...prev, ...cmds]);
    const ids = cmds.map((c) => c.id);
    return () => {
      setCommands((prev) => prev.filter((c) => !ids.includes(c.id)));
    };
  }, []);

  const runCommand = useCallback((id: string) => {
    setCommands((current) => {
      const cmd = current.find((c) => c.id === id);
      if (cmd) {
        cmd.action();
        setIsOpen(false);
      }
      return current;
    });
  }, []);

  return (
    <CommandPaletteContext.Provider
      value={{ isOpen, openPalette, closePalette, togglePalette, commands, registerCommands, runCommand }}
    >
      {children}
    </CommandPaletteContext.Provider>
  );
}

export function useCommandPalette() {
  const ctx = useContext(CommandPaletteContext);
  if (!ctx) throw new Error("useCommandPalette must be used within CommandPaletteProvider");
  return ctx;
}
