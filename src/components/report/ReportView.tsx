"use client";

import type { AgentId, AgentOutput } from "@/lib/schema/research-schema";
import { AGENT_METADATA } from "@/lib/schema/research-schema";
import dynamic from "next/dynamic";
import { useLocale } from "@/lib/i18n/LocaleProvider";

// Tab label mapping: prefer the report.tabs.* i18n keys, fall back to AGENT_METADATA
const TAB_I18N_KEYS: Record<AgentId, string> = {
  "market-sizer": "report.tabs.market",
  "competitor-analyst": "report.tabs.competition",
  "pain-detective": "report.tabs.pain",
  "pricing-scout": "report.tabs.pricing",
  "channel-scout": "report.tabs.channels",
  synthesis: "report.tabs.synthesis",
};

// A client-only fallback component that renders a spinner with localized text.
// This is a component (not a plain function) so it can use hooks.
function SectionFallback() {
  const { t } = useLocale();
  return (
    <div className="flex flex-col items-center justify-center py-20 text-slate-400">
      <div className="w-10 h-10 border-4 border-slate-200 border-t-indigo-500 rounded-full animate-spin mb-3" />
      <p className="text-xs">{t("report.loading", "Loading report section...")}</p>
    </div>
  );
}

const MarketSizerReport = dynamic(() => import("./sections/MarketSizerReport").then((m) => m.MarketSizerReport), { ssr: false, loading: SectionFallback });
const CompetitorAnalystReport = dynamic(() => import("./sections/CompetitorAnalystReport").then((m) => m.CompetitorAnalystReport), { ssr: false, loading: SectionFallback });
const PainDetectiveReport = dynamic(() => import("./sections/PainDetectiveReport").then((m) => m.PainDetectiveReport), { ssr: false, loading: SectionFallback });
const PricingScoutReport = dynamic(() => import("./sections/PricingScoutReport").then((m) => m.PricingScoutReport), { ssr: false, loading: SectionFallback });
const ChannelScoutReport = dynamic(() => import("./sections/ChannelScoutReport").then((m) => m.ChannelScoutReport), { ssr: false, loading: SectionFallback });
const SynthesisReport = dynamic(() => import("./sections/SynthesisReport").then((m) => m.SynthesisReport), { ssr: false, loading: SectionFallback });

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
  const { t, fmt } = useLocale();
  const meta = AGENT_METADATA[activeAgent];
  const output = outputs[activeAgent];
  const completedCount = Object.values(outputs).filter(Boolean).length;
  const totalAgents = AGENT_ORDER.length;
  const totalCitations = Object.values(outputs).reduce(
    (n, o) => n + (o && "citations" in o && Array.isArray(o.citations) ? o.citations.length : 0),
    0,
  );

  const renderReport = () => {
    if (isLoading && !output) {
      return (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
          <div className="w-12 h-12 border-4 border-slate-200 border-t-indigo-500 rounded-full animate-spin mb-4" />
          <p className="text-sm">{t("report.empty.title", "Agent is gathering data...")}</p>
          <p className="text-xs text-slate-400 mt-1">{t("report.empty.description", "Research is still running. Results will appear here.")}</p>
        </div>
      );
    }
    if (!output) {
      return (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
          <div className="text-5xl mb-4" aria-hidden>
            {meta.icon}
          </div>
          <p className="text-sm">{t("report.empty.start", "Start a research session to see results")}</p>
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

      <div className="border-b border-slate-100 px-2 flex-shrink-0 overflow-x-auto">
        <div className="flex gap-1">
          {AGENT_ORDER.map((id) => {
            const tabMeta = AGENT_METADATA[id];
            const tabLabel = t(TAB_I18N_KEYS[id], tabMeta.name);
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
                <span>{tabLabel}</span>
                {hasOut && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" aria-label={t("status.label.complete", "complete")} />}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6" role="region" aria-label="Agent report" aria-busy={isLoading && !output}>{renderReport()}</div>

      <div className="px-6 py-2 border-t border-slate-100 text-[10px] text-slate-400 flex-shrink-0 flex items-center justify-between">
        <span>{fmt("report.empty.stats", { completed: completedCount, total: totalAgents, citations: totalCitations }, "{completed} of {total} agents completed · {citations} citations")}</span>
      </div>
    </div>
  );
}
