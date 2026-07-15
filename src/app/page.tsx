/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable react-hooks/exhaustive-deps, react-hooks/set-state-in-effect, react-hooks/immutability, react-hooks/preserve-manual-memoization */
/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useCallback, useState, useRef } from "react";
import {
  normalizeResumeSessionId,
  useResearchStudio,
} from "@/lib/research/use-research-studio";
import { useResearchHistory } from "@/lib/research/history";
import { useSessionBridge } from "@/lib/research/use-session-bridge";
import type { CachedSession } from "@/lib/research/session-cache";
import { QueryInput } from "@/components/studio/QueryInput";
import { RecentQueries } from "@/components/studio/RecentQueries";
import { CachedSessionsList } from "@/components/studio/CachedSessionsList";
import { ResearchModeSelector } from "@/components/studio/ResearchModeSelector";
import { ResearchProtocolPanel } from "@/components/studio/ResearchProtocolPanel";
import { ResearchTeamRoster, WorkspaceStatsStrip } from "@/components/studio/WorkspaceSummary";
import { AgentCard } from "@/components/agents/AgentCard";
import { ReportView } from "@/components/report/ReportView";
import { ExportActions } from "@/components/report/ExportActions";
import { ShareButton } from "@/components/report/ShareButton";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { LanguageSwitcher } from "@/components/ui/LanguageSwitcher";
import { ProviderPill } from "@/components/ui/ProviderPill";
import { ActionableError } from "@/components/ui/ActionableError";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { useFreezeMode } from "@/lib/perf/use-freeze-mode";
import { getStarredRunIds } from "@/lib/research/starred";
import { listTemplates } from "@/lib/research/templates";
import { generateSuggestions } from "@/lib/research/suggestions";
import {
  DEFAULT_RESEARCH_MODE,
  getResearchModeConfig,
  normalizeResearchMode,
  type ResearchModeAvailability,
  type ResearchModeId,
} from "@/lib/research/research-modes";
import { useDeepResearchCapability } from "@/lib/research/use-deep-research-capability";

export default function Home() {
  useFreezeMode();
  const { t } = useLocale();
  // R219: split the hook into `session` (long-lived) and `transient`
  // (rate-limit / reconnect / polling) so the rate-limit pill and
  // connection banner can subscribe to transient without dragging the
  // agent card tree through a re-render every second.
  const {
    session: state,
    transient,
    startResearch,
    resumeResearch,
    restoreCachedSession,
    cancel,
    setActiveAgentTab,
    reset,
    allAgentIds,
  } = useResearchStudio();
  const { capability: deepCapability } = useDeepResearchCapability();
  const { history, addEntry } = useResearchHistory();
  const isCancelling = state.status === "cancelling";
  const isRunning = state.status === "running" || state.status === "loading" || isCancelling;
  const hasSession = state.sessionId !== null;
  // A failed cancellation restores the live run and keeps its error message;
  // don't hide that actionable failure merely because the run is still active.
  const hasError = !!state.error;
  // R205: count agents whose real-provider call degraded to mock, so the
  // completed report can surface a session-level "demo data" banner. Without
  // this a user reading the final report would have no idea some sections
  // are illustrative rather than authoritative.
  const degradedAgentIds = allAgentIds.filter((id) => state.agents[id]?.degraded);
  const degradedCount = degradedAgentIds.length;
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    setNowMs(Date.now());
  }, []);
  const rateLimitRemainingSec = transient.rateLimitUntilMs
    ? Math.max(0, Math.ceil((transient.rateLimitUntilMs - nowMs) / 1000))
    : 0;
  const isRateLimited = transient.rateLimitUntilMs !== null && rateLimitRemainingSec > 0;
  const reconnectRemainingSec = transient.reconnectUntilMs
    ? Math.max(0, Math.ceil((transient.reconnectUntilMs - nowMs) / 1000))
    : 0;
  const isReconnecting = transient.reconnectUntilMs !== null && reconnectRemainingSec > 0;
  const isPollingFallback = transient.pollingIntervalMs !== null;
  const pollingSecs = transient.pollingIntervalMs
    ? Math.max(1, Math.round(transient.pollingIntervalMs / 1000))
    : 0;
  const [cacheRefreshKey, setCacheRefreshKey] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [researchMode, setResearchMode] = useState<ResearchModeId>(DEFAULT_RESEARCH_MODE);
  const [urlPrefill, setUrlPrefill] = useState<{ query: string; keywords: string[] }>({
    query: "",
    keywords: [],
  });
  const urlBootstrapHandledRef = useRef(false);
  const modeConfig = getResearchModeConfig(researchMode);
  const readyDeepRequirements = deepCapability?.requirements.filter((item) => item.ready).length ?? 0;
  const totalDeepRequirements = deepCapability?.requirements.length ?? 0;
  const firstDeepBlocker = deepCapability?.requirements.find((item) => !item.ready);
  const firstDeepBlockerLabel = firstDeepBlocker
    ? t(`researchRequirement.${firstDeepBlocker.id}`, firstDeepBlocker.label)
    : null;
  const runtimeModeAvailability: Partial<Record<ResearchModeId, ResearchModeAvailability>> = {
    standard: "available",
    deep: deepCapability?.availability ?? "preview",
  };
  const runtimeModeReadiness: Partial<Record<ResearchModeId, { ready: number; total: number }>> =
    deepCapability
      ? { deep: { ready: readyDeepRequirements, total: totalDeepRequirements } }
      : {};
  const canStartSelectedMode =
    researchMode === "standard" || deepCapability?.availability === "available";
  const modeLabel = t(`researchMode.${researchMode}.label`, modeConfig.label);
  const modeCapabilityNotice = researchMode === "deep" && deepCapability
    ? deepCapability.availability === "available"
      ? t("researchProtocol.deepReadyNotice")
      : [
          t("researchProtocol.deepPreviewNotice", {
            ready: readyDeepRequirements,
            total: totalDeepRequirements,
          }),
          firstDeepBlockerLabel
            ? t("researchProtocol.nextBlocker", { label: firstDeepBlockerLabel })
            : null,
        ].filter((part): part is string => Boolean(part)).join(" ")
    : t(
        `researchMode.${researchMode}.capabilityNotice`,
        modeConfig.capabilityNotice,
        { seconds: modeConfig.maxSynchronousDurationSec },
      );
  const activeModeConfig = getResearchModeConfig(state.mode);
  const activeModeLabel = t(`researchMode.${state.mode}.label`, activeModeConfig.label);
  // Tracks whether the user has manually clicked an agent tab during the
  // current research run. The auto-switch effect (below) follows progress by
  // jumping to the next completing agent, but must NOT override an explicit
  // user selection — otherwise clicking a tab mid-run gets yanked away ~0.4s
  // later. Reset to false whenever a new research starts.
  const userSelectedTabRef = useRef(false);
  const [, setTick] = useState(0);
  // Re-render at ~2Hz while any countdown/polling state is visible so the
  // seconds labels in aria-live/banner text stay in sync with wall-clock.
  useEffect(() => {
    const needTick = isRateLimited || isReconnecting || isPollingFallback;
    if (!needTick) return;
    const id = setInterval(() => setTick((n) => n + 1), 500);
    return () => clearInterval(id);
  }, [isRateLimited, isReconnecting, isPollingFallback]);
  const [stats, setStats] = useState<{
    totalRuns: number;
    starredCount: number;
    thisWeekRuns: number;
    totalDurationMin: number;
    templates: number;
  } | null>(null);
  const [suggestions, setSuggestions] = useState<any[]>([]);

  // Bridge: persist on completion, detect share links, restore from cache
  // Build a ResearchSession-shaped object for the bridge.
  // Rebuild the session-level citation list from per-agent outputs so local
  // dossier snapshots preserve an accurate source count after server expiry.
  const bridgeCitations = Array.from(
    new Map(
      Object.values(state.agentOutputs)
        .flatMap((output) => output?.citations ?? [])
        .map((citation) => [citation.id, citation]),
    ).values(),
  );
  const bridgeStatus: "pending" | "running" | "completed" | "cancelled" | "error" | null =
    state.status === "loading"
      ? "pending"
      : state.status === "cancelling"
        ? "running"
        : state.status === "idle"
          ? null
          : state.status;
  const bridge = useSessionBridge(
    hasSession && bridgeStatus
      ? {
          id: state.sessionId || "",
          query: state.query,
          keywords: state.keywords,
          mode: state.mode,
          createdAt: state.createdAt ?? state.updatedAt ?? "1970-01-01T00:00:00.000Z",
          updatedAt: state.updatedAt ?? state.createdAt ?? "1970-01-01T00:00:00.000Z",
          status: bridgeStatus,
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
                ...(state.agents[id].degraded
                  ? {
                      degraded: true,
                      degradedReason: state.agents[id].degradedReason,
                    }
                  : {}),
              },
            ]),
          ) as any,
          citations: bridgeCitations,
          ...(state.evidence ? { evidence: state.evidence } : {}),
          ...(state.validation ? { validation: state.validation } : {}),
        }
      : null,
  );

  // Templates and historical reports use two generations of query-string
  // keys. Accept both so every existing "use template" / "rerun" path
  // reliably prefills the studio. A durable session link takes precedence:
  // it hydrates the authoritative snapshot instead of starting another run.
  useEffect(() => {
    if (urlBootstrapHandledRef.current) return;
    urlBootstrapHandledRef.current = true;
    const params = new URLSearchParams(window.location.search);
    const resumeSessionId = normalizeResumeSessionId(params.get("session"));
    if (resumeSessionId) {
      void resumeResearch(resumeSessionId);
      return;
    }
    const query = params.get("q") ?? params.get("query") ?? "";
    const keywordsValue = params.get("k") ?? params.get("keywords") ?? "";
    const keywords = keywordsValue
      .split(",")
      .map((keyword) => keyword.trim())
      .filter(Boolean);
    if (query || keywords.length > 0) setUrlPrefill({ query, keywords });
    const requestedMode = params.get("mode");
    if (requestedMode) setResearchMode(normalizeResearchMode(requestedMode));
  }, [resumeResearch]);

  // Keep the durable resume handle in the address bar as soon as a run has an
  // id. Refreshing or copying the page then re-attaches to the same run rather
  // than silently starting over or losing active progress.
  useEffect(() => {
    if (!state.sessionId) return;
    const url = new URL(window.location.href);
    if (url.searchParams.get("session") === state.sessionId) return;
    url.searchParams.set("session", state.sessionId);
    window.history.replaceState(
      window.history.state,
      "",
      `${url.pathname}${url.search}${url.hash}`,
    );
  }, [state.sessionId]);

  useEffect(() => {
    if (hasSession) setResearchMode(state.mode);
  }, [hasSession, state.mode]);

  // Load dashboard stats on mount.
  // R224: fetch a single pre-aggregated payload from /api/research/stats
  // instead of pulling up to 100 summary rows and re-counting on the client.
  // The old ?limit=500 was silently capped to 100 by the runs route, so
  // totalRuns was already wrong past 100 runs. starredCount + templates stay
  // client-side (they derive from localStorage, which the server can't see).
  useEffect(() => {
    const loadStats = async () => {
      try {
        const res = await fetch("/api/research/stats");
        if (res.ok) {
          const data = await res.json();
          const starred = getStarredRunIds();

          setStats({
            totalRuns: data.totalRuns ?? 0,
            starredCount: starred.length,
            thisWeekRuns: data.recentRuns ?? 0,
            totalDurationMin: data.totalDurationMin ?? 0,
            templates: listTemplates().length,
          });
        }
      } catch {
        // Silently fail — stats are a nice-to-have
      }
    };
    void loadStats();

    // Generate suggestions
    const loadSuggestions = async () => {
      try {
        const res = await fetch("/api/research/runs?limit=100");
        if (res.ok) {
          const data = await res.json();
          const recs = generateSuggestions(data.runs || [], 4);
          setSuggestions(recs);
        }
      } catch {
        // Suggestions are optional
      }
    };
    void loadSuggestions();
  }, []);

  // Persist a history entry with the real session id so local recovery links
  // point at /research/<sessionId> instead of a random browser-only id.
  useEffect(() => {
    if (state.sessionId && state.query && state.status !== "idle") {
      addEntry(state.query, state.keywords, {
        id: state.sessionId,
        status:
          state.status === "completed"
            ? "completed"
            : state.status === "cancelled"
              ? "cancelled"
            : state.status === "error"
              ? "failed"
              : "running",
      });
    }
  }, [state.sessionId, state.query, state.keywords, state.status, addEntry]);

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
      if (!canStartSelectedMode) return;
      setSidebarOpen(false);
      userSelectedTabRef.current = false;
      startResearch(query, keywords, researchMode);
    },
    [canStartSelectedMode, researchMode, startResearch],
  );

  const resetWorkspace = useCallback(() => {
    reset();
    const url = new URL(window.location.href);
    if (!url.searchParams.has("session")) return;
    url.searchParams.delete("session");
    window.history.replaceState(
      window.history.state,
      "",
      `${url.pathname}${url.search}${url.hash}`,
    );
  }, [reset]);

  // Restore means restore: hydrate the cached dossier without spending quota
  // or silently starting a different run.
  const handleRestoreFromCache = useCallback((cached: CachedSession) => {
    if (!cached.outputs) return;
    userSelectedTabRef.current = false;
    setResearchMode(normalizeResearchMode(cached.mode));
    restoreCachedSession(cached);
  }, [restoreCachedSession]);

  // Keyboard shortcut: ⌘/Ctrl + Enter submits the query
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        const form = document.querySelector<HTMLFormElement>("form[data-research-form]");
        form?.requestSubmit();
      }
      if (e.key === "Escape" && hasSession && !isRunning) {
        if (sidebarOpen) setSidebarOpen(false);
        else resetWorkspace();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hasSession, isRunning, resetWorkspace]);

  // Auto-switch tab to the first agent that completes — but only until the
  // user manually selects a tab. Once they've clicked one, we stop
  // overriding their choice so they can read a completed agent's content in
  // peace while synthesis is still running (the original "follow progress"
  // behaviour yanked the tab away ~0.4s after a click).
  useEffect(() => {
    if (state.status !== "running") return;
    if (userSelectedTabRef.current) return;
    const nextDone = allAgentIds.find(
      (id) => state.agents[id]?.status === "done" && state.activeAgentTab !== id,
    );
    if (nextDone && state.activeAgentTab === "market-sizer" && nextDone !== "market-sizer") {
      const t = setTimeout(() => setActiveAgentTab(nextDone), 400);
      return () => clearTimeout(t);
    }
  }, [state.agents, state.status, state.activeAgentTab, allAgentIds, setActiveAgentTab]);

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white sticky top-0 z-10">
        <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <img
              src="/logo.svg"
              alt="LaunchLens Research Studio"
              width={40}
              height={40}
              className="w-9 h-9 rounded-md flex-shrink-0"
            />
            <div className="min-w-0">
              <h1 className="text-base font-semibold text-slate-950 tracking-tight truncate">
                LaunchLens Research Studio
              </h1>
              <p className="text-xs text-slate-500 truncate">
                {t("header.subtitle")}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {state.status === "completed" && (
              <span className="hidden sm:inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 px-2.5 py-1.5 rounded-md border border-emerald-200">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                {t("header.researchComplete")}
              </span>
            )}
            {hasSession && state.sessionId && state.status === "completed" && (
              <ShareButton sessionId={state.sessionId} size="sm" label={t("header.share")} />
            )}
            <ProviderPill />
            <LanguageSwitcher />
            <ThemeToggle />
            {hasSession && isRunning && (
              <button
                onClick={() => { setSidebarOpen(false); void cancel(); }}
                disabled={isCancelling}
                className="px-3 py-2 text-sm text-rose-700 hover:text-rose-900 hover:bg-rose-50 rounded-md transition-colors font-medium disabled:cursor-wait disabled:opacity-60"
                aria-label={isCancelling ? t("queryInput.cancellingAriaLabel") : t("queryInput.cancelAriaLabel")}
                aria-busy={isCancelling}
              >
                {isCancelling ? t("queryInput.cancellingButton") : t("queryInput.cancelButton")}
              </button>
            )}
            {hasSession && (
              <button
                onClick={() => { setSidebarOpen(false); resetWorkspace(); }}
                disabled={isRunning}
                className="px-3 py-2 text-sm text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-md transition-colors disabled:opacity-50"
              >
                {t("header.newResearch")}
              </button>
            )}
          </div>
        </div>
      </header>

      {hasError && (
        <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 pt-4">
          <ActionableError
            variant="error"
            title={t("errors.retryTitle")}
            detail={
              <>
                <p>{state.error}</p>
                <p className="mt-1 opacity-90">{t("errors.retryHint")}</p>
              </>
            }
            actions={[
              {
                label: t("errors.tryAgain"),
                onClick: () => {
                  if (state.query) {
                    userSelectedTabRef.current = false;
                    startResearch(state.query, state.keywords ?? []);
                  }
                },
              },
              {
                label: t("errors.dismiss"),
                onClick: resetWorkspace,
                variant: "secondary",
              },
            ]}
          />
        </div>
      )}

      {/* Visible transient-status banners. All non-error states (rate limit,
          reconnect, polling) share the same aria-live region so screen readers
          announce the countdowns as they update. */}
      {(isRateLimited || isReconnecting || isPollingFallback) && (
        <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 pt-4">
          <div
            role="status"
            aria-live="polite"
            aria-atomic="true"
            className={
              "rounded-lg p-3 flex items-center gap-3 border text-sm " +
              (isRateLimited
                ? "bg-amber-50 border-amber-200 text-amber-800"
                : "bg-sky-50 border-sky-200 text-sky-800")
            }
          >
            <span className="text-base flex-shrink-0" aria-hidden>
              {isRateLimited ? "⏳" : isReconnecting ? "🔌" : "📡"}
            </span>
            <span className="flex-1">
              {isRateLimited && (
                <>
                  {t("status.retryingIn", { seconds: String(rateLimitRemainingSec) })}
                  {transient.retryCount > 0 && (
                    <span className="ml-2 text-xs opacity-75">
                      {t("status.retryCount", { count: String(transient.retryCount) })}
                    </span>
                  )}
                </>
              )}
              {!isRateLimited && isReconnecting &&
                t("status.reconnectingIn", { seconds: String(reconnectRemainingSec) })}
              {!isRateLimited && !isReconnecting && isPollingFallback && t("status.pollingEvery", { seconds: String(pollingSecs) })}
            </span>
          </div>
        </div>
      )}

      <main id="main-content" tabIndex={-1} className="max-w-screen-2xl mx-auto px-4 sm:px-6 py-5">
        {/* R205: when the completed run has agents that degraded to demo data,
            surface a session-level banner so a reader of the report knows some
            sections are illustrative. Per-agent "demo" badges exist on the
            AgentCards during the run, but the final report view would otherwise
            hide that context. */}
        {!isRunning && degradedCount > 0 && (
          <div
            role="status"
            aria-live="polite"
            className="mb-4 bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-3"
          >
            <span className="text-amber-500 text-lg flex-shrink-0" aria-hidden>⚠️</span>
            <div className="flex-1 min-w-0 text-sm text-amber-800">
              <p className="font-medium">
                {t("report.degradedBanner.title", "{count} agent(s) showing demo data", { count: String(degradedCount) })}
              </p>
              <p className="text-xs text-amber-700 mt-0.5">
                {t(
                  "report.degradedBanner.body",
                  "Some agents could not reach the real LLM provider and fell back to illustrative mock data. Check your API key and provider configuration, then re-run for authoritative results.",
                )}
              </p>
            </div>
          </div>
        )}
        <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
          {state.status === "loading" && t("status.loading")}
          {state.status === "running" && !isReconnecting && !isPollingFallback && t("status.running")}
          {state.status === "cancelling" && t("status.cancelling")}
          {state.status === "completed" && t("status.completed")}
          {state.status === "cancelled" && t("status.cancelled")}
          {state.status === "error" && (state.error || t("status.error"))}
          {isRateLimited && t("status.retryingIn", { seconds: String(rateLimitRemainingSec) })}
          {isReconnecting && t("status.reconnectingIn", { seconds: String(reconnectRemainingSec) })}
          {isPollingFallback && t("status.polling")}
          {transient.rateLimitUntilMs !== null && rateLimitRemainingSec === 0 && t("status.readyToRetry")}
        </div>
        {!hasSession ? (
          <div className="py-3 sm:py-5">
            <div className="mb-6 max-w-3xl">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-teal-700 dark:text-teal-300">
                {t("workspace.hero.eyebrow")}
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">
                {t("workspace.hero.title")}
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">
                {t("workspace.hero.subtitle")}
              </p>
            </div>

            <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
              <section className="rounded-xl border border-slate-200 bg-white lg:col-span-2" aria-labelledby="new-run-title">
                <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4 sm:px-6">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{t("workspace.newRun.eyebrow")}</p>
                    <h2 id="new-run-title" className="mt-1 text-base font-semibold text-slate-950">{t("workspace.newRun.title")}</h2>
                  </div>
                  <span className="hidden rounded bg-slate-100 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-600 sm:inline">
                    {t("workspace.newRun.teamComposition")}
                  </span>
                </div>
                <div className="space-y-5 p-5 sm:p-6">
                  <ResearchModeSelector
                    value={researchMode}
                    onChange={setResearchMode}
                    runtimeAvailability={runtimeModeAvailability}
                    readiness={runtimeModeReadiness}
                  />
                  <div className="border-t border-slate-100 pt-5">
                    <QueryInput
                      onSubmit={handleSubmit}
                      onCancel={state.sessionId ? cancel : undefined}
                      isLoading={isRunning}
                      isCancelling={isCancelling}
                      defaultQuery={urlPrefill.query}
                      defaultKeywords={urlPrefill.keywords}
                      disabledUntilMs={transient.rateLimitUntilMs}
                      retryReadyPulse={transient.retryReadyPulse}
                      submitDisabled={!canStartSelectedMode}
                      submitDisabledReason={!canStartSelectedMode ? modeCapabilityNotice : undefined}
                      submitLabel={canStartSelectedMode
                        ? t("workspace.startMode", { mode: modeLabel })
                        : t("workspace.deepResearchPreparing")}
                      variant="embedded"
                    />
                  </div>
                </div>
              </section>

              <div className="space-y-5">
                <ResearchProtocolPanel
                  mode={researchMode}
                  runtimeCapability={deepCapability}
                />
                <WorkspaceStatsStrip stats={stats} />
              </div>

              {suggestions.length > 0 && (
                <section className="rounded-xl border border-slate-200 bg-white lg:col-span-2" aria-labelledby="suggested-research-title">
                  <div className="border-b border-slate-100 px-4 py-3 sm:px-5">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{t("workspace.suggestions.eyebrow")}</p>
                    <h2 id="suggested-research-title" className="mt-1 text-sm font-semibold text-slate-900">{t("workspace.suggestions.title")}</h2>
                  </div>
                  <div className="grid sm:grid-cols-2">
                    {suggestions.map((suggestion, index) => (
                      <button
                        key={`${suggestion.title}-${index}`}
                        type="button"
                        className="border-t border-slate-100 px-4 py-4 text-left transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 sm:px-5 sm:odd:border-r"
                        onClick={() => handleSubmit(suggestion.title, suggestion.keywords)}
                        disabled={isRunning || !canStartSelectedMode}
                      >
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-teal-700 dark:text-teal-300">
                          {suggestion.category === "follow-up" ? t("workspace.suggestion.followUp") :
                           suggestion.category === "deep-dive" ? t("workspace.suggestion.deepDive") :
                           suggestion.category === "related" ? t("workspace.suggestion.related") : t("workspace.suggestion.trending")}
                        </span>
                        <span className="mt-1.5 block text-sm font-semibold leading-5 text-slate-800">{suggestion.title}</span>
                        <span className="mt-1 block text-xs leading-5 text-slate-500">{suggestion.description}</span>
                      </button>
                    ))}
                  </div>
                </section>
              )}

              <div className="space-y-5">
                <RecentQueries onSelect={handleSubmit} isLoading={isRunning || !canStartSelectedMode} />
                <CachedSessionsList
                  refreshKey={cacheRefreshKey}
                  onSelect={handleRestoreFromCache}
                  onClear={() => setCacheRefreshKey((key) => key + 1)}
                />
              </div>
            </div>

            <div className="mt-5">
              <ResearchTeamRoster agentIds={allAgentIds} />
            </div>

            <div className="mt-6 text-center text-xs text-slate-600 flex flex-wrap items-center justify-center gap-2">
              <span>
                <kbd className="px-1.5 py-0.5 rounded border border-slate-300 bg-white text-slate-600 font-mono">Ctrl/⌘</kbd>
                <span className="mx-1">+</span>
                <kbd className="px-1.5 py-0.5 rounded border border-slate-300 bg-white text-slate-600 font-mono">Enter</kbd>
                <span className="ml-1">{t("studio.tipStart")}</span>
              </span>
              <span className="text-slate-500">·</span>
              <span>
                <kbd className="px-1.5 py-0.5 rounded border border-slate-300 bg-white text-slate-600 font-mono">Esc</kbd>
                <span className="ml-1">{t("studio.tipReset")}</span>
              </span>
            </div>
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-12">
            {/* Mobile sidebar toggle */}
            <button
              onClick={() => setSidebarOpen((v) => !v)}
              className="lg:hidden flex items-center justify-between w-full py-3 px-4 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-700"
              aria-expanded={sidebarOpen}
              aria-controls="studio-sidebar"
            >
              <span className="flex items-center gap-2">
                <span>{t("workspace.controls")}</span>
                <span className="text-xs text-slate-500">
                  {t("workspace.analystsProgress", {
                    done: Object.values(state.agents).filter((agent) => agent.status === "done").length,
                    total: 6,
                  })}
                </span>
              </span>
              <span aria-hidden className={"transition-transform " + (sidebarOpen ? "rotate-180" : "")}>▾</span>
            </button>
            <aside
              id="studio-sidebar"
              data-no-print
              className={"space-y-4 lg:col-span-4 xl:col-span-3 " + (sidebarOpen ? "block" : "hidden lg:block")}
            >
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <ResearchModeSelector
                  value={state.mode}
                  onChange={setResearchMode}
                  disabled
                  compact
                  runtimeAvailability={runtimeModeAvailability}
                  readiness={runtimeModeReadiness}
                />
              </div>

              <QueryInput
                onSubmit={handleSubmit}
                onCancel={state.sessionId ? cancel : undefined}
                isLoading={isRunning}
                isCancelling={isCancelling}
                defaultQuery={state.query}
                defaultKeywords={state.keywords}
                disabledUntilMs={transient.rateLimitUntilMs}
                retryReadyPulse={transient.retryReadyPulse}
                submitLabel={t("workspace.rerunMode", { mode: activeModeLabel })}
              />

              <section className="bg-white rounded-xl border border-slate-200 p-4" aria-labelledby="active-analysts-title">
                <div className="flex items-center justify-between mb-3">
                  <h2 id="active-analysts-title" className="font-semibold text-slate-900 text-sm">{t("studio.researchAgents")}</h2>
                  <span
                    className={`text-[10px] px-2 py-1 rounded font-semibold uppercase tracking-wide ${
                      state.status === "completed"
                        ? "bg-emerald-100 text-emerald-700"
                        : state.status === "running" || state.status === "loading" || state.status === "cancelling"
                        ? "bg-amber-100 text-amber-700"
                        : state.status === "cancelled"
                        ? "bg-slate-200 text-slate-700"
                        : state.status === "error"
                        ? "bg-rose-100 text-rose-700"
                        : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {state.status === "completed"
                      ? t("workspace.runStatus.complete")
                      : state.status === "cancelling"
                      ? t("workspace.runStatus.cancelling")
                      : state.status === "running" || state.status === "loading"
                      ? t("workspace.runStatus.running")
                      : state.status === "cancelled"
                      ? t("workspace.runStatus.cancelled")
                      : state.status === "error"
                      ? t("workspace.runStatus.error")
                      : t("workspace.runStatus.idle")}
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
                        ...(state.agents[agentId].degraded
                          ? { degraded: true, degradedReason: state.agents[agentId].degradedReason }
                          : {}),
                      }}
                      isActive={state.activeAgentTab === agentId}
                      onClick={() => {
                        userSelectedTabRef.current = true;
                        setActiveAgentTab(agentId);
                      }}
                      error={state.agentErrors[agentId]}
                      cancelled={state.status === "cancelled"}
                    />
                  ))}
                </div>
              </section>

              {state.status === "completed" && state.sessionId && (
                <ExportActions
                  sessionId={state.sessionId}
                  query={state.query}
                  keywords={state.keywords}
                  outputs={state.agentOutputs}
                  mode={state.mode}
                  validation={state.validation ?? undefined}
                />
              )}

              {history.length > 0 && !isRunning && (
                <RecentQueries onSelect={handleSubmit} isLoading={isRunning || !canStartSelectedMode} />
              )}
            </aside>

            <section className="min-h-[600px] lg:col-span-8 xl:col-span-6">
              <ReportView
                activeAgent={state.activeAgentTab}
                outputs={state.agentOutputs}
                isLoading={isRunning}
                onSwitchTab={(id) => {
                  userSelectedTabRef.current = true;
                  setActiveAgentTab(id);
                }}
              />
            </section>

            <aside className="lg:col-span-12 xl:col-span-3" aria-label={t("workspace.aria.evidenceValidation")}>
              <ResearchProtocolPanel
                mode={state.mode}
                runtimeCapability={deepCapability}
                deepRun={state.deepRun}
                outputs={state.agentOutputs}
                agents={state.agents}
                evidence={state.evidence}
                validation={state.validation}
                status={state.status}
                className="xl:sticky xl:top-20"
              />
            </aside>
          </div>
        )}
      </main>

      <footer className="border-t border-slate-200 bg-white mt-8">
        <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 py-5 text-center">
          <p className="text-xs text-slate-600">
            {t("footer.tagline")}
          </p>
        </div>
      </footer>
    </div>
  );
}
