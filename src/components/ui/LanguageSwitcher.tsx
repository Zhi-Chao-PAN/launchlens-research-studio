"use client";

import { useLocale } from "@/lib/i18n/LocaleProvider";
import { LOCALE_LABELS, SUPPORTED_LOCALES, type Locale } from "@/lib/i18n/dictionaries";

export function LanguageSwitcher() {
  const { locale, setLocale, t } = useLocale();
  return (
    <label className="inline-flex items-center gap-1.5 text-xs text-slate-500">
      <span className="sr-only">{t("language.label")}</span>
      <select
        id="language-switcher"
        name="language"
        aria-label={t("language.label")}
        value={locale}
        onChange={(e) => setLocale(e.target.value as Locale)}
        className="bg-transparent border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-700 hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-300"
      >
        {SUPPORTED_LOCALES.map((l) => (
          <option key={l} value={l}>{LOCALE_LABELS[l]}</option>
        ))}
      </select>
    </label>
  );
}
