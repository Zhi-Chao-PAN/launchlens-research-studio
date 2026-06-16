"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useLocale } from "@/lib/i18n/LocaleProvider";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { t } = useLocale();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    // Console-friendly trace; in production a future round can ship this to
    // a logging endpoint similar to /api/vitals.
    // eslint-disable-next-line no-console
    console.error("[global-error]", error);
    // Best-effort: also POST to /api/vitals so the breadcrumb shows up in
    // logs alongside web vitals during local dev.
    try {
      const blob = JSON.stringify({
        name: "client-error",
        message: error.message,
        stack: error.stack,
        digest: error.digest,
        ts: Date.now(),
      });
      if (typeof navigator !== "undefined" && "sendBeacon" in navigator) {
        navigator.sendBeacon("/api/vitals", blob);
      }
    } catch {}
  }, [error]);

  const copyTrace = async () => {
    try {
      const trace = [
        "Message: " + error.message,
        "Digest: " + (error.digest ?? "n/a"),
        "Stack:",
        error.stack ?? "(no stack)",
      ].join("\n");
      await navigator.clipboard.writeText(trace);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore — clipboard may be unavailable
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="max-w-md w-full bg-white rounded-2xl border border-slate-200 shadow-sm p-8 text-center">
        <div className="text-5xl mb-4" aria-hidden>⚠️</div>
        <h1 className="text-2xl font-bold text-slate-800 mb-2">{t("crash.title")}</h1>
        <p className="text-slate-600 mb-6">{t("crash.body")}</p>
        {error.digest && (
          <p className="text-xs text-slate-400 font-mono mb-4">
            Error ID: {error.digest}
          </p>
        )}
        <div className="flex flex-col sm:flex-row gap-2 justify-center">
          <button
            onClick={reset}
            className="px-4 py-2 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 transition-colors"
          >
            {t("crash.tryAgain")}
          </button>
          <Link
            href="/"
            className="px-4 py-2 bg-slate-100 text-slate-700 font-medium rounded-lg hover:bg-slate-200 transition-colors"
          >
            {t("crash.goHome")}
          </Link>
          <button
            onClick={copyTrace}
            className="px-4 py-2 bg-white border border-slate-200 text-slate-700 font-medium rounded-lg hover:bg-slate-50 transition-colors"
          >
            {copied ? t("crash.copied") : t("crash.copyTrace")}
          </button>
        </div>
      </div>
    </div>
  );
}
