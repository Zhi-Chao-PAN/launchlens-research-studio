import { AGENT_METADATA, RESEARCH_AGENTS } from "@/lib/schema/research-schema";

export default function Loading() {
  const allAgentIds = [...RESEARCH_AGENTS, "synthesis" as const];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12">
        <div className="max-w-2xl mx-auto text-center">
          <div
            className="mx-auto mb-6 flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-600 text-sm font-bold text-white shadow-lg shadow-indigo-200 animate-pulse-soft"
            aria-hidden="true"
          >
            RS
          </div>
          <h2 className="text-2xl font-bold text-slate-800 mb-2">
            LaunchLens Research Studio
          </h2>
          <p className="text-slate-500 mb-8">Warming up the research agents...</p>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 opacity-60">
            {allAgentIds.map((id) => {
              const meta = AGENT_METADATA[id];
              return (
                <div
                  key={id}
                  className="p-3 bg-white rounded-xl border border-slate-200 text-center"
                >
                  <div className="text-2xl mb-1">{meta.icon}</div>
                  <p className="text-sm font-semibold text-slate-700">
                    {meta.name}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
