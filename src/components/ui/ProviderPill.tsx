"use client";

import { useEffect, useState } from "react";
import { useLocale } from "@/lib/i18n/LocaleProvider";

interface ProviderInfo {
  id: string;
  displayName: string;
  isMock: boolean;
  supportsStreaming: boolean;
}

interface HealthPayload {
  status: string;
  version: string;
  provider: ProviderInfo;
  breakers: Record<string, { failures: number; open: boolean; openedAt: number | null }>;
}

// Surfaces the live provider identity and breaker state in a compact pill.
// Reads from /api/health on mount and on a slow polling interval. The pill
// quietly hides until data is available so it never obstructs first paint.
export function ProviderPill() {
  const { t } = useLocale();
  const [health, setHealth] = useState<HealthPayload | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/health");
        if (!res.ok) return;
        const json = (await res.json()) as HealthPayload;
        if (!cancelled) setHealth(json);
      } catch {
        // ignore — pill stays hidden
      }
    };
    load();
    const interval = setInterval(load, 30_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  if (!health || !health.provider) return null;
  const breaker = health.breakers["provider:" + health.provider.id];
  const breakerOpen = !!breaker?.open;
  const isMock = health.provider.isMock;

  const tone = breakerOpen
    ? "bg-amber-100 text-amber-800 border-amber-200"
    : isMock
      ? "bg-slate-100 text-slate-600 border-slate-200"
      : "bg-emerald-100 text-emerald-700 border-emerald-200";

  const label = breakerOpen
    ? t("provider.breakerOpen", "Breaker open: " + health.provider.id)
    : isMock
      ? t("provider.mock", "Mock provider")
      : health.provider.displayName;

  return (
    <span
      className={"hidden md:inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full border " + tone}
      title={label + " (v" + health.version + ")"}
      role="status"
      aria-live="polite"
    >
      <span className={"w-1.5 h-1.5 rounded-full " + (breakerOpen ? "bg-amber-500" : isMock ? "bg-slate-400" : "bg-emerald-500")} />
      <span className="truncate max-w-[160px]">{label}</span>
      {health.provider.supportsStreaming && !breakerOpen && (
        <span className="text-[9px] uppercase tracking-wider text-current/70 ml-0.5" aria-hidden>
          {t("provider.streaming", "stream")}
        </span>
      )}
    </span>
  );
}
