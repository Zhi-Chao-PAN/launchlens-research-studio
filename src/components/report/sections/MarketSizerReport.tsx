import type { MarketSizerOutput } from "@/lib/schema/research-schema";

function formatCurrency(value: number): string {
  if (value >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
  if (value >= 1e3) return `$${(value / 1e3).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
}

export function MarketSizerReport({ output }: { output: any }) {
  const data = output as MarketSizerOutput;
  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-indigo-50 to-violet-50 rounded-xl p-5">
        <h3 className="font-semibold text-slate-800 mb-2">Summary</h3>
        <p className="text-sm text-slate-600 leading-relaxed">{data.summary}</p>
      </div>

      <div>
        <h3 className="font-semibold text-slate-800 mb-3">Market Size Estimates</h3>
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-slate-50 rounded-xl p-4 text-center">
            <p className="text-xs text-slate-500 font-medium mb-1">TAM</p>
            <p className="text-2xl font-bold text-slate-800">{formatCurrency(data.marketSize.tam)}</p>
            <p className="text-xs text-slate-400 mt-1">Total addressable</p>
          </div>
          <div className="bg-slate-50 rounded-xl p-4 text-center">
            <p className="text-xs text-slate-500 font-medium mb-1">SAM</p>
            <p className="text-2xl font-bold text-slate-800">{formatCurrency(data.marketSize.sam)}</p>
            <p className="text-xs text-slate-400 mt-1">Serviceable addressable</p>
          </div>
          <div className="bg-gradient-to-br from-indigo-500 to-violet-500 rounded-xl p-4 text-center">
            <p className="text-xs text-indigo-100 font-medium mb-1">SOM (3yr)</p>
            <p className="text-2xl font-bold text-white">{formatCurrency(data.marketSize.som)}</p>
            <p className="text-xs text-indigo-100 mt-1">Serviceable obtainable</p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <span className="px-2 py-0.5 bg-slate-100 rounded-full text-slate-600">
            Growth: {data.marketSize.growthRate}%/yr
          </span>
          <span className="px-2 py-0.5 bg-slate-100 rounded-full text-slate-600">
            Trend: {data.marketSize.growthTrend}
          </span>
          <span className="px-2 py-0.5 bg-slate-100 rounded-full text-slate-600">
            Confidence: {data.marketSize.confidence}
          </span>
        </div>
      </div>

      <div>
        <h3 className="font-semibold text-slate-800 mb-3">Key Trends</h3>
        <div className="space-y-2">
          {data.keyTrends.map((trend: any, i: number) => (
            <div key={i} className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg">
              <span className={`text-lg ${
                trend.impact === "positive" ? "text-emerald-500" :
                trend.impact === "negative" ? "text-rose-500" : "text-slate-400"
              }`}>
                {trend.impact === "positive" ? "↑" : trend.impact === "negative" ? "↓" : "→"}
              </span>
              <div className="flex-1">
                <p className="text-sm font-medium text-slate-700">{trend.trend}</p>
                <p className="text-xs text-slate-500 mt-0.5">{trend.evidence}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 className="font-semibold text-slate-800 mb-3">Target Segments</h3>
        <div className="space-y-2">
          {data.targetSegments.map((seg: any, i: number) => (
            <div key={i} className="p-3 bg-slate-50 rounded-lg">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-700">{seg.name}</p>
                <span className="text-xs text-indigo-600 font-medium">{formatCurrency(seg.size)}</span>
              </div>
              <p className="text-xs text-slate-500 mt-1">{seg.description}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
