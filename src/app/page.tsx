/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable react-hooks/exhaustive-deps, react-hooks/set-state-in-effect, react-hooks/immutability, react-hooks/preserve-manual-memoization */
/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useCallback, useState, useMemo } from "react";
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
import { SUPPORTED_LOCALES } from "@/lib/i18n/dictionaries";
import { AGENT_METADATA } from "@/lib/schema/research-schema";
import type { AgentId } from "@/lib/schema/research-schema";

export default function Home() {
  const { t, fmt, locale, setLocale } = useLocale();
  const { state, startResearch, setActiveAgentTab, reset, clearFormError, hydrateFromCache, allAgentIds } = useResearchStudio();
  const { history, addEntry } = useResearchHistory();
  const isRunning = state.status === "running" || state.status === "loading";
  const hasSession = state.sessionId !== null;
  const cooldownActive =
    !!state.formError && state.formError.code === "RATE_LIMITED" && state.retryAfterSeconds > 0;
  // Two kinds of top-level error banner:
  //  - Start-time failures that weren't rendered inline inside QueryInput
  //    (network errors, 5xx — handled inline as formError.general, excluded here).
  //  - Mid-session expiry: SESSION_EXPIRED formError is raised after the form is
  //    gone (polling 404) and must appear as a top-level banner with a localized
  //    message, not the English fallback stored in state.error.
  const sessionExpired = state.formError?.code === "SESSION_EXPIRED";
  const hasError = (state.status === "error" && state.error && !state.formError) || sessionExpired;
  const errorTitle = sessionExpired
    ? t("errors.sessionExpired")
    : t("errors.startFailed");
  const errorDetail = sessionExpired
    ? t("errors.sessionExpired")
    : state.error;
  const [cacheRefreshKey, setCacheRefreshKey] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  // Bridge: persist on completion, detect share links, restore from cache.
  // Build a ResearchSession-shaped object for the bridge.
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

  // Trigger cache refresh when a session completes (so CachedSessionsList updates)
  useEffect(() => {
    if (state.status === "completed") {
      setCacheRefreshKey((k) => k + 1);
    }
  }, [state.status]);

  // If the user followed a share link, restore the shared session
  useEffect(() => {
    if (bridge.pendingRestoreId && bridge.pendingRestore) {
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

  const handleFieldChange = useCallback(
    (field: "query" | "keywords") => {
      // User is editing a field that had a server-side validation error — clear
      // the stale message so they don't keep seeing it while typing.
      clearFormError(field);
    },
    [clearFormError],
  );

  const handleDismissFormError = useCallback(() => {
    clearFormError("general");
  }, [clearFormError]);

  // Restore from cache: hydrate outputs instantly from localStorage without
  // hitting the server (the server is in-memory and does not persist sessions
  // across restarts anyway).
  const handleRestoreFromCache = useCallback((cached: CachedSession) => {
    setSidebarOpen(false);
    hydrateFromCache(cached);
  }, [hydrateFromCache]);

  const doneCount = Object.values(state.agents).filter((a) => a.status === "done").length;

  // Detected once at mount; used to render the correct modifier glyph in
  // help-modal shortcut labels (⌘ on macOS, Ctrl everywhere else).
  const isMac = useMemo(() => {
    if (typeof navigator === "undefined") return false;
    return /Mac|iPod|iPhone|iPad/.test(navigator.platform || "");
  }, []);
  const modKey = isMac ? "⌘" : "Ctrl";

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isTyping =
        target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);

      // Cmd/Ctrl+K focuses the query input (like command palette).
      if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        const ta = document.querySelector<HTMLTextAreaElement>("#query-input");
        ta?.focus();
        ta?.select();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        // Respect loading / rate-limit cooldown so the shortcut can't bypass
        // the disabled submit button, and don't fire when the user is in a
        // textarea (Enter already submits natively via <form>).
        if (isRunning || cooldownActive || isTyping) return;
        const form = document.querySelector<HTMLFormElement>("form[data-research-form]");
        const btn = form?.querySelector<HTMLButtonElement>("button[type=submit]");
        if (btn && btn.disabled) return;
        form?.requestSubmit();
      }
      if (e.key === "Escape") {
        // Staged Esc dismissal: help modal → sidebar → general form error →
        // reset to fresh form. This avoids wiping a running session when the
        // user just wanted to close a modal or dismiss a rate-limit banner.
        if (helpOpen) { setHelpOpen(false); return; }
        if (sidebarOpen) { setSidebarOpen(false); return; }
        if (state.formError?.field === "general") { clearFormError("general"); return; }
        if (hasSession && !isRunning) reset();
        return;
      }
      if (!isTyping && e.key === "?" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setHelpOpen(true);
      }
      // Cycle locales with Cmd/Ctrl+Shift+L
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === "l" || e.key === "L")) {
        e.preventDefault();
        const idx = SUPPORTED_LOCALES.indexOf(locale);
        const nextIdx = (idx + 1) % SUPPORTED_LOCALES.length;
        setLocale(SUPPORTED_LOCALES[nextIdx]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hasSession, isRunning, cooldownActive, reset, helpOpen, sidebarOpen, locale, setLocale, state.formError, clearFormError]);

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

  const statusLabelKey =
    state.status === "completed" ? "status.label.complete"
    : state.status === "running" || state.status === "loading" ? "status.label.running"
    : state.status === "error" ? "status.label.error"
    : "status.label.idle";

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
              <ShareButton sessionId={state.sessionId} size="sm" label={t("header.share")} />
            )}
            <button
              onClick={() => setHelpOpen(true)}
              className="hidden sm:inline-flex w-8 h-8 items-center justify-center rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors"
              title={t("studio.help.title")}
              aria-label={t("studio.help.title")}
            >
              ?
            </button>
            <ProviderPill />
            <LanguageSwitcher />
            <ThemeToggle />
            {hasSession && (
              <button
                onClick={() => { setSidebarOpen(false); reset(); }}
                disabled={isRunning}
                className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-50"
              >
                {t("header.newResearch")}
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
              <p className="text-sm font-medium text-rose-800">{errorTitle}</p>
              <p className="text-xs text-rose-600 mt-0.5 break-words">{errorDetail}</p>
            </div>
            <button
              onClick={reset}
              className="text-xs text-rose-700 hover:text-rose-900 font-medium px-2 py-1 rounded hover:bg-rose-100 flex-shrink-0"
            >
              {t("errors.dismiss")}
            </button>
          </div>
        </div>
      )}

      {state.connectionStatus === "reconnecting" && (
        <div className="bg-amber-50 border-b border-amber-200 text-amber-800 px-4 py-2 text-xs flex items-center justify-center gap-2">
          <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
          <span>{t("connection.reconnecting", "Reconnecting to research stream...")}</span>
        </div>
      )}
      {state.connectionStatus === "polling" && (
        <div className="bg-sky-50 border-b border-sky-200 text-sky-800 px-4 py-2 text-xs flex items-center justify-center gap-2">
          <span className="w-2 h-2 rounded-full bg-sky-500" />
          <span>{t("connection.polling", "Stream disconnected — using polling fallback")}</span>
        </div>
      )}

      <main id="main-content" tabIndex={-1} className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
          {state.status === "loading" && t("status.loading")}
          {state.status === "running" && t("status.running")}
          {state.status === "completed" && t("status.completed")}
          {state.formError?.field === "general" &&
            (cooldownActive
              ? `${state.formError.message} ${fmt("errors.retryInSeconds", { n: state.retryAfterSeconds })}`
              : state.formError.message)}
          {state.status === "error" && !state.formError && (state.error || t("status.error"))}
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
            <QueryInput
              onSubmit={handleSubmit}
              isLoading={isRunning}
              serverError={state.formError}
              retryAfterSeconds={state.retryAfterSeconds}
              onFieldChange={handleFieldChange}
              onDismissError={handleDismissFormError}
            />

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
                      <p className="text-sm font-semibold text-slate-700">{t(`agent.${id}.name`, meta.name)}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{t(`agent.${id}.description`, meta.description)}</p>
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
              <span className="text-slate-300">·</span>
              <button
                onClick={() => setHelpOpen(true)}
                className="underline hover:text-slate-600"
              >
                <kbd className="px-1.5 py-0.5 rounded border border-slate-300 bg-white text-slate-600 font-mono">Ctrl/⌘</kbd>
                <span className="mx-1">+</span>
                <kbd className="px-1.5 py-0.5 rounded border border-slate-300 bg-white text-slate-600 font-mono">?</kbd>
              </button>
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
                <span>{t("studio.controls")}</span>
                <span className="text-xs text-slate-500">
                  ({fmt("studio.agentsProgress", { done: doneCount, total: allAgentIds.length })})
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
                serverError={state.formError}
                retryAfterSeconds={state.retryAfterSeconds}
                onFieldChange={handleFieldChange}
                onDismissError={handleDismissFormError}
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
                    {t(statusLabelKey)}
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

      {/* Keyboard shortcuts modal */}
      {helpOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          onClick={() => setHelpOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label={t("studio.help.title")}
        >
          <div
            className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-4">
              <h2 className="text-lg font-bold text-slate-800">{t("studio.help.title")}</h2>
              <button
                onClick={() => setHelpOpen(false)}
                className="text-slate-400 hover:text-slate-700 text-xl leading-none"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <ul className="space-y-3 text-sm">
              <li className="flex items-center justify-between gap-4">
                <span className="text-slate-600">{t("studio.help.start")}</span>
                <span>
                  <kbd className="px-1.5 py-0.5 rounded border border-slate-300 bg-white font-mono text-xs">{modKey}</kbd>
                  <span className="mx-1">+</span>
                  <kbd className="px-1.5 py-0.5 rounded border border-slate-300 bg-white font-mono text-xs">Enter</kbd>
                </span>
              </li>
              <li className="flex items-center justify-between gap-4">
                <span className="text-slate-600">{t("studio.help.reset")}</span>
                <kbd className="px-1.5 py-0.5 rounded border border-slate-300 bg-white font-mono text-xs">Esc</kbd>
              </li>
              <li className="flex items-center justify-between gap-4">
                <span className="text-slate-600">{t("studio.help.shortcuts")}</span>
                <span>
                  <kbd className="px-1.5 py-0.5 rounded border border-slate-300 bg-white font-mono text-xs">{modKey}</kbd>
                  <span className="mx-1">+</span>
                  <kbd className="px-1.5 py-0.5 rounded border border-slate-300 bg-white font-mono text-xs">?</kbd>
                </span>
              </li>
              <li className="flex items-center justify-between gap-4">
                <span className="text-slate-600">{t("studio.help.toggleLanguage", "Toggle language")}</span>
                <span>
                  <kbd className="px-1.5 py-0.5 rounded border border-slate-300 bg-white font-mono text-xs">{modKey}</kbd>
                  <span className="mx-1">+</span>
                  <kbd className="px-1.5 py-0.5 rounded border border-slate-300 bg-white font-mono text-xs">Shift</kbd>
                  <span className="mx-1">+</span>
                  <kbd className="px-1.5 py-0.5 rounded border border-slate-300 bg-white font-mono text-xs">L</kbd>
                </span>
              </li>
              <li className="flex items-center justify-between gap-4">
                <span className="text-slate-600">{t("studio.help.focus", "Focus query input")}</span>
                <span>
                  <kbd className="px-1.5 py-0.5 rounded border border-slate-300 bg-white font-mono text-xs">{modKey}</kbd>
                  <span className="mx-1">+</span>
                  <kbd className="px-1.5 py-0.5 rounded border border-slate-300 bg-white font-mono text-xs">K</kbd>
                </span>
              </li>
            </ul>
            <button
              onClick={() => setHelpOpen(false)}
              className="mt-6 w-full py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm font-medium"
            >
              {t("errors.dismiss")}
            </button>
          </div>
        </div>
      )}

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
