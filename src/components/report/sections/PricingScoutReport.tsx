import type { PricingScoutOutput } from "@/lib/schema/research-schema";

export function PricingScoutReport({ output }: { output: any }) {
  const data = output as PricingScoutOutput;
  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-emerald-50 to-teal-50 rounded-xl p-5">
        <h3 className="font-semibold text-slate-800 mb-2">Summary</h3>
        <p className="text-sm text-slate-600 leading-relaxed">{data.summary}</p>
      </div>

      <div>
        <h3 className="font-semibold text-slate-800 mb-3">Market Price Bands</h3>
        <div className="space-y-2">
          {data.priceBands.map((band: any, i: number) => (
            <div key={i} className="p-3 bg-slate-50 rounded-lg">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-700">{band.name}</p>
                <p className="text-sm font-bold text-emerald-600">
                  ${band.min} - ${band.max}
                </p>
              </div>
              <p className="text-xs text-slate-500 mt-1">Typical: ${band.typical}</p>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 className="font-semibold text-slate-800 mb-3">Pricing Recommendations</h3>
        <div className="grid grid-cols-3 gap-2">
          {data.recommendations.map((rec: any, i: number) => (
            <div key={i} className="p-3 bg-emerald-50 rounded-lg text-center">
              <p className="text-xs text-emerald-600 font-medium">{rec.tier}</p>
              <p className="text-xl font-bold text-emerald-700 mt-1">${rec.price}</p>
              <p className="text-xs text-emerald-600 mt-1">{rec.rationale}</p>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 className="font-semibold text-slate-800 mb-3">Monetization Models</h3>
        <div className="space-y-2">
          {data.monetizationModels.map((model: any, i: number) => (
            <div key={i} className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
              <div className="flex-1">
                <p className="text-sm font-medium text-slate-700">{model.model}</p>
                <p className="text-xs text-slate-500">Examples: {model.examples.join(", ")}</p>
              </div>
              <div className="w-24">
                <div className="h-2 bg-slate-200 rounded-full">
                  <div
                    className="h-full bg-teal-500 rounded-full"
                    style={{ width: `${model.prevalence * 100}%` }}
                  />
                </div>
                <p className="text-xs text-slate-500 text-right mt-0.5">
                  {Math.round(model.prevalence * 100)}%
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 className="font-semibold text-slate-800 mb-3">Willingness to Pay</h3>
        <div className="space-y-2">
          {data.willingnessToPay.map((wtp: any, i: number) => (
            <div key={i} className="flex items-center justify-between p-3 bg-white rounded-lg border border-slate-200">
              <span className="text-sm text-slate-700">{wtp.segment}</span>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-slate-800">~${wtp.estimate}</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                  {wtp.confidence}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
