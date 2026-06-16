"use client";

import type { AgentId, AgentOutput } from "@/lib/schema/research-schema";
import { AGENT_METADATA } from "@/lib/schema/research-schema";
import { MarketSizerReport } from "./sections/MarketSizerReport";
import { CompetitorAnalystReport } from "./sections/CompetitorAnalystReport";
import { PainDetectiveReport } from "./sections/PainDetectiveReport";
import { PricingScoutReport } from "./sections/PricingScoutReport";
import { ChannelScoutReport } from "./sections/ChannelScoutReport";
import { SynthesisReport } from "./sections/SynthesisReport";

interface ReportViewProps {
  activeAgent: AgentId;
  outputs: Record<AgentId, AgentOutput | null>;
  isLoading: boolean;
  onSwitchTab?: (agentId: AgentId) => void;
}

const AGENT_ORDER: AgentId[] = [
  "market-sizer",
  "competitor-analyst",
  "pain-detective",
  "pricing-scout",
  "channel-scout",
  "synthesis",
];

export function ReportView({ activeAgent, outputs, isLoading, onSwitchTab }: ReportViewProps) {
  const meta = AGENT_METADATA[activeAgent];
  const output = outputs[activeAgent];
  const completedCount = Object.values(outputs).filter(Boolean).length;

  const renderReport = () => {
    if (isLoading && !output) {
      return (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
          <div className="w-12 h-12 border-4 border-slate-200 border-t-indigo-500 rounded-full animate-spin mb-4" />
          <p className="text-sm">Agent is gathering data…</p>
        </div>
      );
    }
    if (!output) {
      return (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
          <div className="text-5xl mb-4" aria-hidden>
            {meta.icon}
          </div>
          <p className="text-sm">Start a research session to see findings</p>
        </div>
      );
    }
    switch (activeAgent) {
      case "market-sizer":
        return <MarketSizerReport output={output} />;
      case "competitor-analyst":
        return <CompetitorAnalystReport output={output} />;
      case "pain-detective":
        return <PainDetectiveReport output={output} />;
      case "pricing-scout":
        return <PricingScoutReport output={output} />;
      case "channel-scout":
        return <ChannelScoutReport output={output} />;
      case "synthesis":
        return <SynthesisReport output={output} />;
      default:
        return null;
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm h-full flex flex-col overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3 flex-shrink-0">
        <span className="text-2xl" aria-hidden>
          {meta.icon}
        </span>
        <div className="flex-1 min-w-0">
          <h2 className="font-bold text-slate-800 truncate">{meta.name}</h2>
          <p className="text-xs text-slate-500 truncate">{meta.description}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-100 px-2 flex-shrink-0 overflow-x-auto">
        <div className="flex gap-1">
          {AGENT_ORDER.map((id) => {
            const tabMeta = AGENT_METADATA[id];
            const hasOut = !!outputs[id];
            const isActive = id === activeAgent;
            return (
              <button
                key={id}
                onClick={() => onSwitchTab?.(id)}
                className={`px-3 py-2 text-xs font-medium whitespace-nowrap rounded-t-lg transition-colors flex items-center gap-1.5 ${
                  isActive
                    ? "bg-slate-50 text-slate-800 border-b-2 border-indigo-500"
                    : "text-slate-500 hover:text-slate-700 hover:bg-slate-50"
                }`}
                aria-pressed={isActive}
              >
                <span aria-hidden>{tabMeta.icon}</span>
                <span>{tabMeta.name}</span>
                {hasOut && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" aria-label="completed" />}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">{renderReport()}</div>

      <div className="px-6 py-2 border-t border-slate-100 text-[10px] text-slate-400 flex-shrink-0 flex items-center justify-between">
        <span>
          {completedCount}/6 agents completed
        </span>
        {output && "citations" in output && Array.isArray((output as { citations?: unknown[] }).citations) && (
          <span>{(output as { citations: unknown[] }).citations.length} citations</span>
        )}
      </div>
    </div>
  );
}
