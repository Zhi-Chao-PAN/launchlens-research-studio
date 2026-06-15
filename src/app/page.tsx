"use client";

import { useResearchStudio } from "@/lib/research/use-research-studio";
import { QueryInput } from "@/components/studio/QueryInput";
import { AgentCard } from "@/components/agents/AgentCard";
import { ReportView } from "@/components/report/ReportView";
import { ExportActions } from "@/components/report/ExportActions";
import { RESEARCH_AGENTS, AGENT_METADATA } from "@/lib/schema/research-schema";
import type { AgentId } from "@/lib/schema/research-schema";

export default function Home() {
  const { state, startResearch, setActiveAgentTab, reset } = useResearchStudio();
  const isRunning = state.status === "running" || state.status === "loading";
  const hasSession = state.sessionId !== null;
  const allAgentIds: AgentId[] = [...RESEARCH_AGENTS, "synthesis"];

  const handleSubmit = (query: string, keywords: string[]) => {
    startResearch(query, keywords);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white text-xl font-bold shadow-lg shadow-indigo-200">
              🔬
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-800 tracking-tight">
                LaunchLens Research Studio
              </h1>
              <p className="text-xs text-slate-500">
                Multi-agent market intelligence for your product idea
              </p>
            </div>
          </div>
          {hasSession && (
            <button
              onClick={reset}
              className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
            >
              New Research
            </button>
          )}
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {!hasSession ? (
          /* Hero + query entry */
          <div className="max-w-2xl mx-auto py-8">
            <div className="text-center mb-8">
              <h2 className="text-3xl font-bold text-slate-800 tracking-tight mb-3">
                Research any market in minutes
              </h2>
              <p className="text-slate-500 text-lg">
                6 specialized AI agents work in parallel to give you a complete
                market intelligence report. No API keys required.
              </p>
            </div>
            <QueryInput onSubmit={handleSubmit} isLoading={isRunning} />

            {/* Agent grid preview */}
            <div className="mt-10">
              <p className="text-center text-sm text-slate-500 mb-4">
                Powered by 6 research agents:
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {allAgentIds.map((id) => {
                  const meta = AGENT_METADATA[id];
                  return (
                    <div
                      key={id}
                      className="p-3 bg-white rounded-xl border border-slate-200 text-center"
                    >
                      <div className="text-2xl mb-1">{meta.icon}</div>
                      <p className="text-sm font-semibold text-slate-700">{meta.name}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{meta.description}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
          /* Studio layout */
          <div className="flex flex-col lg:flex-row gap-6">
            {/* Left sidebar */}
            <aside className="w-full lg:w-96 flex-shrink-0 space-y-4">
              <QueryInput onSubmit={handleSubmit} isLoading={isRunning} />

              <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-slate-800">Research Agents</h3>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      state.status === "completed"
                        ? "bg-emerald-100 text-emerald-700"
                        : state.status === "running" || state.status === "loading"
                        ? "bg-amber-100 text-amber-700"
                        : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {state.status === "completed"
                      ? "Complete"
                      : state.status === "running" || state.status === "loading"
                      ? "Running..."
                      : state.status}
                  </span>
                </div>
                <div className="space-y-2">
                  {allAgentIds.map((agentId) => (
                    <AgentCard
                      key={agentId}
                      agentId={agentId}
                      state={{
                        id: agentId,
                        status: state.agents[agentId].status as any,
                        progress: state.agents[agentId].progress,
                        currentStep: state.agents[agentId].currentStep,
                      }}
                      isActive={state.activeAgentTab === agentId}
                      onClick={() => setActiveAgentTab(agentId)}
                    />
                  ))}
                </div>
              </div>

              {state.status === "completed" && state.sessionId && (
                <ExportActions sessionId={state.sessionId} outputs={state.agentOutputs} />
              )}
            </aside>

            {/* Right panel - report */}
            <section className="flex-1 min-h-[600px]">
              <ReportView
                activeAgent={state.activeAgentTab}
                outputs={state.agentOutputs}
                isLoading={isRunning}
              />
            </section>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white/50 mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 text-center">
          <p className="text-xs text-slate-400">
            LaunchLens Research Studio • Companion to launchlens-ai
          </p>
        </div>
      </footer>
    </div>
  );
}
