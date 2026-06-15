import type { SynthesisOutput } from "@/lib/schema/research-schema";

function ScoreRing({ score, label, color }: { score: number; label: string; color: string }) {
  const circumference = 2 * Math.PI * 28;
  const offset = circumference - (score / 100) * circumference;
  return (
    <div className="flex flex-col items-center">
      <div className="relative w-16 h-16">
        <svg className="w-16 h-16 -rotate-90">
          <circle cx="32" cy="32" r="28" stroke="#e2e8f0" strokeWidth="6" fill="none" />
          <circle
            cx="32" cy="32" r="28" stroke={color}
            strokeWidth="6" fill="none" strokeLinecap="round"
            strokeDasharray={circumference} strokeDashoffset={offset}
            className="transition-all duration-1000"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-lg font-bold text-slate-800">{score}</span>
        </div>
      </div>
      <p className="text-xs text-slate-500 mt-1 font-medium">{label}</p>
    </div>
  );
}

export function SynthesisReport({ output }: { output: any }) {
  const data = output as SynthesisOutput;
  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-violet-500 to-indigo-600 rounded-xl p-6 text-white">
        <h3 className="text-lg font-bold mb-2">Executive Summary</h3>
        <p className="text-sm text-violet-100 leading-relaxed">{data.execSummary}</p>
      </div>

      <div className="flex justify-center gap-8 py-4">
        <ScoreRing score={data.opportunityScore} label="Opportunity" color="#10b981" />
        <ScoreRing score={data.riskScore} label="Risk" color="#ef4444" />
      </div>

      <div>
        <h3 className="font-semibold text-slate-800 mb-3">Top 3 Opportunities</h3>
        <div className="space-y-2">
          {data.topThreeOpportunities.map((opp, i) => (
            <div key={i} className="p-4 bg-emerald-50 rounded-xl border border-emerald-100">
              <div className="flex items-start gap-3">
                <div className="w-7 h-7 rounded-full bg-emerald-500 text-white flex items-center justify-center text-sm font-bold flex-shrink-0">
                  {i + 1}
                </div>
                <div>
                  <h4 className="font-semibold text-emerald-800">{opp.title}</h4>
                  <p className="text-sm text-emerald-700 mt-0.5">{opp.description}</p>
                  <p className="text-xs text-emerald-600 mt-1">
                    <span className="font-medium">Why it matters:</span> {opp.rationale}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 className="font-semibold text-slate-800 mb-3">Top 3 Risks</h3>
        <div className="space-y-2">
          {data.topThreeRisks.map((risk, i) => (
            <div key={i} className="p-4 bg-rose-50 rounded-xl border border-rose-100">
              <div className="flex items-start gap-3">
                <div className="w-7 h-7 rounded-full bg-rose-500 text-white flex items-center justify-center text-sm font-bold flex-shrink-0">
                  {i + 1}
                </div>
                <div>
                  <h4 className="font-semibold text-rose-800">{risk.title}</h4>
                  <p className="text-sm text-rose-700 mt-0.5">{risk.description}</p>
                  <p className="text-xs text-rose-600 mt-1">
                    <span className="font-medium">Mitigation:</span> {risk.mitigation}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="p-4 bg-slate-50 rounded-xl">
        <h3 className="font-semibold text-slate-800 mb-2">Recommended Next Step</h3>
        <p className="text-sm text-slate-600">{data.recommendedNextStep}</p>
      </div>

      <div className="p-4 bg-indigo-50 rounded-xl border border-indigo-100">
        <h3 className="font-semibold text-indigo-800 mb-2">📋 LaunchLens Importable Brief</h3>
        <p className="text-xs text-indigo-600 mb-2">
          Copy this brief into launchlens-ai to generate your GTM strategy
        </p>
        <div className="bg-white rounded-lg p-3 border border-indigo-200 text-xs text-slate-700 font-mono whitespace-pre-wrap max-h-48 overflow-y-auto">
          {data.launchlensBrief}
        </div>
      </div>
    </div>
  );
}
