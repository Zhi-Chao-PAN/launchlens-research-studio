"use client";

import { useEffect } from "react";
import { useCommandPalette } from "./CommandPaletteContext";
import { useTheme } from "next-themes";
import { useHotkeys } from "@/lib/hooks/use-hotkeys";
import { KeyboardShortcutsHelp } from "./KeyboardShortcutsHelp";

/**
 * Registers global commands and keyboard shortcuts.
 * Mount this in the root layout.
 */
export function GlobalCommands() {
  const { registerCommands, togglePalette } = useCommandPalette();
  const { setTheme, resolvedTheme } = useTheme();

  // Cmd+K / Ctrl+K to toggle command palette
  useHotkeys(["cmd+k", "ctrl+k"], togglePalette, {
    ignoreInputs: true,
    scope: "global",
  });

  useEffect(() => {
    const unregister = registerCommands([
      {
        id: "nav:home",
        label: "Go to Home",
        description: "Return to the research studio home page",
        icon: "??",
        shortcut: "g h",
        category: "navigation",
        keywords: ["home", "start", "main", "index"],
        action: () => { window.location.href = "/"; },
      },
      {
        id: "nav:history",
        label: "Go to History",
        description: "View all past research sessions",
        icon: "??",
        shortcut: "g s",
        category: "navigation",
        keywords: ["history", "past", "sessions", "research"],
        action: () => { window.location.href = "/research"; },
      },
      {
        id: "nav:templates",
        label: "Go to Templates",
        description: "Browse and manage research templates",
        icon: "??",
        shortcut: "g t",
        category: "navigation",
        keywords: ["templates", "presets", "saved"],
        action: () => { window.location.href = "/templates"; },
      },
      {
        id: "nav:starred",
        label: "Go to Starred",
        description: "View your starred research",
        icon: "?",
        shortcut: "g *",
        category: "navigation",
        keywords: ["starred", "favorites", "bookmarks"],
        action: () => { window.location.href = "/research?filter=starred"; },
      },
      {
        id: "theme:toggle",
        label: "Toggle Theme",
        description: "Switch between light and dark mode",
        icon: "??",
        shortcut: "t",
        category: "setting",
        keywords: ["theme", "dark", "light", "mode", "color"],
        action: () => {
          setTheme(resolvedTheme === "dark" ? "light" : "dark");
        },
      },
      {
        id: "theme:dark",
        label: "Dark Mode",
        description: "Switch to dark theme",
        icon: "??",
        category: "setting",
        keywords: ["dark", "night", "theme"],
        action: () => setTheme("dark"),
      },
      {
        id: "theme:light",
        label: "Light Mode",
        description: "Switch to light theme",
        icon: "??",
        category: "setting",
        keywords: ["light", "day", "theme"],
        action: () => setTheme("light"),
      },
      {
        id: "palette:open",
        label: "Command Palette",
        description: "Open the command palette",
        icon: "?",
        shortcut: "?K",
        category: "action",
        keywords: ["command", "palette", "search", "quick"],
        action: () => {},
      },
    ]);

    return unregister;
  }, [registerCommands, setTheme, resolvedTheme]);

  const shortcuts = [
    { keys: "⌘ K / Ctrl K", description: "Open command palette" },
    { keys: "?", description: "Show keyboard shortcuts" },
    { keys: "g h", description: "Go to home" },
    { keys: "g s", description: "Go to sessions / history" },
    { keys: "g t", description: "Go to templates" },
    { keys: "t", description: "Toggle theme" },
    { keys: "Esc", description: "Close dialogs / modals" },
  ];

  return <KeyboardShortcutsHelp shortcuts={shortcuts} />;
}
