"use client";

import { useEffect, useState } from "react";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { fetchWithCsrf } from "@/lib/api/csrf-client";

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

interface ProbeResult {
  ok: boolean;
  providerId: string;
  displayName: string;
  isMock: boolean;
  reason?: string;
  note?: string;
  durationMs?: number;
}

type ProbeState =
  | { status: "idle" }
  | { status: "testing" }
  | { status: "done"; result: ProbeResult }
  | { status: "error"; message: string };

// Surfaces the live provider identity and breaker state in a compact pill.
// Reads from /api/health on mount and on a slow polling interval. The pill
// quietly hides until data is available so it never obstructs first paint.
//
// R208: added a "test connection" action that POSTs /api/provider/test so a
// user can confirm their real provider (key/base URL/model) actually produces
// valid structured output without launching a full 6-agent session. The probe
// returns the precise failure reason (http_error / validation_error / ...) so
// the user knows what to fix.
export function ProviderPill() {
  const { t } = useLocale();
  const [health, setHealth] = useState<HealthPayload | null>(null);
  const [probe, setProbe] = useState<ProbeState>({ status: "idle" });

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
  const breaker = health.breakers?.["provider:" + health.provider.id];
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

  const runProbe = async () => {
    setProbe({ status: "testing" });
    try {
      const res = await fetchWithCsrf("/api/provider/test", { method: "POST" });
      const json = (await res.json()) as ProbeResult & { error?: string };
      if (!res.ok) {
        setProbe({ status: "error", message: json.error || ("HTTP " + res.status) });
        return;
      }
      setProbe({ status: "done", result: json });
    } catch (e) {
      setProbe({ status: "error", message: e instanceof Error ? e.message : "Network error" });
    }
  };

  // Probe result tone + message (only shown after a test run).
  const probeTone =
    probe.status === "done"
      ? probe.result.ok
        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
        : "bg-rose-50 text-rose-700 border-rose-200"
      : probe.status === "error"
        ? "bg-rose-50 text-rose-700 border-rose-200"
        : "bg-slate-50 text-slate-600 border-slate-200";
  const probeMessage =
    probe.status === "done"
      ? probe.result.ok
        ? (probe.result.isMock
            ? t("provider.probe.mockOk", "Mock provider — no network needed")
            : t("provider.probe.ok", "Connected ({ms}ms)", { ms: String(probe.result.durationMs ?? 0) }))
        : t("provider.probe.failed", "Failed: {reason}", { reason: probe.result.reason || "unknown" })
      : probe.status === "error"
        ? t("provider.probe.error", "Error: {message}", { message: probe.message })
        : "";

  return (
    <span className="hidden md:inline-flex items-center gap-1.5">
      <span
        className={"inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full border " + tone}
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
      {/* R208: test-connection button. Always available so users can verify
          their provider config without launching a full research session. */}
      <button
        type="button"
        onClick={runProbe}
        disabled={probe.status === "testing"}
        title={t("provider.probe.test", "Test provider connection")}
        aria-label={t("provider.probe.test", "Test provider connection")}
        className="inline-flex items-center text-[11px] font-medium px-2 py-1 rounded-full border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-800 disabled:opacity-50 disabled:cursor-wait transition-colors"
      >
        {probe.status === "testing"
          ? t("provider.probe.testing", "Testing…")
          : t("provider.probe.test", "Test")}
      </button>
      {(probe.status === "done" || probe.status === "error") && (
        <span
          className={"inline-flex items-center text-[10px] px-2 py-0.5 rounded-full border " + probeTone}
          role="status"
          title={probeMessage}
        >
          {probeMessage}
        </span>
      )}
    </span>
  );
}
