/* eslint-disable react-hooks/exhaustive-deps, react-hooks/set-state-in-effect, react-hooks/immutability, react-hooks/preserve-manual-memoization */
"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  translate as translateFn,
  type DictionaryKey,
  type Locale,
} from "./dictionaries";

interface LocaleContextValue {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: DictionaryKey | string, fallbackOrParams?: string | Record<string, string | number>, params?: Record<string, string | number>) => string;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);
const STORAGE_KEY = "ll.locale";

function detectInitialLocale(): Locale {
  if (typeof window === "undefined") return DEFAULT_LOCALE;
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored && (SUPPORTED_LOCALES as readonly string[]).includes(stored)) {
    return stored as Locale;
  }
  const nav = window.navigator.language;
  if (nav?.startsWith("zh")) return "zh-CN";
  if (nav?.startsWith("ja")) return "ja";
  // R203: Korean was fully translated but never auto-detected, so a
  // Korean-locale browser fell back to English. Match ko now.
  if (nav?.startsWith("ko")) return "ko";
  return DEFAULT_LOCALE;
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);

  useEffect(() => {
    setLocaleState(detectInitialLocale());
  }, []);

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.lang = locale;
    }
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, next);
    }
  }, []);

  const t = useCallback(
    (key: DictionaryKey | string, fallbackOrParams?: string | Record<string, string | number>, maybeParams?: Record<string, string | number>) => {
      const fallback = typeof fallbackOrParams === "string" ? fallbackOrParams : undefined;
      const params = maybeParams ?? (typeof fallbackOrParams === "object" ? fallbackOrParams : undefined);
      return translateFn(locale, key, fallback, params);
    },
    [locale],
  );

  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) {
    // Fallback for components rendered outside the provider during tests.
    return {
      locale: DEFAULT_LOCALE,
      setLocale: () => {},
      t: (key: DictionaryKey | string, fallbackOrParams?: string | Record<string, string | number>, maybeParams?: Record<string, string | number>) => {
        const fallback = typeof fallbackOrParams === "string" ? fallbackOrParams : undefined;
        const params = maybeParams ?? (typeof fallbackOrParams === "object" ? fallbackOrParams : undefined);
        return translateFn(DEFAULT_LOCALE, key, fallback, params);
      },
    };
  }
  return ctx;
}
