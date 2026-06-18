"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { useHotkeys } from "@/lib/hooks/use-hotkeys";

interface Shortcut {
  keys: string;
  description: string;
  category: string;
  scope?: string;
}

const ALL_SHORTCUTS: Shortcut[] = [
  // Global
  { keys: "⌘ / Ctrl + K", description: "Open command palette", category: "Global", scope: "global" },
  { keys: "?", description: "Toggle keyboard shortcuts", category: "Global", scope: "global" },
  { keys: "Esc", description: "Close modal / panel", category: "Global", scope: "global" },
  { keys: "/", description: "Focus search", category: "Global", scope: "global" },
  { keys: "G + H", description: "Go to home", category: "Navigation", scope: "global" },
  { keys: "G + S", description: "Go to history", category: "Navigation", scope: "global" },
  { keys: "G + T", description: "Go to templates", category: "Navigation", scope: "global" },
  { keys: "G + B", description: "Go to batch research", category: "Navigation", scope: "global" },

  // Command palette
  { keys: "↑ / ↓", description: "Navigate results", category: "Command Palette", scope: "command-palette" },
  { keys: "Enter", description: "Execute selected command", category: "Command Palette", scope: "command-palette" },
  { keys: "Tab", description: "Switch categories", category: "Command Palette", scope: "command-palette" },

  // Research detail
  { keys: "j", description: "Next section", category: "Research Detail", scope: "research-detail" },
  { keys: "k", description: "Previous section", category: "Research Detail", scope: "research-detail" },
  { keys: "t", description: "Jump to top", category: "Research Detail", scope: "research-detail" },
  { keys: "b", description: "Jump to bottom", category: "Research Detail", scope: "research-detail" },
  { keys: "Ctrl + F", description: "Search in report", category: "Research Detail", scope: "research-detail" },
  { keys: "Enter", description: "Next match", category: "Research Detail", scope: "research-detail" },
  { keys: "Shift + Enter", description: "Previous match", category: "Research Detail", scope: "research-detail" },

  // History
  { keys: "Shift + Click", description: "Range select runs", category: "History", scope: "history" },
  { keys: "E", description: "Export selected", category: "History", scope: "history" },
  { keys: "Del", description: "Delete selected", category: "History", scope: "history" },
  { keys: "S", description: "Toggle star on selected", category: "History", scope: "history" },
  { keys: "Ctrl + A", description: "Select all", category: "History", scope: "history" },

  // Folders
  { keys: "Drag & Drop", description: "Reorder folders and runs", category: "Folders", scope: "folders" },
  { keys: "N", description: "New folder", category: "Folders", scope: "folders" },

  // Report actions
  { keys: "Ctrl + S", description: "Save report", category: "Report", scope: "global" },
  { keys: "Ctrl + P", description: "Print / PDF export", category: "Report", scope: "global" },
  { keys: "Ctrl + E", description: "Export report", category: "Report", scope: "global" },
];

interface KeyboardCheatsheetProps {
  isOpen: boolean;
  onClose: () => void;
}

export function KeyboardCheatsheet({ isOpen, onClose }: KeyboardCheatsheetProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);

  // Group shortcuts by category
  const grouped = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    const filtered = query
      ? ALL_SHORTCUTS.filter(
          (s) =>
            s.description.toLowerCase().includes(query) ||
            s.keys.toLowerCase().includes(query) ||
            s.category.toLowerCase().includes(query)
        )
      : ALL_SHORTCUTS;

    return filtered.reduce((acc, sc) => {
      if (!acc[sc.category]) acc[sc.category] = [];
      acc[sc.category].push(sc);
      return acc;
    }, {} as Record<string, Shortcut[]>);
  }, [searchQuery]);

  const totalShortcuts = useMemo(
    () => Object.values(grouped).reduce((sum, arr) => sum + arr.length, 0),
    [grouped]
  );

  // Focus search on open
  useEffect(() => {
    if (isOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSearchQuery("");
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedIndex(0);
      const timer = setTimeout(() => searchRef.current?.focus(), 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, totalShortcuts - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      }
    };

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isOpen, totalShortcuts]);

  // Close on escape
  useHotkeys("escape", onClose, { enabled: isOpen, scope: "cheatsheet" });

  if (!isOpen) return null;

  let globalIdx = 0;

  return (
    <div className="cheatsheet-overlay" onClick={onClose}>
      <div className="cheatsheet-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Keyboard shortcuts">
        <div className="cheatsheet-header">
          <h2>⌨️ Keyboard Shortcuts</h2>
          <button className="cheatsheet-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="cheatsheet-search">
          <span className="cheatsheet-search-icon">🔍</span>
          <input
            ref={searchRef}
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setSelectedIndex(0);
            }}
            placeholder="Search shortcuts..."
            className="cheatsheet-search-input"
            autoComplete="off"
            spellCheck={false}
          />
          <kbd className="cheatsheet-kbd">?</kbd>
        </div>

        <div className="cheatsheet-body" role="listbox">
          {Object.entries(grouped).length === 0 ? (
            <div className="cheatsheet-empty">
              <p>No shortcuts found</p>
              <span>Try a different search term</span>
            </div>
          ) : (
            Object.entries(grouped).map(([category, shortcuts]) => (
              <div key={category} className="cheatsheet-group">
                <h3 className="cheatsheet-category">{category}</h3>
                <div className="cheatsheet-list">
                  {shortcuts.map((sc) => {
                    const idx = globalIdx++;
                    const selected = idx === selectedIndex;
                    return (
                      <div
                        key={sc.keys + sc.description}
                        className={"cheatsheet-item" + (selected ? " cheatsheet-selected" : "")}
                        role="option"
                        aria-selected={selected}
                      >
                        <span className="cheatsheet-desc">{sc.description}</span>
                        <kbd className="cheatsheet-keys">{sc.keys}</kbd>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="cheatsheet-footer">
          <span>
            <kbd>↑</kbd> <kbd>↓</kbd> Navigate
          </span>
          <span>
            <kbd>?</kbd> Toggle
          </span>
          <span>
            {ALL_SHORTCUTS.length} shortcuts
          </span>
        </div>
      </div>
    </div>
  );
}
