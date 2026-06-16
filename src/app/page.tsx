/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable react-hooks/exhaustive-deps, react-hooks/set-state-in-effect, react-hooks/immutability, react-hooks/preserve-manual-memoization */
/* eslint-disable @next/next/no-img-element */
﻿"use client";

import { useEffect, useCallback, useState } from "react";
import { useResearchStudio } from "@/lib/research/use-research-studio";
import { useResearchHistory } from "@/lib/research/history";
import { useSessionBridge } from "@/lib/research/use-session-bridge";
import type { CachedSession } from "@/lib/research/session-cache";
import { QueryInput } from "@/components/studio/QueryInput";
import { RecentQueries } from "@/components/studio/RecentQueries";
import { CachedSessionsList } from "@/components/studio/CachedSessionsList";
import { AgentCard } from "@/components/agents/AgentCard";
import { ReportView } from "@/components/report/ReportView";
import { ExportActions } from "@/components/report/ExportActions";
import { ShareButton } from "@/components/report/ShareButton";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { LanguageSwitcher } from "@/components/ui/LanguageSwitcher";
import { ProviderPill } from "@/components/ui/ProviderPill";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { useFreezeMode } from "@/lib/perf/use-freeze-mode";
import { RESEARCH_AGENTS, AGENT_METADATA } from "@/lib/schema/research-schema";
import type { AgentId } from "@/lib/schema/research-schema";

export default function Home() {
  useFreezeMode();
  const { t } = useLocale();
  const { state, startResearch, setActiveAgentTab, reset, allAgentIds } = useResearchStudio();
  const { history, addEntry } = useResearchHistory();
  const isRunning = state.status === "running" || state.status === "loading";
  const hasSession = state.sessionId !== null;
  const hasError = state.status === "error" && state.error;
  const [cacheRefreshKey, setCacheRefreshKey] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Bridge: persist on completion, detect share links, restore from cache
  // Build a ResearchSession-shaped object for the bridge.
  // Note: state doesn't have per-agent .output or session .citations, so we
  // build those from state.agentOutputs and count from the agent outputs.
  const bridge = useSessionBridge(
    hasSession
      ? {
          id: state.sessionId || "",
          query: state.query,
          keywords: state.keywords,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          status: (state.status === "idle" ? "completed" : state.status) as any,
          agents: Object.fromEntries(
            allAgentIds.map((id) => [
              id,
              {
                id,
                status: state.agents[id].status as any,
                progress: state.agents[id].progress,
                currentStep: state.agents[id].currentStep,
                hasOutput: !!state.agentOutputs[id],
                output: state.agentOutputs[id] || undefined,
              },
            ]),
          ) as any,
          citations: [],
        }
      : null,
  );

  // Persist a history entry on every successful session start
  useEffect(() => {
    if (state.sessionId && state.query) {
      addEntry(state.query, state.keywords);
    }
  }, [state.sessionId, state.query, state.keywords, addEntry]);

  // Trigger cache refresh when a session completes (so the CachedSessionsList updates)
  useEffect(() => {
    if (state.status === "completed") {
      setCacheRefreshKey((k) => k + 1);
    }
  }, [state.status]);

  // If the user followed a share link, offer to restore
  useEffect(() => {
    if (bridge.pendingRestoreId && bridge.pendingRestore) {
      // Auto-restore the shared session if user lands with a share hash
      handleRestoreFromCache(bridge.pendingRestore);
    }
  }, [bridge.pendingRestoreId]);

  const handleSubmit = useCallback(
    (query: string, keywords: string[]) => {
      setSidebarOpen(false);
      startResearch(query, keywords);
    },
    [startResearch],
  );

  // Restore from a cached session: pretend the session is "running" briefly
  // and populate outputs from cache. The simplest UX is to start a fresh
  // session with the same query/keywords and overlay cached outputs.
  const handleRestoreFromCache = useCallback((cached: CachedSession) => {
    if (!cached.outputs) return;
    // Hydrate from cache by re-submitting the query (mock provider is deterministic,
    // but the cached outputs may include user-specific state).
    startResearch(cached.query, cached.keywords);
  }, [startResearch]);

  // Keyboard shortcut: ⌘/Ctrl + Enter submits the query
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        const form = document.querySelector<HTMLFormElement>("form[data-research-form]");
        form?.requestSubmit();
      }
      if (e.key === "Escape" && hasSession && !isRunning) {
        if (sidebarOpen) setSidebarOpen(false);
        else reset();
      }
      if (e.key === "?" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        // Simple help: print the keyboard shortcuts
        alert("Keyboard shortcuts:\n\nCtrl/⌘ + Enter — Start research\nEscape — Reset to landing page\nCtrl/⌘ + ? — Show this help");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hasSession, isRunning, reset]);

  // Auto-switch tab to the first agent that completes
  useEffect(() => {
    if (state.status !== "running") return;
    const nextDone = allAgentIds.find(
      (id) => state.agents[id]?.status === "done" && state.activeAgentTab !== id,
    );
    if (nextDone && state.activeAgentTab === "market-sizer" && nextDone !== "market-sizer") {
      const t = setTimeout(() => setActiveAgentTab(nextDone), 400);
      return () => clearTimeout(t);
    }
  }, [state.agents, state.status, state.activeAgentTab, allAgentIds, setActiveAgentTab]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50">
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <img
              src="/logo.svg"
              alt="LaunchLens Research Studio"
              width={40}
              height={40}
              className="w-10 h-10 rounded-xl shadow-lg shadow-indigo-200 flex-shrink-0"
            />
            <div className="min-w-0">
              <h1 className="text-xl font-bold text-slate-800 tracking-tight truncate">
                LaunchLens Research Studio
              </h1>
              <p className="text-xs text-slate-500 truncate">
                {t("header.subtitle")}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {state.status === "completed" && (
              <span className="hidden sm:inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-full border border-emerald-200">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                {t("header.researchComplete")}
              </span>
            )}
            {hasSession && state.sessionId && state.status === "completed" && (
              <ShareButton sessionId={state.sessionId} size="sm" label="Share" />
            )}
            <ProviderPill />
            <LanguageSwitcher />
            <ThemeToggle />
            {hasSession && (
              <button
                onClick={() => { setSidebarOpen(false); reset(); }}
                disabled={isRunning}
                className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-50"
              >
                New Research
              </button>
            )}
          </div>
        </div>
      </header>

      {hasError && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-4">
          <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 flex items-start gap-3">
            <span className="text-rose-500 text-xl flex-shrink-0" aria-hidden>⚠️</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-rose-800">{t("errors.startFailed")}</p>
              <p className="text-xs text-rose-600 mt-0.5 break-words">{state.error}</p>
            </div>
            <button
              onClick={reset}
              className="text-xs text-rose-700 hover:text-rose-900 font-medium px-2 py-1 rounded hover:bg-rose-100 flex-shrink-0"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      <main id="main-content" tabIndex={-1} className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
          {state.status === "loading" && t("status.loading")}
          {state.status === "running" && t("status.running")}
          {state.status === "completed" && t("status.completed")}
          {state.status === "error" && (state.error || t("status.error"))}
        </div>
        {!hasSession ? (
          <div className="max-w-2xl mx-auto py-8">
            <div className="text-center mb-8">
              <h2 className="text-3xl font-bold text-slate-800 tracking-tight mb-3">
                {t("hero.title")}
              </h2>
              <p className="text-slate-500 text-lg">
                {t("hero.subtitle")}
              </p>
            </div>
            <QueryInput onSubmit={handleSubmit} isLoading={isRunning} />

            <div className="mt-6 space-y-4">
              <RecentQueries onSelect={handleSubmit} isLoading={isRunning} />
              <CachedSessionsList
                refreshKey={cacheRefreshKey}
                onSelect={handleRestoreFromCache}
                onClear={() => setCacheRefreshKey((k) => k + 1)}
              />
            </div>

            <div className="mt-10">
              <p className="text-center text-sm text-slate-500 mb-4">
                {t("studio.poweredBy")}
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {allAgentIds.map((id) => {
                  const meta = AGENT_METADATA[id];
                  return (
                    <div key={id} className="p-3 bg-white rounded-xl border border-slate-200 text-center">
                      <div className="text-2xl mb-1" aria-hidden>{meta.icon}</div>
                      <p className="text-sm font-semibold text-slate-700">{t(("agent." + (Object.entries(AGENT_METADATA).find(([,m]) => m === meta) || ["", null])[0] + ".name") as any, meta.name)}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{t(("agent." + (Object.entries(AGENT_METADATA).find(([,m]) => m === meta) || ["", null])[0] + ".description") as any, meta.description)}</p>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="mt-10 text-center text-xs text-slate-400 flex flex-wrap items-center justify-center gap-2">
              <span>
                <kbd className="px-1.5 py-0.5 rounded border border-slate-300 bg-white text-slate-600 font-mono">Ctrl/⌘</kbd>
                <span className="mx-1">+</span>
                <kbd className="px-1.5 py-0.5 rounded border border-slate-300 bg-white text-slate-600 font-mono">Enter</kbd>
                <span className="ml-1">{t("studio.tipStart")}</span>
              </span>
              <span className="text-slate-300">·</span>
              <span>
                <kbd className="px-1.5 py-0.5 rounded border border-slate-300 bg-white text-slate-600 font-mono">Esc</kbd>
                <span className="ml-1">{t("studio.tipReset")}</span>
              </span>
            </div>
          </div>
        ) : (
          <div className="flex flex-col lg:flex-row gap-6">
            {/* Mobile sidebar toggle */}
            <button
              onClick={() => setSidebarOpen((v) => !v)}
              className="lg:hidden flex items-center justify-between w-full py-3 px-4 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-700 shadow-sm"
              aria-expanded={sidebarOpen}
              aria-controls="studio-sidebar"
            >
              <span className="flex items-center gap-2">
                <span aria-hidden>🎛️</span>
                <span>Research controls</span>
                <span className="text-xs text-slate-500">
                  ({Object.values(state.agents).filter((a) => a.status === "done").length}/6 agents)
                </span>
              </span>
              <span aria-hidden className={"transition-transform " + (sidebarOpen ? "rotate-180" : "")}>▾</span>
            </button>
            <aside
              id="studio-sidebar"
              data-no-print
              className={"w-full lg:w-96 flex-shrink-0 space-y-4 " + (sidebarOpen ? "block" : "hidden lg:block")}
            >
              <QueryInput
                onSubmit={handleSubmit}
                isLoading={isRunning}
                defaultQuery={state.query}
                defaultKeywords={state.keywords}
              />

              <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-slate-800">{t("studio.researchAgents")}</h3>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      state.status === "completed"
                        ? "bg-emerald-100 text-emerald-700"
                        : state.status === "running" || state.status === "loading"
                        ? "bg-amber-100 text-amber-700"
                        : state.status === "error"
                        ? "bg-rose-100 text-rose-700"
                        : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {state.status === "completed"
                      ? "Complete"
                      : state.status === "running" || state.status === "loading"
                      ? "Running"
                      : state.status === "error"
                      ? "Error"
                      : "Idle"}
                  </span>
                </div>
                <div className="space-y-2">
                  {allAgentIds.map((agentId) => (
                    <AgentCard
                      key={agentId}
                      agentId={agentId}
                      state={{
                        status: state.agents[agentId].status as any,
                        progress: state.agents[agentId].progress,
                        currentStep: state.agents[agentId].currentStep,
                      }}
                      isActive={state.activeAgentTab === agentId}
                      onClick={() => setActiveAgentTab(agentId)}
                      error={state.agentErrors[agentId]}
                    />
                  ))}
                </div>
              </div>

              {state.status === "completed" && state.sessionId && (
                <ExportActions
                  sessionId={state.sessionId}
                  query={state.query}
                  keywords={state.keywords}
                  outputs={state.agentOutputs}
                />
              )}

              {history.length > 0 && state.status !== "running" && (
                <RecentQueries onSelect={handleSubmit} isLoading={isRunning} />
              )}
            </aside>

            <section className="flex-1 min-h-[600px]">
              <ReportView
                activeAgent={state.activeAgentTab}
                outputs={state.agentOutputs}
                isLoading={isRunning}
                onSwitchTab={setActiveAgentTab}
              />
            </section>
          </div>
        )}
      </main>

      <footer className="border-t border-slate-200 bg-white/50 mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 text-center">
          <p className="text-xs text-slate-400">
            {t("footer.tagline")}
          </p>
        </div>
      </footer>
    </div>
  );
}
