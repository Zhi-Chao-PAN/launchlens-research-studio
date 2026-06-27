"use client";

import { useState } from "react";
import { useHotkey } from "@/lib/hooks/use-hotkey";

interface Shortcut {
  keys: string;
  description: string;
  category: string;
}

const GLOBAL_SHORTCUTS: Shortcut[] = [
  { keys: "⌘ / Ctrl + K", description: "打开命令面板", category: "全局" },
  { keys: "?", description: "显示快捷键帮助", category: "全局" },
  { keys: "Esc", description: "关闭弹窗 / 面板", category: "全局" },
  { keys: "G + H", description: "返回首页", category: "导航" },
  { keys: "G + S", description: "历史记录", category: "导航" },
  { keys: "G + T", description: "模板管理", category: "导航" },
  { keys: "G + B", description: "批量研究", category: "导航" },
  { keys: "/", description: "聚焦搜索框", category: "全局" },
];

export function ShortcutsHelp({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  // Group shortcuts by category
  const grouped = GLOBAL_SHORTCUTS.reduce((acc, sc) => {
    if (!acc[sc.category]) acc[sc.category] = [];
    acc[sc.category].push(sc);
    return acc;
  }, {} as Record<string, Shortcut[]>);

  if (!isOpen) return null;

  return (
    <div className="shortcuts-overlay" onClick={onClose}>
      <div className="shortcuts-modal" onClick={(e) => e.stopPropagation()}>
        <div className="shortcuts-header">
          <h2>⌨️ 键盘快捷键</h2>
          <button className="shortcuts-close" onClick={onClose}>✕</button>
        </div>
        <div className="shortcuts-grid">
          {Object.entries(grouped).map(([category, shortcuts]) => (
            <div key={category} className="shortcuts-group">
              <h3 className="shortcuts-category">{category}</h3>
              <div className="shortcuts-list">
                {shortcuts.map((sc) => (
                  <div key={sc.keys} className="shortcut-item">
                    <span className="shortcut-desc">{sc.description}</span>
                    <kbd className="shortcut-keys">{sc.keys}</kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="shortcuts-footer">
          按 <kbd>⌘K</kbd> 打开命令面板，快速跳转到任意功能
        </div>
      </div>
    </div>
  );
}

// Hook to toggle shortcuts help with ? key
export function useShortcutsHelp() {
  const [isOpen, setIsOpen] = useState(false);

  useHotkey(
    { key: "?", handler: () => setIsOpen(true), ignoreInputs: true },
    [],
  );

  return { isOpen, open: () => setIsOpen(true), close: () => setIsOpen(false) };
}
