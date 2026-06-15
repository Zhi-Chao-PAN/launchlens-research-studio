import type { CompetitorAnalystOutput } from "@/lib/schema/research-schema";

export function CompetitorAnalystReport({ output }: { output: any }) {
  const data = output as CompetitorAnalystOutput;
  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-amber-50 to-orange-50 rounded-xl p-5">
        <h3 className="font-semibold text-slate-800 mb-2">Summary</h3>
        <p className="text-sm text-slate-600 leading-relaxed">{data.summary}</p>
      </div>

      <div>
        <h3 className="font-semibold text-slate-800 mb-3">Top Competitors</h3>
        <div className="space-y-3">
          {data.competitors.map((comp) => (
            <div key={comp.id} className="p-4 bg-slate-50 rounded-xl border border-slate-100">
              <div className="flex items-start justify-between">
                <div>
                  <h4 className="font-semibold text-slate-800">{comp.name}</h4>
                  <p className="text-xs text-slate-500 mt-0.5">{comp.tagline}</p>
                </div>
                <span className="text-xs px-2 py-1 bg-white rounded-full border border-slate-200 text-slate-600 font-medium">
                  {comp.positioning}
                </span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-slate-500 font-medium mb-1">Strengths</p>
                  <ul className="text-xs text-slate-600 space-y-0.5">
                    {comp.strengths.map((s, i) => <li key={i}>• {s}</li>)}
                  </ul>
                </div>
                <div>
                  <p className="text-xs text-slate-500 font-medium mb-1">Weaknesses</p>
                  <ul className="text-xs text-slate-600 space-y-0.5">
                    {comp.weaknesses.map((w, i) => <li key={i}>• {w}</li>)}
                  </ul>
                </div>
              </div>
              <div className="mt-2 flex items-center gap-2 text-xs">
                <span className="text-slate-500">
                  Pricing: ${comp.pricing.min}-${comp.pricing.max}/{comp.pricing.model}
                </span>
                <span className="text-slate-400">|</span>
                <span className="text-emerald-600 font-medium">
                  {comp.differentiation}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 className="font-semibold text-slate-800 mb-3">Market Gaps & Opportunities</h3>
        <div className="space-y-2">
          {data.gaps.map((gap: any, i: number) => (
            <div key={i} className="p-3 bg-emerald-50 rounded-lg border border-emerald-100">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-emerald-800">{gap.gap}</p>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  gap.difficulty === "low" ? "bg-emerald-200 text-emerald-700" :
                  gap.difficulty === "medium" ? "bg-amber-200 text-amber-700" :
                  "bg-rose-200 text-rose-700"
                }`}>
                  {gap.difficulty} difficulty
                </span>
              </div>
              <p className="text-xs text-emerald-600 mt-1">Opportunity: {gap.opportunity}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
