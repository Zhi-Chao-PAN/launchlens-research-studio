"use client";

import Link from "next/link";
import { useLocale } from "@/lib/i18n/LocaleProvider";

export default function NotFound() {
  const { t } = useLocale();
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-white to-indigo-50 px-4">
      <div className="max-w-md w-full text-center">
        <div className="text-6xl mb-4" aria-hidden>🔍</div>
        <h1 className="text-3xl font-bold text-slate-800 mb-2">{t("notFound.title")}</h1>
        <p className="text-slate-600 mb-6">{t("notFound.body")}</p>
        <Link
          href="/"
          className="inline-block px-5 py-2.5 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 transition-colors"
        >
          {t("notFound.backHome")}
        </Link>
      </div>
    </div>
  );
}
