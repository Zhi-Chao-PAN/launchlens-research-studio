"use client";

import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useCommandPalette } from "./CommandPaletteContext";
import { useTheme } from "next-themes";
import { useHotkeys } from "@/lib/hooks/use-hotkeys";
import { useChord, type ChordMap } from "@/lib/hooks/use-chord";
import { KeyboardShortcutsHelp } from "./KeyboardShortcutsHelp";

/**
 * Registers global commands and keyboard shortcuts.
 * Mount this in the root layout.
 */
export function GlobalCommands() {
  const { registerCommands, togglePalette } = useCommandPalette();
  const { setTheme, resolvedTheme } = useTheme();
  const router = useRouter();

  // Cmd+K / Ctrl+K to toggle command palette
  useHotkeys(["cmd+k", "ctrl+k"], togglePalette, {
    ignoreInputs: true,
    scope: "global",
  });

  // R221: chord (sequence) shortcuts — g then h/s/t/b/c.
  // The cheatsheet advertises "G then H/S/T/B/C"; these require sequence
  // support that useHotkeys (modifier+key matcher) cannot provide.
  const chordMap = useMemo<ChordMap>(
    () => ({
      g: ["h", "s", "t", "b", "c"],
    }),
    [],
  );

  useChord(chordMap, (_first, second) => {
    switch (second) {
      case "h":
        router.push("/");
        break;
      case "s":
        router.push("/history");
        break;
      case "t":
        router.push("/templates");
        break;
      case "b":
        router.push("/batch");
        break;
      case "c":
        router.push("/compare");
        break;
      default:
        break;
    }
  });

  useEffect(() => {
    const unregister = registerCommands([
      {
        id: "nav:home",
        label: "Go to Home",
        description: "Return to the research studio home page",
        icon: "🏠",
        shortcut: "g h",
        category: "navigation",
        keywords: ["home", "start", "main", "index"],
        action: () => router.push("/"),
      },
      {
        id: "nav:history",
        label: "Go to History",
        description: "View all past research sessions",
        icon: "📜",
        shortcut: "g s",
        category: "navigation",
        keywords: ["history", "past", "sessions", "research"],
        action: () => router.push("/history"),
      },
      {
        id: "nav:templates",
        label: "Go to Templates",
        description: "Browse and manage research templates",
        icon: "📋",
        shortcut: "g t",
        category: "navigation",
        keywords: ["templates", "presets", "saved"],
        action: () => router.push("/templates"),
      },
      {
        id: "nav:batch",
        label: "Go to Batch Research",
        description: "Run multiple research queries at once",
        icon: "⚡",
        shortcut: "g b",
        category: "navigation",
        keywords: ["batch", "bulk", "multi"],
        action: () => router.push("/batch"),
      },
      {
        id: "nav:compare",
        label: "Go to Compare",
        description: "Compare two research reports side by side",
        icon: "⚖️",
        shortcut: "g c",
        category: "navigation",
        keywords: ["compare", "diff", "side-by-side"],
        action: () => router.push("/compare"),
      },
      {
        id: "nav:starred",
        label: "Go to Starred",
        description: "View your starred research",
        icon: "⭐",
        shortcut: "g *",
        category: "navigation",
        keywords: ["starred", "favorites", "bookmarks"],
        action: () => router.push("/history?filter=starred"),
      },
      {
        id: "theme:toggle",
        label: "Toggle Theme",
        description: "Switch between light and dark mode",
        icon: "🌗",
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
        icon: "🌙",
        category: "setting",
        keywords: ["dark", "night", "theme"],
        action: () => setTheme("dark"),
      },
      {
        id: "theme:light",
        label: "Light Mode",
        description: "Switch to light theme",
        icon: "☀️",
        category: "setting",
        keywords: ["light", "day", "theme"],
        action: () => setTheme("light"),
      },
      {
        id: "palette:open",
        label: "Command Palette",
        description: "Open the command palette",
        icon: "⌘",
        shortcut: "⌘K",
        category: "action",
        keywords: ["command", "palette", "search", "quick"],
        action: () => {},
      },
    ]);

    return unregister;
  }, [registerCommands, setTheme, resolvedTheme, router]);

  const shortcuts = [
    { keys: "⌘ K / Ctrl K", description: "Open command palette" },
    { keys: "?", description: "Show keyboard shortcuts" },
    { keys: "G then H", description: "Go to home" },
    { keys: "G then S", description: "Go to sessions / history" },
    { keys: "G then T", description: "Go to templates" },
    { keys: "G then B", description: "Go to batch research" },
    { keys: "G then C", description: "Go to compare" },
    { keys: "t", description: "Toggle theme" },
    { keys: "Esc", description: "Close dialogs / modals" },
  ];

  return <KeyboardShortcutsHelp shortcuts={shortcuts} />;
}
