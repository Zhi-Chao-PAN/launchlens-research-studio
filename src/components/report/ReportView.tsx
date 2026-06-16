"use client";

import { lazy, Suspense, useState, useEffect } from "react";
import type { AgentId, AgentOutput } from "@/lib/schema/research-schema";
import { AGENT_METADATA } from "@/lib/schema/research-schema";
import { SectionHeader } from "./primitives/SectionHeader";

// Lazy-load each report section so they only ship when the user opens that tab.
// This significantly reduces the initial JS payload for the studio.
const MarketSizerReport = lazy(() =>
  import("./sections/MarketSizerReport").then((m) => ({ default: m.MarketSizerReport })),
);
const CompetitorAnalystReport = lazy(() =>
  import("./sections/CompetitorAnalystReport").then((m) => ({ default: m.CompetitorAnalystReport })),
);
const PainDetectiveReport = lazy(() =>
  import("./sections/PainDetectiveReport").then((m) => ({ default: m.PainDetectiveReport })),
);
const PricingScoutReport = lazy(() =>
  import("./sections/PricingScoutReport").then((m) => ({ default: m.PricingScoutReport })),
);
const ChannelScoutReport = lazy(() =>
  import("./sections/ChannelScoutReport").then((m) => ({ default: m.ChannelScoutReport })),
);
const SynthesisReport = lazy(() =>
  import("./sections/SynthesisReport").then((m) => ({ default: m.SynthesisReport })),
);

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

function ReportSectionSkeleton() {
  return (
    <div className="space-y-4 animate-pulse" aria-busy="true" aria-live="polite">
      <div className="h-24 bg-slate-100 rounded-xl" />
      <div className="h-32 bg-slate-100 rounded-xl" />
      <div className="h-20 bg-slate-100 rounded-xl" />
      <div className="h-40 bg-slate-100 rounded-xl" />
    </div>
  );
}

function getReportComponent(agent: AgentId) {
  switch (agent) {
    case "market-sizer":
      return MarketSizerReport;
    case "competitor-analyst":
      return CompetitorAnalystReport;
    case "pain-detective":
      return PainDetectiveReport;
    case "pricing-scout":
      return PricingScoutReport;
    case "channel-scout":
      return ChannelScoutReport;
    case "synthesis":
      return SynthesisReport;
    default:
      return null;
  }
}

export function ReportView({ activeAgent, outputs, isLoading, onSwitchTab }: ReportViewProps) {
  const meta = AGENT_METADATA[activeAgent];
  const output = outputs[activeAgent];
  const completedCount = Object.values(outputs).filter(Boolean).length;
  const ReportComponent = getReportComponent(activeAgent);

  // Track which agent tabs have been activated at least once so we don't
  // re-fetch a lazy chunk on every tab visit.
  const [seenAgents, setSeenAgents] = useState<Set<AgentId>>(() => new Set([activeAgent]));
  useEffect(() => {
    setSeenAgents((prev) => {
      if (prev.has(activeAgent)) return prev;
      const next = new Set(prev);
      next.add(activeAgent);
      return next;
    });
  }, [activeAgent]);

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
    if (!ReportComponent) return null;
    return (
      <Suspense fallback={<ReportSectionSkeleton />}>
        <ReportComponent output={output} />
      </Suspense>
    );
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
