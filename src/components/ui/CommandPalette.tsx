"use client";

import { useState, useEffect, useRef } from "react";
import { useHotkey, getCommands, subscribeToCommands, type Command } from "@/lib/hooks/use-hotkey";

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CommandPalette({ isOpen, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [commands, setCommands] = useState<Command[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  // Refresh commands when they change
  useEffect(() => {
    const cancelled = false;
    void Promise.resolve().then(() => {
      if (!cancelled) setCommands(getCommands());
    });
    return subscribeToCommands(() => {
      if (!cancelled) setCommands(getCommands());
    });
  }, []);

  // Filter commands by query
  const filtered = commands.filter((cmd) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return (
      cmd.label.toLowerCase().includes(q) ||
      cmd.description?.toLowerCase().includes(q) ||
      cmd.category?.toLowerCase().includes(q)
    );
  });

  // Group by category
  const grouped = filtered.reduce((acc, cmd) => {
    const cat = cmd.category || "其他";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(cmd);
    return acc;
  }, {} as Record<string, Command[]>);

  // Reset selection when filter changes
  useEffect(() => {
    void Promise.resolve().then(() => setSelectedIndex(0));
  }, [query]);

  // Reset query on close
  useEffect(() => {
    if (!isOpen) {
      void Promise.resolve().then(() => {
        setQuery("");
        setSelectedIndex(0);
      });
    }
  }, [isOpen]);

  // Focus input on open
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && filtered.length > 0) {
      e.preventDefault();
      const cmd = filtered[selectedIndex];
      if (cmd) {
        cmd.action();
        onClose();
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  }

  // Global close on Escape (when input not focused)
  useHotkey(
    { key: "Escape", handler: onClose, ignoreInputs: false },
    [isOpen, onClose],
  );

  if (!isOpen) return null;

  // Flat list for index calculation
  const flatList: { cmd: Command; category: string }[] = [];
  for (const [cat, cmds] of Object.entries(grouped)) {
    for (const cmd of cmds) {
      flatList.push({ cmd, category: cat });
    }
  }

  let flatIndex = 0;

  return (
    <div className="cmd-palette-overlay" onClick={onClose}>
      <div className="cmd-palette" onClick={(e) => e.stopPropagation()}>
        <div className="cmd-palette-input-wrap">
          <span className="cmd-palette-icon">🔍</span>
          <input
            ref={inputRef}
            type="text"
            className="cmd-palette-input"
            placeholder="输入命令..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            autoComplete="off"
          />
          <kbd className="cmd-palette-kbd">ESC</kbd>
        </div>

        <div className="cmd-palette-list">
          {Object.entries(grouped).length === 0 ? (
            <div className="cmd-palette-empty">没有匹配的命令</div>
          ) : (
            Object.entries(grouped).map(([category, cmds]) => (
              <div key={category} className="cmd-palette-group">
                <div className="cmd-palette-group-title">{category}</div>
                {cmds.map((cmd) => {
                  const currentIndex = flatIndex++;
                  const isSelected = currentIndex === selectedIndex;
                  
                  return (
                    <button
                      key={cmd.id}
                      className={`cmd-palette-item ${isSelected ? "selected" : ""}`}
                      onClick={() => {
                        cmd.action();
                        onClose();
                      }}
                      onMouseEnter={() => setSelectedIndex(currentIndex)}
                    >
                      <div className="cmd-palette-item-left">
                        {cmd.icon && <span className="cmd-palette-item-icon">{cmd.icon}</span>}
                        <div className="cmd-palette-item-text">
                          <div className="cmd-palette-item-label">{cmd.label}</div>
                          {cmd.description && (
                            <div className="cmd-palette-item-desc">{cmd.description}</div>
                          )}
                        </div>
                      </div>
                      {cmd.shortcut && (
                        <kbd className="cmd-palette-item-shortcut">{cmd.shortcut}</kbd>
                      )}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
