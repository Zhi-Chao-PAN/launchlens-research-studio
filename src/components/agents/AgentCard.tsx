/* eslint-disable @typescript-eslint/no-explicit-any */
﻿"use client";

import { memo } from "react";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import type { AgentId, AgentState } from "@/lib/schema/research-schema";
import { bucketProgress } from "@/lib/perf/perf-utils";
import { AGENT_METADATA } from "@/lib/schema/research-schema";

interface AgentCardProps {
  agentId: AgentId;
  state: Pick<AgentState, "status" | "progress" | "currentStep">;
  isActive?: boolean;
  onClick?: () => void;
  error?: string;
  /** When the enclosing session has been cancelled, hide per-agent error details
   *  so the UI does not flash spurious red badges for user-initiated cancels. */
  cancelled?: boolean;
}

const statusColors: Record<string, string> = {
  idle: "bg-slate-100 text-slate-500",
  running: "bg-amber-100 text-amber-700",
  done: "bg-emerald-100 text-emerald-700",
  error: "bg-rose-100 text-rose-700",
};

const statusLabel: Record<string, string> = {
  idle: "Waiting",
  running: "Researching",
  done: "Complete",
  error: "Error",
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
  const badgeStatus = showError ? "error" : state.status;

  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-4 rounded-xl border-2 transition-all ${
        isActive
          ? "border-indigo-500 bg-indigo-50 shadow-md"
          : "border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm"
      }`}
      aria-pressed={isActive}
    >
      <div className="flex items-start gap-3">
        <div className="text-2xl flex-shrink-0" aria-hidden>
          {meta.icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-semibold text-slate-800 text-sm truncate">{meta.name}</h3>
            <span
              className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${statusColors[badgeStatus] || statusColors.idle}`}
              style={badgeStatus === "running" ? { animation: 'status-pulse-ring 2s ease-in-out infinite' } : undefined}
            >
              {showError ? t("agent.status.error") : t(("agent.status." + badgeStatus) as any, statusLabel[badgeStatus] || badgeStatus)}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5 truncate">{meta.description}</p>

          {state.status === "running" && (
            <div className="mt-2" style={{ animation: 'step-fade-in 0.25s ease-out' }}>
              <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500 ease-out"
                  style={{
                    width: `${bucketProgress(state.progress)}%`,
                    background: 'linear-gradient(90deg, #6366f1, #8b5cf6, #a78bfa, #8b5cf6, #6366f1)',
                    backgroundSize: '200% 100%',
                    animation: 'progress-shimmer 1.8s ease-in-out infinite',
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

          {state.status === "done" && !error && (
            <div className="mt-2" style={{ animation: 'agent-pop 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)' }}>
              <div className="h-1.5 bg-emerald-200 rounded-full overflow-hidden">
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
    prev.state.currentStep === next.state.currentStep
  );
});
AgentCard.displayName = "AgentCard";
