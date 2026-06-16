/* eslint-disable @typescript-eslint/no-explicit-any */
﻿"use client";

import type { ChannelScoutOutput } from "@/lib/schema/research-schema";
import { SectionHeader } from "../primitives/SectionHeader";
import { CitationList, useCopyText } from "../primitives/CitationList";
import { generateAgentMarkdown } from "@/lib/export/agent-markdown";

const CATEGORY_STYLE: Record<string, { bg: string; text: string; emoji: string }> = {
  social: { bg: "bg-blue-100", text: "text-blue-700", emoji: "📱" },
  community: { bg: "bg-violet-100", text: "text-violet-700", emoji: "💬" },
  content: { bg: "bg-emerald-100", text: "text-emerald-700", emoji: "📝" },
  paid: { bg: "bg-amber-100", text: "text-amber-700", emoji: "💵" },
  partnership: { bg: "bg-rose-100", text: "text-rose-700", emoji: "🤝" },
  direct: { bg: "bg-slate-100", text: "text-slate-700", emoji: "📧" },
};

const PRIORITY_STYLE = {
  high: { bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-700", bar: "bg-emerald-500" },
  medium: { bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-700", bar: "bg-amber-500" },
  low: { bg: "bg-slate-50", border: "border-slate-200", text: "text-slate-600", bar: "bg-slate-400" },
} as const;

const REACH_RANK: Record<string, number> = { niche: 1, moderate: 3, broad: 5 };
const COST_RANK: Record<string, number> = { low: 5, medium: 3, high: 1 };

const VOL_STYLE = {
  high: { bg: "bg-emerald-100", text: "text-emerald-700", emoji: "🔥" },
  medium: { bg: "bg-amber-100", text: "text-amber-700", emoji: "⚡" },
  low: { bg: "bg-slate-100", text: "text-slate-600", emoji: "💧" },
} as const;

export function ChannelScoutReport({ output }: { output: any }) {
  const data = output as ChannelScoutOutput;
  const { copied, copy } = useCopyText();

  // Effectiveness dot color
  function effDot(e: string): string {
    return e === "high" ? "bg-emerald-500" : e === "medium" ? "bg-amber-500" : e === "low" ? "bg-rose-500" : "bg-slate-300";
  }

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Channel Scout"
        description={data.summary}
        icon="🚀"
        count={data.channels.length}
        accent="sky"
        onCopy={() => copy(generateAgentMarkdown("channel-scout", data), "channel-scout")}
        copied={copied === "channel-scout"}
        copyLabel="Copy section"
      />

      {/* Recommended channels with priority bars */}
      <div>
        <h3 className="font-semibold text-slate-800 mb-3 text-sm uppercase tracking-wide">
          Recommended Channels <span className="text-xs text-slate-400 font-normal">({data.recommendedChannels.length})</span>
        </h3>
        <div className="space-y-2">
          {data.recommendedChannels.map((rec: any, i: number) => {
            const p = PRIORITY_STYLE[rec.priority as keyof typeof PRIORITY_STYLE] || PRIORITY_STYLE.medium;
            const widthPct = rec.priority === "high" ? 95 : rec.priority === "medium" ? 60 : 30;
            return (
              <div key={i} className={`p-3 rounded-lg border ${p.bg} ${p.border}`}>
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <p className={`text-sm font-semibold ${p.text}`}>{rec.channel}</p>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${p.text} bg-white/70`}>
                    {rec.priority}
                  </span>
                </div>
                <p className="text-xs text-slate-700 mb-1.5">{rec.why}</p>
                <div className="h-1 bg-slate-200 rounded-full overflow-hidden">
                  <div className={`h-full ${p.bar} rounded-full`} style={{ width: `${widthPct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* All channels with effectiveness dots */}
      <div>
        <h3 className="font-semibold text-slate-800 mb-3 text-sm uppercase tracking-wide">Channel Landscape</h3>
        <div className="space-y-2">
          {data.channels.map((c, i) => {
            const cat = CATEGORY_STYLE[c.category] || CATEGORY_STYLE.community;
            return (
              <div key={i} className="p-3 bg-white border border-slate-200 rounded-lg">
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${cat.bg} ${cat.text} flex items-center gap-1 flex-shrink-0`}>
                      <span aria-hidden>{cat.emoji}</span>
                      <span className="capitalize">{c.category}</span>
                    </span>
                    <p className="text-sm font-semibold text-slate-800 truncate">{c.name}</p>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0" title={`Effectiveness: ${c.effectiveness}`}>
                    <span className={`w-2 h-2 rounded-full ${effDot(c.effectiveness)}`} />
                    <span className="text-[10px] text-slate-500 capitalize">{c.effectiveness}</span>
                  </div>
                </div>

                <p className="text-xs text-slate-600 mb-1.5">{c.audience}</p>
                <p className="text-[10px] text-slate-500 mb-2">{c.notes}</p>

                {/* Reach vs cost visualization */}
                <div className="grid grid-cols-2 gap-2 mt-2 text-[10px]">
                  <div>
                    <p className="text-slate-500 mb-0.5">Reach</p>
                    <div className="h-1 bg-slate-200 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-400" style={{ width: `${((REACH_RANK[c.reach] || 3) / 5) * 100}%` }} />
                    </div>
                    <p className="text-slate-600 capitalize mt-0.5">{c.reach}</p>
                  </div>
                  <div>
                    <p className="text-slate-500 mb-0.5">Cost-efficiency</p>
                    <div className="h-1 bg-slate-200 rounded-full overflow-hidden">
                      <div className="h-full bg-emerald-400" style={{ width: `${((COST_RANK[c.cost] || 3) / 5) * 100}%` }} />
                    </div>
                    <p className="text-slate-600 capitalize mt-0.5">{c.cost}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Community Hubs */}
      {data.communityHubs && data.communityHubs.length > 0 && (
        <div>
          <h3 className="font-semibold text-slate-800 mb-3 text-sm uppercase tracking-wide">Community Hubs</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {data.communityHubs.map((h: any, i: number) => (
              <a
                key={i}
                href={h.url || "#"}
                target="_blank"
                rel="noopener noreferrer"
                className="p-3 bg-violet-50 border border-violet-100 rounded-lg hover:border-violet-300 transition-colors block"
              >
                <p className="text-sm font-semibold text-violet-900 truncate">{h.name}</p>
                <p className="text-xs text-violet-600 mt-0.5">{h.platform} · {h.size}</p>
                <p className="text-xs text-slate-600 mt-1">{h.focus}</p>
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Content topics */}
      <div>
        <h3 className="font-semibold text-slate-800 mb-3 text-sm uppercase tracking-wide">Content Topics</h3>
        <div className="space-y-1.5">
          {data.contentTopics.map((t: any, i: number) => {
            const vol = VOL_STYLE[t.searchVolume as keyof typeof VOL_STYLE] || VOL_STYLE.medium;
            return (
              <div key={i} className="flex items-center gap-2 p-2 bg-slate-50 rounded-lg text-xs">
                <span className="text-slate-800 flex-1 truncate">{t.topic}</span>
                <span className={`px-1.5 py-0.5 rounded font-medium flex items-center gap-0.5 ${vol.bg} ${vol.text}`}>
                  <span aria-hidden>{vol.emoji}</span>
                  <span className="capitalize">{t.searchVolume}</span>
                </span>
                <span className="text-slate-500 font-mono w-20 text-right">{t.competition} comp</span>
              </div>
            );
          })}
        </div>
      </div>

      <CitationList citations={data.citations} />
    </div>
  );
}
