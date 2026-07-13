/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { memo } from "react";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import type { AgentId, AgentState } from "@/lib/schema/research-schema";
import { bucketProgress } from "@/lib/perf/perf-utils";
import { AGENT_METADATA } from "@/lib/schema/research-schema";

interface AgentCardProps {
  agentId: AgentId;
  state: Pick<AgentState, "status" | "progress" | "currentStep" | "degraded" | "degradedReason">;
  isActive?: boolean;
  onClick?: () => void;
  error?: string;
  /** When the enclosing session has been cancelled, hide per-agent error details
   *  so the UI does not flash spurious red badges for user-initiated cancels. */
  cancelled?: boolean;
}

/** Map a degradation reason to a human-readable tooltip so the user can tell
 *  a bad API key from a weak-model validation failure from a network blip. */
function degradedTooltip(reason: AgentState["degradedReason"]): string {
  switch (reason) {
    case "breaker_open":
      return "Real provider circuit breaker open — showing demo data";
    case "http_error":
      return "Real provider returned an HTTP error (bad key, rate limit, server error) — showing demo data";
    case "network_error":
      return "Could not reach the real provider (network/DNS/timeout) — showing demo data";
    case "parse_error":
      return "Real provider returned a non-JSON response — showing demo data";
    case "validation_error":
      return "Real provider output failed schema validation — showing demo data";
    case "empty_response":
      return "Real provider returned an empty response — showing demo data";
    case "provider_fallback":
    default:
      return "Real provider failed — showing demo data";
  }
}

const statusColors: Record<string, string> = {
  idle: "bg-slate-100 text-slate-500",
  running: "bg-amber-100 text-amber-700",
  done: "bg-emerald-100 text-emerald-700",
  error: "bg-rose-100 text-rose-700",
  stopped: "bg-slate-200 text-slate-700",
};

const statusLabel: Record<string, string> = {
  idle: "Waiting",
  running: "Researching",
  done: "Complete",
  error: "Error",
  stopped: "Stopped",
};

function AgentCardImpl({ agentId, state, isActive, onClick, error, cancelled }: AgentCardProps) {
  const { t } = useLocale();
  const baseMeta = AGENT_METADATA[agentId];
  const meta = {
    ...baseMeta,
    name: t(("agent." + agentId + ".name") as any, baseMeta.name),
    description: t(("agent." + agentId + ".description") as any, baseMeta.description),
  };

  // Suppress per-agent error chrome on cancelled sessions — cancels are an
  // explicit user action, not a failure.
  const showError = !!error && !cancelled && state.status !== "idle";
  const badgeStatus = showError
    ? "error"
    : cancelled && state.status !== "done"
      ? "stopped"
      : state.status;

  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-3 rounded-lg border transition-colors ${
        isActive
          ? "border-slate-900 bg-slate-50"
          : "border-slate-200 bg-white hover:border-slate-400 hover:bg-slate-50"
      }`}
      aria-pressed={isActive}
    >
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-md bg-slate-100 flex items-center justify-center text-base flex-shrink-0" aria-hidden>
          {meta.icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-semibold text-slate-800 text-sm truncate">{meta.name}</h3>
            <div className="flex items-center gap-1 flex-shrink-0">
              {/* R203/R204: when the real provider failed (or the circuit
                  breaker was open) and the output is illustrative mock data,
                  surface a small amber badge so the user knows the numbers
                  are a demo, not authoritative. R204 added finer-grained
                  reasons (http_error / validation_error / ...) reported by
                  the provider's onFallback callback. */}
              {state.degraded && (
                <span
                  className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-amber-100 text-amber-700 border border-amber-200"
                  title={degradedTooltip(state.degradedReason)}
                >
                  {t("agent.degraded" as any, "demo")}
                </span>
              )}
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded font-semibold uppercase tracking-wide flex-shrink-0 ${statusColors[badgeStatus] || statusColors.idle}`}
                style={badgeStatus === "running" ? { animation: 'status-pulse-ring 2s ease-in-out infinite' } : undefined}
              >
                {showError ? t("agent.status.error") : t(("agent.status." + badgeStatus) as any, statusLabel[badgeStatus] || badgeStatus)}
              </span>
            </div>
          </div>
          <p className="text-xs text-slate-500 mt-0.5 truncate">{meta.description}</p>

          {badgeStatus === "running" && (
            <div className="mt-2" style={{ animation: 'step-fade-in 0.25s ease-out' }}>
              <div className="h-1 bg-slate-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-indigo-600 rounded-full transition-all duration-500 ease-out"
                  style={{
                    width: `${bucketProgress(state.progress)}%`,
                  }}
                />
              </div>
              <p
                key={state.currentStep}
                className="text-xs text-slate-500 mt-1 truncate"
                style={{ animation: 'step-fade-in 0.3s ease-out' }}
              >
                {state.currentStep}
              </p>
            </div>
          )}

          {badgeStatus === "done" && !error && (
            <div className="mt-2" style={{ animation: 'agent-pop 0.35s cubic-bezier(0.16, 1, 0.3, 1)' }}>
              <div className="h-1 bg-emerald-100 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500 w-full rounded-full" />
              </div>
            </div>
          )}

          {showError && (
            <div
              role="alert"
              className="text-xs text-rose-700 mt-1.5 rounded-md bg-rose-50 border border-rose-200 px-2 py-1 break-words"
              style={{ animation: 'agent-shake 0.4s ease-in-out' }}
            >
              <span className="font-medium">Error: </span>
              <span className="text-rose-600">{error}</span>
            </div>
          )}
        </div>
      </div>
    </button>
  );
}

export const AgentCard = memo(AgentCardImpl, (prev, next) => {
  return (
    prev.agentId === next.agentId &&
    prev.isActive === next.isActive &&
    prev.error === next.error &&
    prev.cancelled === next.cancelled &&
    prev.onClick === next.onClick &&
    prev.state.status === next.state.status &&
    bucketProgress(prev.state.progress) === bucketProgress(next.state.progress) &&
    prev.state.currentStep === next.state.currentStep &&
    // R204: the "demo data" badge depends on these, so they must trigger a
    // re-render when the engine flips them after a provider fallback.
    prev.state.degraded === next.state.degraded &&
    prev.state.degradedReason === next.state.degradedReason
  );
});
AgentCard.displayName = "AgentCard";
