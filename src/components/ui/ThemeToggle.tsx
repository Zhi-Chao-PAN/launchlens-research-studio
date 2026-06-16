/* eslint-disable react-hooks/exhaustive-deps, react-hooks/set-state-in-effect, react-hooks/immutability, react-hooks/preserve-manual-memoization */
﻿"use client";

import { useEffect, useState, useCallback } from "react";

type Theme = "light" | "dark" | "system";

const STORAGE_KEY = "launchlens:theme";

function getSystemTheme(): "light" | "dark" {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(theme: Theme): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const resolved = theme === "system" ? getSystemTheme() : theme;
  if (resolved === "dark") {
    root.setAttribute("data-theme", "dark");
  } else {
    root.removeAttribute("data-theme");
  }
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("system");
  const [mounted, setMounted] = useState(false);

  // Hydrate from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY) as Theme | null;
      const initial: Theme = stored === "light" || stored === "dark" || stored === "system" ? stored : "system";
      setTheme(initial);
      applyTheme(initial);
    } catch {
      // ignore
    }
    setMounted(true);
  }, []);

  // Listen for system theme changes when in system mode
  useEffect(() => {
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => applyTheme("system");
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [theme]);

  const cycle = useCallback(() => {
    setTheme((prev) => {
      const next: Theme = prev === "light" ? "dark" : prev === "dark" ? "system" : "light";
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // ignore
      }
      applyTheme(next);
      return next;
    });
  }, []);

  if (!mounted) {
    // Render placeholder to avoid layout shift
    return <div className="w-9 h-9" />;
  }

  const label = theme === "light" ? "Light mode" : theme === "dark" ? "Dark mode" : "System theme";
  const icon = theme === "light" ? "☀️" : theme === "dark" ? "🌙" : "🖥️";

  return (
    <button
      onClick={cycle}
      title={label + " (click to cycle)"}
      aria-label={label}
      className="w-9 h-9 rounded-lg flex items-center justify-center bg-slate-100 hover:bg-slate-200 transition-colors text-base"
    >
      <span aria-hidden>{icon}</span>
    </button>
  );
}
