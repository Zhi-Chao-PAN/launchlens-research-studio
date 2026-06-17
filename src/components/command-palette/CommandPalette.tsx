"use client";

import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { useCommandPalette } from "./CommandPaletteContext";
import { rankCommands, loadCommandHistory, recordCommandUse, historyToMap } from "@/lib/utils/fuzzy-search";
import { useHotkeys } from "@/lib/hooks/use-hotkeys";

interface CommandPaletteProps {
  placeholder?: string;
}

export function CommandPalette({ placeholder = "Type a command or search..." }: CommandPaletteProps) {
  const { isOpen, closePalette, commands, runCommand } = useCommandPalette();
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [historyMap, setHistoryMap] = useState<Map<string, { id: string; count: number; lastUsed: number }>>(new Map());
  const inputRef = useRef<HTMLInputElement>(null);

  // All hooks BEFORE any early return
  useHotkeys("escape", closePalette, { enabled: isOpen, scope: "command-palette" });

  useEffect(() => {
    if (isOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setQuery("");
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedIndex(0);
      const timer = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Filter and rank commands
  const filtered = useMemo(() => {
    const ranked = rankCommands(commands, query, historyMap);
    return ranked.slice(0, 12);
  }, [query, commands, historyMap]);

  // Reset selection when filtered list changes
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedIndex(0);
  }, [filtered.length]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (filtered[selectedIndex]) {
          runCommand(filtered[selectedIndex].id);
        }
      }
    },
    [filtered, selectedIndex, runCommand]
  );

  // Group by category
  const grouped = useMemo(() => {
    const groups = new Map<string, typeof filtered>();
    for (const cmd of filtered) {
      if (!groups.has(cmd.category)) groups.set(cmd.category, []);
      groups.get(cmd.category)!.push(cmd);
    }
    return groups;
  }, [filtered]);

  const categoryLabels: Record<string, string> = {
    navigation: "Navigation",
    action: "Actions",
    setting: "Settings",
    template: "Templates",
  };

  // Early return AFTER all hooks
  if (!isOpen) return null;

  let globalIdx = 0;

  return (
    <div className="cmdpal-overlay" onClick={closePalette}>
      <div className="cmdpal-modal" onClick={(e) => e.stopPropagation()}>
        <div className="cmdpal-search">
          <span className="cmdpal-search-icon">??</span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className="cmdpal-input"
            autoComplete="off"
            spellCheck={false}
          />
          <kbd className="cmdpal-kbd">esc</kbd>
        </div>

        <div className="cmdpal-results">
          {filtered.length === 0 ? (
            <div className="cmdpal-empty">
              <p>No commands found</p>
              <span>Try a different search term</span>
            </div>
          ) : (
            Array.from(grouped.entries()).map(([category, cmds]) => (
              <div key={category} className="cmdpal-group">
                <div className="cmdpal-group-title">{categoryLabels[category] || category}</div>
                {cmds.map((cmd) => {
                  const idx = globalIdx++;
                  const isSelected = idx === selectedIndex;
                  return (
                    <button
                      key={cmd.id}
                      className={`cmdpal-item ${isSelected ? "selected" : ""}`}
                      onClick={() => runCommand(cmd.id)}
                      onMouseEnter={() => setSelectedIndex(idx)}
                    >
                      {cmd.icon && <span className="cmdpal-item-icon">{cmd.icon}</span>}
                      <div className="cmdpal-item-body">
                        <div className="cmdpal-item-label">{cmd.label}</div>
                        {cmd.description && (
                          <div className="cmdpal-item-desc">{cmd.description}</div>
                        )}
                      </div>
                      {cmd.shortcut && (
                        <kbd className="cmdpal-item-shortcut">{cmd.shortcut}</kbd>
                      )}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        <div className="cmdpal-footer">
          <span>
            <kbd>??</kbd> Navigate
          </span>
          <span>
            <kbd>?</kbd> Select
          </span>
          <span>
            <kbd>esc</kbd> Close
          </span>
        </div>
      </div>
    </div>
  );
}
