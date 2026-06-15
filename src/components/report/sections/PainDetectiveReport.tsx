import type { PainDetectiveOutput } from "@/lib/schema/research-schema";

export function PainDetectiveReport({ output }: { output: any }) {
  const data = output as PainDetectiveOutput;

  const severityColor = (severity: string) => {
    if (severity === "critical") return "text-rose-600 bg-rose-100";
    if (severity === "significant") return "text-amber-600 bg-amber-100";
    return "text-slate-600 bg-slate-100";
  };

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-rose-50 to-pink-50 rounded-xl p-5">
        <h3 className="font-semibold text-slate-800 mb-2">Summary</h3>
        <p className="text-sm text-slate-600 leading-relaxed">{data.summary}</p>
      </div>

      <div>
        <h3 className="font-semibold text-slate-800 mb-3">Top Pain Points</h3>
        <div className="space-y-3">
          {data.painPoints.map((pain) => (
            <div key={pain.id} className="p-4 bg-slate-50 rounded-xl">
              <div className="flex items-center gap-2 mb-2">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${severityColor(pain.severity)}`}>
                  {pain.severity}
                </span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-white border border-slate-200 text-slate-600">
                  {pain.frequency}
                </span>
              </div>
              <p className="text-sm font-medium text-slate-800">{pain.pain}</p>
              {pain.quotes.length > 0 && (
                <div className="mt-2 pl-3 border-l-2 border-rose-200">
                  <p className="text-xs text-slate-600 italic">"{pain.quotes[0].text}"</p>
                  <p className="text-xs text-slate-400 mt-0.5">— {pain.quotes[0].source}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 className="font-semibold text-slate-800 mb-3">Unmet Needs</h3>
        <div className="space-y-2">
          {data.unmetNeeds.map((need: any, i: number) => (
            <div key={i} className="p-3 bg-violet-50 rounded-lg">
              <p className="text-sm font-medium text-violet-800">{need.need}</p>
              <p className="text-xs text-violet-600 mt-1">
                <span className="font-medium">Why unmet:</span> {need.whyUnmet}
              </p>
              <p className="text-xs text-violet-600 mt-0.5">
                <span className="font-medium">Opportunity:</span> {need.opportunity}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 className="font-semibold text-slate-800 mb-3">User Personas</h3>
        <div className="grid grid-cols-2 gap-3">
          {data.userPersonas.map((persona: any, i: number) => (
            <div key={i} className="p-4 bg-white rounded-xl border border-slate-200">
              <h4 className="font-semibold text-slate-800">{persona.name}</h4>
              <p className="text-xs text-slate-500 mb-2">{persona.role}</p>
              <div className="text-xs space-y-1">
                <p className="text-slate-500 font-medium">Goals:</p>
                <ul className="text-slate-600 ml-3">
                  {persona.goals.map((g: string, j: number) => <li key={j}>• {g}</li>)}
                </ul>
                <p className="text-slate-500 font-medium mt-1">Frustrations:</p>
                <ul className="text-slate-600 ml-3">
                  {persona.frustrations.map((f: string, j: number) => <li key={j}>• {f}</li>)}
                </ul>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
