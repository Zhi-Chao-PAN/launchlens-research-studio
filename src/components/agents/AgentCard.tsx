"use client";

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

function AgentCardImpl({ agentId, state, isActive, onClick, error }: AgentCardProps) {
  const { t } = useLocale();
  const baseMeta = AGENT_METADATA[agentId];
  const meta = {
    ...baseMeta,
    name: t(("agent." + agentId + ".name") as any, baseMeta.name),
    description: t(("agent." + agentId + ".description") as any, baseMeta.description),
  };

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
              className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${statusColors[state.status] || statusColors.idle}`}
            >
              {error ? t("agent.status.error") : t(("agent.status." + state.status) as any, statusLabel[state.status] || state.status)}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5 truncate">{meta.description}</p>

          {state.status === "running" && (
            <div className="mt-2">
              <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all duration-300"
                  style={{ width: `${bucketProgress(state.progress)}%` }}
                />
              </div>
              <p className="text-xs text-slate-500 mt-1 truncate">{state.currentStep}</p>
            </div>
          )}

          {state.status === "done" && !error && (
            <div className="mt-2">
              <div className="h-1.5 bg-emerald-200 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500 w-full" />
              </div>
            </div>
          )}

          {error && (
            <p className="text-xs text-rose-600 mt-1.5 truncate" title={error}>
              {error}
            </p>
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
    prev.onClick === next.onClick &&
    prev.state.status === next.state.status &&
    bucketProgress(prev.state.progress) === bucketProgress(next.state.progress) &&
    prev.state.currentStep === next.state.currentStep
  );
});
AgentCard.displayName = "AgentCard";
