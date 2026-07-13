"use client";

import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";

type Theme = "light" | "dark" | "system";

const THEME_SEQUENCE: Theme[] = ["system", "dark", "light"];

const THEME_LABELS: Record<Theme, string> = {
  light: "Light mode",
  dark: "Dark mode",
  system: "System theme",
};

const THEME_ICONS: Record<Theme, string> = {
  light: "☀️",
  dark: "🌙",
  system: "🖥️",
};

const subscribeToHydration = () => () => undefined;
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

function normalizeTheme(theme: string | undefined): Theme {
  return theme === "light" || theme === "dark" || theme === "system" ? theme : "system";
}

function getNextTheme(theme: Theme): Theme {
  const currentIndex = THEME_SEQUENCE.indexOf(theme);
  return THEME_SEQUENCE[(currentIndex + 1) % THEME_SEQUENCE.length];
}

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(
    subscribeToHydration,
    getClientSnapshot,
    getServerSnapshot,
  );

  if (!mounted) {
    return <div className="h-9 w-9" aria-hidden="true" />;
  }

  const currentTheme = normalizeTheme(theme);
  const nextTheme = getNextTheme(currentTheme);
  const accessibleLabel = `${THEME_LABELS[currentTheme]}; switch to ${THEME_LABELS[nextTheme].toLowerCase()}`;

  return (
    <button
      type="button"
      onClick={() => setTheme(nextTheme)}
      title={accessibleLabel}
      aria-label={accessibleLabel}
      className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-base transition-colors hover:bg-slate-200"
    >
      <span aria-hidden="true">{THEME_ICONS[currentTheme]}</span>
    </button>
  );
}
