"use client";

import type { AgentId, AgentState } from "@/lib/schema/research-schema";
import { AGENT_METADATA } from "@/lib/schema/research-schema";

interface AgentCardProps {
  agentId: AgentId;
  state: AgentState;
  isActive?: boolean;
  onClick?: () => void;
}

export function AgentCard({ agentId, state, isActive, onClick }: AgentCardProps) {
  const meta = AGENT_METADATA[agentId];
  const statusColors: Record<string, string> = {
    idle: "bg-slate-100 text-slate-500",
    running: "bg-amber-100 text-amber-700",
    done: "bg-emerald-100 text-emerald-700",
    error: "bg-rose-100 text-rose-700",
  };

  const statusLabel: Record<string, string> = {
    idle: "Waiting",
    running: "Researching...",
    done: "Complete",
    error: "Error",
  };

  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-4 rounded-xl border-2 transition-all ${
        isActive
          ? "border-indigo-500 bg-indigo-50 shadow-md"
          : "border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm"
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="text-2xl">{meta.icon}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-semibold text-slate-800 text-sm">{meta.name}</h3>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColors[state.status]}`}>
              {statusLabel[state.status]}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">{meta.description}</p>

          {state.status === "running" && (
            <div className="mt-2">
              <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all duration-300"
                  style={{ width: `${state.progress}%` }}
                />
              </div>
              <p className="text-xs text-slate-500 mt-1 truncate">{state.currentStep}</p>
            </div>
          )}

          {state.status === "done" && (
            <div className="mt-2">
              <div className="h-1.5 bg-emerald-200 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500 w-full" />
              </div>
            </div>
          )}
        </div>
      </div>
    </button>
  );
}