"use client";

import { useEffect, useState } from "react";
import { ShortcutsHelp } from "./ShortcutsHelp";
import { registerCommands } from "@/lib/hooks/use-hotkey";
import { useRouter, usePathname } from "next/navigation";

/**
 * Registers global (site-wide) keyboard commands.
 * Mount this in the root layout or a high-level component.
 */
export function GlobalCommands() {
  const router = useRouter();
  const pathname = usePathname();
  const [showShortcuts, setShowShortcuts] = useState(false);

  useEffect(() => {
    const cleanup = registerCommands([
      {
        id: "nav-home",
        label: "返回首页",
        description: "回到研究首页",
        icon: "🏠",
        shortcut: "G H",
        category: "导航",
        action: () => router.push("/"),
      },
      {
        id: "nav-history",
        label: "历史记录",
        description: "查看所有研究历史",
        icon: "📜",
        shortcut: "G H",
        category: "导航",
        action: () => router.push("/history"),
      },
      {
        id: "nav-templates",
        label: "模板管理",
        description: "管理研究模板",
        icon: "📋",
        category: "导航",
        action: () => router.push("/templates"),
      },
      {
        id: "nav-batch",
        label: "批量研究",
        description: "批量运行多个研究",
        icon: "⚡",
        category: "导航",
        action: () => router.push("/batch"),
      },
      {
        id: "nav-compare",
        label: "研究对比",
        description: "对比两个研究结果",
        icon: "⚖️",
        category: "导航",
        action: () => router.push("/compare"),
      },
      {
        id: "nav-admin",
        label: "管理后台",
        description: "系统管理和监控",
        icon: "🔧",
        category: "导航",
        action: () => router.push("/admin"),
        available: () => {
          if (typeof window === "undefined") return pathname.startsWith("/admin");
          return (
            pathname.startsWith("/admin") ||
            !!localStorage.getItem("admin_token")
          );
        },
      },
      {
        id: "cmd-palette",
        label: "命令面板",
        description: "打开命令面板",
        icon: "⌘",
        shortcut: "⌘K",
        category: "工具",
        action: () => {
          // Already open, no-op
        },
      },
      {
        id: "shortcuts-help",
        label: "键盘快捷键",
        description: "查看所有快捷键",
        icon: "⌨️",
        shortcut: "?",
        category: "工具",
        action: () => setShowShortcuts(true),
      },
    ]);

    return cleanup;
  }, [router, pathname]);

  // Render shortcuts modal
  return (
    <ShortcutsHelp isOpen={showShortcuts} onClose={() => setShowShortcuts(false)} />
  );
}
