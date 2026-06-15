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
}

export function ReportView({ activeAgent, outputs, isLoading }: ReportViewProps) {
  const meta = AGENT_METADATA[activeAgent];
  const output = outputs[activeAgent];

  const renderReport = () => {
    if (isLoading && !output) {
      return (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
          <div className="w-12 h-12 border-4 border-slate-200 border-t-indigo-500 rounded-full animate-spin mb-4" />
          <p className="text-sm">Agent is gathering data...</p>
        </div>
      );
    }
    if (!output) {
      return (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
          <div className="text-5xl mb-4">{meta.icon}</div>
          <p className="text-sm">Start a research session to see findings</p>
        </div>
      );
    }
    switch (activeAgent) {
      case "market-sizer": return <MarketSizerReport output={output} />;
      case "competitor-analyst": return <CompetitorAnalystReport output={output} />;
      case "pain-detective": return <PainDetectiveReport output={output} />;
      case "pricing-scout": return <PricingScoutReport output={output} />;
      case "channel-scout": return <ChannelScoutReport output={output} />;
      case "synthesis": return <SynthesisReport output={output} />;
      default: return null;
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm h-full flex flex-col">
      <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3">
        <span className="text-2xl">{meta.icon}</span>
        <div>
          <h2 className="font-bold text-slate-800">{meta.name}</h2>
          <p className="text-xs text-slate-500">{meta.description}</p>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-6">
        {renderReport()}
      </div>
    </div>
  );
}
