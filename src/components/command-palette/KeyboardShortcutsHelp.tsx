"use client";

import { useState } from "react";
import { useHotkeys } from "@/lib/hooks/use-hotkeys";

interface Shortcut {
  keys: string;
  description: string;
}

interface ShortcutsModalProps {
  shortcuts: Shortcut[];
  title?: string;
}

export function KeyboardShortcutsHelp({ shortcuts, title = "Keyboard Shortcuts" }: ShortcutsModalProps) {
  const [open, setOpen] = useState(false);

  useHotkeys("?", () => setOpen((v) => !v), {
    ignoreInputs: true,
    scope: "global",
  });

  useHotkeys("escape", () => setOpen(false), {
    enabled: open,
  });

  if (!open) return null;

  return (
    <div className="kb-help-overlay" onClick={() => setOpen(false)}>
      <div className="kb-help-modal" onClick={(e) => e.stopPropagation()}>
        <div className="kb-help-header">
          <h3>{title}</h3>
          <button className="kb-help-close" onClick={() => setOpen(false)}>
            ×
          </button>
        </div>
        <div className="kb-help-body">
          {shortcuts.map((s, i) => (
            <div key={i} className="kb-help-row">
              <span className="kb-help-desc">{s.description}</span>
              <kbd className="kb-help-keys">{s.keys}</kbd>
            </div>
          ))}
        </div>
        <div className="kb-help-footer">
          Press <kbd>?</kbd> to toggle this help
        </div>
      </div>
    </div>
  );
}
