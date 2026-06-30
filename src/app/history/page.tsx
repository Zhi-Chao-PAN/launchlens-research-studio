"use client";

import { fetchWithCsrf } from "@/lib/api/csrf-client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { generateMarkdownReport } from "@/lib/export/markdown-formatter";
import { bulkAddRunsToFolder, getFolders } from "@/lib/research/folders";
import { useResearchHistory } from "@/lib/research/history";
import { parseSynthesis } from "@/lib/research/synthesis-parser";
import { getStarredRunIds } from "@/lib/research/starred";
import {
  bulkAddTags,
  getAllTags,
  getRunTags,
  getTagDetails,
  type RunTag,
} from "@/lib/research/tags";
import type { AgentId, AgentOutput } from "@/lib/schema/research-schema";
import { useToast } from "@/components/toast/ToastContext";
import { useConfirm } from "@/components/ui/useConfirm";
import {
  formatDuration,
  HISTORY_STATUS_META,
  mergeServerRunsWithLocalHistory,
  sortHistoryRuns,
  summarizeHistoryRuns,
  type HistoryRunForView,
  type HistorySortBy,
  type HistoryStatus,
} from "./history-page-utils";

type HistoryRun = HistoryRunForView;

type StatusFilter = "all" | Exclude<HistoryStatus, "running">;

interface RunsResponse {
  runs?: HistoryRun[];
  total?: number;
  limit?: number;
  offset?: number;
}

interface FullResearchRun {
  id: string;
  query: string;
  keywords?: string[];
  result?: string;
}

const PAGE_SIZE = 20;

const STATUS_FILTERS: Array<{ value: StatusFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "completed", label: "Completed" },
  { value: "failed", label: "Failed" },
  { value: "cancelled", label: "Cancelled" },
];

const SORT_OPTIONS: Array<{ value: HistorySortBy; label: string }> = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "fastest", label: "Fastest first" },
  { value: "slowest", label: "Slowest first" },
];

export default function HistoryPage() {
  const [runs, setRuns] = useState<HistoryRun[]>([]);
  const [totalRuns, setTotalRuns] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortBy, setSortBy] = useState<HistorySortBy>("newest");
  const [starredOnly, setStarredOnly] = useState(false);
  const [starredIds, setStarredIds] = useState<Set<string>>(new Set());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectMode, setSelectMode] = useState(false);
  const [bulkActionLoading, setBulkActionLoading] = useState(false);
  const [showFolderMenu, setShowFolderMenu] = useState(false);
  const [showTagMenu, setShowTagMenu] = useState(false);
  const [folders, setFolders] = useState<Array<{ id: string; name: string }>>([]);
  const [allTags, setAllTags] = useState<RunTag[]>([]);
  const { history: localHistory, hydrated: localHistoryHydrated } = useResearchHistory();
  const { showToast } = useToast();
  const { askConfirm, dialog: confirmDialog } = useConfirm();

  const refreshClientMetadata = useCallback(() => {
    setStarredIds(new Set(getStarredRunIds()));
    setAllTags(getAllTags());
    setFolders(
      getFolders()
        .filter((folder) => !folder.isSystem)
        .map((folder) => ({ id: folder.id, name: folder.name })),
    );
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(refreshClientMetadata, 0);
    window.addEventListener("focus", refreshClientMetadata);
    window.addEventListener("storage", refreshClientMetadata);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("focus", refreshClientMetadata);
      window.removeEventListener("storage", refreshClientMetadata);
    };
  }, [refreshClientMetadata]);

  const loadRuns = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      const useClientSideStarredFilter = starredOnly;
      params.set("limit", useClientSideStarredFilter ? "100" : String(PAGE_SIZE));
      params.set("offset", useClientSideStarredFilter ? "0" : String((page - 1) * PAGE_SIZE));

      if (searchQuery.trim()) {
        params.set("q", searchQuery.trim());
      }

      if (statusFilter !== "all") {
        params.set("status", statusFilter);
      }

      const response = await fetch(`/api/research/runs?${params.toString()}`, {
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(`History request failed with HTTP ${response.status}`);
      }

      const data = (await response.json()) as RunsResponse;
      let nextRuns = Array.isArray(data.runs) ? data.runs : [];
      if (localHistoryHydrated) {
        nextRuns = mergeServerRunsWithLocalHistory(nextRuns, localHistory, {
          query: searchQuery,
          status: statusFilter === "all" ? undefined : statusFilter,
        });
      }

      if (useClientSideStarredFilter) {
        nextRuns = nextRuns.filter((run) => starredIds.has(run.id));
      }

      const sorted = sortHistoryRuns(nextRuns, sortBy);
      const serverTotal = typeof data.total === "number" ? data.total : sorted.length;
      const nextTotal = useClientSideStarredFilter ? sorted.length : Math.max(serverTotal, sorted.length);
      const nextTotalPages = useClientSideStarredFilter
        ? 1
        : Math.max(1, Math.ceil(nextTotal / PAGE_SIZE));

      setRuns(sorted);
      setTotalRuns(nextTotal);
      setTotalPages(nextTotalPages);
      setSelectedIds((prev) => {
        const visibleIds = new Set(sorted.map((run) => run.id));
        return new Set([...prev].filter((id) => visibleIds.has(id)));
      });
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : "Unable to load research history.";
      const localFallback = localHistoryHydrated
        ? sortHistoryRuns(
            mergeServerRunsWithLocalHistory([], localHistory, {
              query: searchQuery,
              status: statusFilter === "all" ? undefined : statusFilter,
            }),
            sortBy,
          )
        : [];

      if (localFallback.length > 0) {
        setError(null);
        setRuns(localFallback);
        setTotalRuns(localFallback.length);
        setTotalPages(1);
        showToast(`Showing ${localFallback.length} locally remembered report link(s). Server history failed: ${message}`, "warning");
      } else {
        setError(message);
        setRuns([]);
        setTotalRuns(0);
        setTotalPages(1);
      }
    } finally {
      setLoading(false);
    }
  }, [localHistory, localHistoryHydrated, page, searchQuery, showToast, sortBy, starredIds, starredOnly, statusFilter]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadRuns();
    }, 180);

    return () => window.clearTimeout(timer);
  }, [loadRuns]);

  const summary = useMemo(() => summarizeHistoryRuns(runs, totalRuns), [runs, totalRuns]);
  const selectedRuns = useMemo(
    () => runs.filter((run) => selectedIds.has(run.id)),
    [runs, selectedIds],
  );
  const allVisibleSelected = runs.length > 0 && runs.every((run) => selectedIds.has(run.id));
  const someVisibleSelected = runs.some((run) => selectedIds.has(run.id));
  const selectedCount = selectedIds.size;
  const isFiltered = Boolean(searchQuery.trim()) || statusFilter !== "all" || starredOnly;

  const clearFilters = () => {
    setSearchQuery("");
    setStatusFilter("all");
    setStarredOnly(false);
    setSortBy("newest");
    setPage(1);
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
    setSelectMode(false);
    setShowFolderMenu(false);
    setShowTagMenu(false);
  };

  const toggleSelectAll = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        runs.forEach((run) => next.delete(run.id));
      } else {
        runs.forEach((run) => next.add(run.id));
      }
      return next;
    });
  };

  const toggleSelectOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const performBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    setBulkActionLoading(true);

    try {
      const ids = [...selectedIds].join(",");
      const response = await fetchWithCsrf(`/api/research/runs?ids=${encodeURIComponent(ids)}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error(`Delete failed with HTTP ${response.status}`);
      }

      showToast(`Deleted ${selectedIds.size} research run(s).`, "success");
      clearSelection();
      await loadRuns();
    } catch (deleteError) {
      const message = deleteError instanceof Error ? deleteError.message : "Delete failed.";
      showToast(message, "error");
    } finally {
      setBulkActionLoading(false);
    }
  };

  const handleBulkDelete = () => {
    if (selectedIds.size === 0) return;

    askConfirm(
      "Delete selected research?",
      `This will permanently delete ${selectedIds.size} selected run(s) from history.`,
      () => performBulkDelete(),
      { confirmLabel: "Delete", tone: "danger" },
    );
  };

  const handleBulkExport = async () => {
    if (selectedRuns.length === 0) return;
    setBulkActionLoading(true);

    try {
      const sections: string[] = [
        "# Bulk Research Export",
        "",
        `**Generated at:** ${new Date().toISOString()}  `,
        `**Runs included:** ${selectedRuns.length}`,
        "",
        "---",
        "",
      ];

      let succeeded = 0;
      let failed = 0;

      for (const summaryRun of selectedRuns) {
        try {
          const response = await fetch(`/api/research/runs/${summaryRun.id}`, {
            cache: "no-store",
          });

          if (!response.ok) {
            failed += 1;
            sections.push(
              `## Failed: ${summaryRun.query || summaryRun.id}`,
              "",
              `Unable to fetch the full report. HTTP ${response.status}.`,
              "",
              "---",
              "",
            );
            continue;
          }

          const full = (await response.json()) as FullResearchRun;
          const outputs: Record<AgentId, AgentOutput | null> = {
            "market-sizer": null,
            "competitor-analyst": null,
            "pain-detective": null,
            "pricing-scout": null,
            "channel-scout": null,
            synthesis: null,
          };

          if (typeof full.result === "string" && full.result.trim()) {
            const parsed = parseSynthesis(full.result);
            if (parsed) {
              outputs.synthesis = parsed as unknown as AgentOutput;
            }
          }

          sections.push(
            generateMarkdownReport({
              sessionId: full.id,
              query: full.query,
              keywords: full.keywords || [],
              outputs,
              includeTableOfContents: false,
            }),
            "",
            "---",
            "",
          );
          succeeded += 1;
        } catch (exportError) {
          failed += 1;
          sections.push(
            `## Failed: ${summaryRun.query || summaryRun.id}`,
            "",
            `Fetch failed: ${exportError instanceof Error ? exportError.message : String(exportError)}`,
            "",
            "---",
            "",
          );
        }
      }

      downloadTextFile(`research-bulk-${Date.now()}.md`, sections.join("\n"), "text/markdown");

      if (failed > 0) {
        showToast(`Exported ${succeeded} run(s); ${failed} failed.`, "warning");
      } else {
        showToast(`Exported ${succeeded} run(s).`, "success");
      }
    } finally {
      setBulkActionLoading(false);
    }
  };

  const handleBulkMoveToFolder = (folderId: string) => {
    if (selectedIds.size === 0) return;
    const added = bulkAddRunsToFolder(folderId, [...selectedIds]);
    showToast(`Added ${added} run(s) to folder.`, "success");
    clearSelection();
    refreshClientMetadata();
  };

  const handleBulkAddTag = (tagId: string) => {
    if (selectedIds.size === 0) return;

    try {
      bulkAddTags([...selectedIds], [tagId]);
      showToast(`Tagged ${selectedIds.size} run(s).`, "success");
      clearSelection();
      refreshClientMetadata();
    } catch {
      showToast("Failed to add tag.", "error");
    }
  };

  return (
    <div className="min-h-screen bg-[#f7f5ef] bg-[radial-gradient(circle_at_top_left,rgba(15,23,42,0.06),transparent_32rem),linear-gradient(180deg,rgba(255,255,255,0.74),rgba(247,245,239,0))] text-slate-950">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-6 sm:px-6 lg:px-8">
        <header className="overflow-hidden rounded-[1.5rem] border border-stone-200/90 bg-[#fbfaf6]/95 shadow-[0_24px_80px_-60px_rgba(15,23,42,0.45)] backdrop-blur">
          <div className="grid gap-6 border-b border-stone-200/80 p-6 lg:grid-cols-[1fr_auto] lg:items-center lg:p-8">
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <span className="rounded-full border border-stone-300 bg-white/70 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-stone-600">
                  Research Studio
                </span>
                <span className="rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-[11px] font-semibold text-teal-800">
                  Evidence archive
                </span>
              </div>
              <div>
                <h1 className="max-w-3xl text-3xl font-semibold tracking-[-0.04em] text-slate-950 sm:text-5xl">
                  Research runs, reports, and proof trails.
                </h1>
                <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">
                  Recover completed reports, audit sources, and hand off research evidence without
                  depending on the transient worker that generated the run.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3 lg:justify-end">
              <button
                type="button"
                onClick={() => void loadRuns()}
                disabled={loading}
                className="inline-flex items-center justify-center rounded-full border border-stone-300 bg-white/80 px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-teal-300 hover:text-teal-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Refresh
              </button>
              <Link
                href="/"
                className="inline-flex items-center justify-center rounded-full border border-stone-300 bg-white/80 px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-teal-300 hover:text-teal-800"
              >
                Back to studio
              </Link>
              <Link
                href="/"
                className="inline-flex items-center justify-center rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white shadow-[0_16px_40px_-24px_rgba(15,23,42,0.9)] transition hover:bg-teal-800"
              >
                New research
              </Link>
            </div>
          </div>
        </header>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5" aria-label="History summary">
          <SummaryCard label="Total saved" value={summary.total} hint={`${summary.visible} visible now`} />
          <SummaryCard label="Completed" value={summary.completed} hint={`${summary.completionRate}% success rate`} />
          <SummaryCard label="With sources" value={summary.withSources} hint="Citation-ready reports" />
          <SummaryCard label="Failed" value={summary.failed} hint="Needs retry or review" tone="rose" />
          <SummaryCard label="Cancelled" value={summary.cancelled + summary.running} hint="Stopped or still running" tone="amber" />
        </section>

        <section className="rounded-[1.5rem] border border-stone-200 bg-[#fbfaf6]/95 p-4 shadow-[0_18px_70px_-58px_rgba(15,23,42,0.38)]">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-end">
            <label className="block">
              <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-stone-500">
                Search
              </span>
              <div className="mt-2 flex overflow-hidden rounded-2xl border border-stone-200 bg-white/80 focus-within:border-teal-300 focus-within:bg-white focus-within:ring-4 focus-within:ring-teal-100">
                <span className="flex items-center pl-4 text-sm font-semibold text-stone-400" aria-hidden="true">
                  /
                </span>
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(event) => {
                    setSearchQuery(event.target.value);
                    setPage(1);
                  }}
                  placeholder="Search queries or keywords..."
                  className="min-h-12 flex-1 border-0 bg-transparent px-3 text-sm text-slate-900 outline-none placeholder:text-stone-400"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery("");
                      setPage(1);
                    }}
                    className="px-4 text-sm font-semibold text-stone-500 transition hover:text-slate-900"
                  >
                    Clear
                  </button>
                )}
              </div>
            </label>

            <div className="flex flex-wrap items-end gap-3">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-stone-500">
                  Status
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {STATUS_FILTERS.map((filter) => (
                    <button
                      key={filter.value}
                      type="button"
                      onClick={() => {
                        setStatusFilter(filter.value);
                        setPage(1);
                      }}
                      aria-pressed={statusFilter === filter.value}
                      className={`rounded-full px-3 py-2 text-sm font-semibold ring-1 transition ${
                        statusFilter === filter.value
                          ? "bg-slate-950 text-white ring-slate-950 shadow-md shadow-slate-200"
                          : "bg-white/80 text-slate-600 ring-stone-200 hover:text-teal-800 hover:ring-teal-200"
                      }`}
                    >
                      {filter.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-stone-500">
                  Focus
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setStarredOnly((value) => !value);
                    setPage(1);
                  }}
                  aria-pressed={starredOnly}
                  className={`mt-2 rounded-full px-3 py-2 text-sm font-semibold ring-1 transition ${
                    starredOnly
                      ? "bg-amber-300 text-amber-950 ring-amber-300 shadow-md shadow-amber-100"
                      : "bg-white/80 text-slate-600 ring-stone-200 hover:text-amber-800 hover:ring-amber-200"
                  }`}
                >
                  Starred only
                </button>
              </div>

              <label className="block">
                <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-stone-500">
                  Sort
                </span>
                <select
                  value={sortBy}
                  onChange={(event) => {
                    setSortBy(event.target.value as HistorySortBy);
                    setPage(1);
                  }}
                  className="mt-2 min-h-10 rounded-full border border-stone-300 bg-white/80 px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm outline-none transition focus:border-teal-300 focus:ring-4 focus:ring-teal-100"
                >
                  {SORT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-stone-200 pt-4">
            <p className="text-sm text-slate-600">
              {loading
                ? "Loading saved research..."
                : `${runs.length} visible result${runs.length === 1 ? "" : "s"}${
                    totalRuns ? ` from ${totalRuns} saved` : ""
                  }`}
              {isFiltered && !loading ? " after filters" : ""}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {isFiltered && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="rounded-full border border-stone-300 bg-white/80 px-3 py-2 text-sm font-semibold text-slate-600 transition hover:border-teal-300 hover:text-teal-800"
                >
                  Clear filters
                </button>
              )}
              {!selectMode && runs.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectMode(true)}
                  className="rounded-full border border-stone-300 bg-white/80 px-3 py-2 text-sm font-semibold text-slate-600 transition hover:border-teal-300 hover:text-teal-800"
                >
                  Select reports
                </button>
              )}
              {selectMode && (
                <button
                  type="button"
                  onClick={clearSelection}
                  className="rounded-full border border-stone-300 bg-white/80 px-3 py-2 text-sm font-semibold text-slate-600 transition hover:border-teal-300 hover:text-teal-800"
                >
                  Exit selection
                </button>
              )}
            </div>
          </div>
        </section>

        {selectMode && (
          <section className="rounded-[1.5rem] border border-teal-100 bg-teal-50/70 p-4 shadow-sm">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <label className="flex items-center gap-3 text-sm font-semibold text-teal-950">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  ref={(input) => {
                    if (input) input.indeterminate = someVisibleSelected && !allVisibleSelected;
                  }}
                  onChange={toggleSelectAll}
                  className="h-4 w-4 rounded border-teal-300 text-teal-700 focus:ring-teal-500"
                />
                {selectedCount > 0
                  ? `${selectedCount} selected on this page`
                  : "Select reports on this page"}
              </label>

              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      setShowFolderMenu((value) => !value);
                      setShowTagMenu(false);
                    }}
                    disabled={selectedCount === 0 || bulkActionLoading}
                    className="rounded-full border border-teal-200 bg-white px-3 py-2 text-sm font-semibold text-teal-800 shadow-sm transition hover:border-teal-300 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Move to folder
                  </button>
                  {showFolderMenu && (
                    <DropdownPanel align="left">
                      {folders.length === 0 ? (
                        <p className="px-3 py-2 text-sm text-slate-500">No custom folders yet.</p>
                      ) : (
                        folders.map((folder) => (
                          <button
                            key={folder.id}
                            type="button"
                            onClick={() => handleBulkMoveToFolder(folder.id)}
                            className="block w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-slate-700 transition hover:bg-teal-50 hover:text-teal-800"
                          >
                            {folder.name}
                          </button>
                        ))
                      )}
                    </DropdownPanel>
                  )}
                </div>

                <div className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      setShowTagMenu((value) => !value);
                      setShowFolderMenu(false);
                    }}
                    disabled={selectedCount === 0 || bulkActionLoading}
                    className="rounded-full border border-teal-200 bg-white px-3 py-2 text-sm font-semibold text-teal-800 shadow-sm transition hover:border-teal-300 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Add tag
                  </button>
                  {showTagMenu && (
                    <DropdownPanel align="right">
                      {allTags.length === 0 ? (
                        <p className="px-3 py-2 text-sm text-slate-500">No tags yet.</p>
                      ) : (
                        allTags.map((tag) => (
                          <button
                            key={tag.id}
                            type="button"
                            onClick={() => handleBulkAddTag(tag.id)}
                            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-slate-700 transition hover:bg-teal-50 hover:text-teal-800"
                          >
                            <span
                              className="h-2.5 w-2.5 rounded-full"
                              style={{ backgroundColor: tag.color || "#6366f1" }}
                              aria-hidden="true"
                            />
                            {tag.name}
                          </button>
                        ))
                      )}
                    </DropdownPanel>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => void handleBulkExport()}
                  disabled={selectedCount === 0 || bulkActionLoading}
                  className="rounded-full border border-teal-200 bg-white px-3 py-2 text-sm font-semibold text-teal-800 shadow-sm transition hover:border-teal-300 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Export Markdown
                </button>
                <button
                  type="button"
                  onClick={handleBulkDelete}
                  disabled={selectedCount === 0 || bulkActionLoading}
                  className="rounded-xl bg-rose-600 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Delete
                </button>
              </div>
            </div>
          </section>
        )}

        <main className="rounded-[1.5rem] border border-stone-200 bg-[#fbfaf6]/95 p-4 shadow-[0_22px_80px_-62px_rgba(15,23,42,0.45)] sm:p-5">
          {loading ? (
            <HistorySkeletonList />
          ) : error ? (
            <ErrorState message={error} onRetry={() => void loadRuns()} />
          ) : runs.length === 0 ? (
            <EmptyState isFiltered={isFiltered} onClearFilters={clearFilters} />
          ) : (
            <>
              <div className="grid gap-3">
                {runs.map((run) => (
                  <HistoryRunCard
                    key={run.id}
                    run={run}
                    selected={selectedIds.has(run.id)}
                    selectMode={selectMode}
                    starred={starredIds.has(run.id)}
                    tags={getTagDetails(getRunTags(run.id))}
                    onToggleSelect={() => toggleSelectOne(run.id)}
                  />
                ))}
              </div>

              {totalPages > 1 && (
                <nav className="mt-5 flex flex-col gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm text-slate-500">
                    Page {page} of {totalPages} - {totalRuns} saved result{totalRuns === 1 ? "" : "s"}
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setPage((value) => Math.max(1, value - 1))}
                      disabled={page <= 1 || loading}
                      className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-indigo-200 hover:text-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Previous
                    </button>
                    <button
                      type="button"
                      onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
                      disabled={page >= totalPages || loading}
                      className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-indigo-200 hover:text-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Next
                    </button>
                  </div>
                </nav>
              )}
            </>
          )}
        </main>
      </div>
      {confirmDialog}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  hint,
  tone = "indigo",
}: {
  label: string;
  value: number;
  hint: string;
  tone?: "indigo" | "rose" | "amber";
}) {
  const toneClassName =
    tone === "rose"
      ? "border-rose-100 text-rose-700 before:bg-rose-500"
      : tone === "amber"
        ? "border-amber-100 text-amber-800 before:bg-amber-400"
        : "border-stone-200 text-teal-800 before:bg-teal-600";

  return (
    <div
      className={`relative overflow-hidden rounded-[1.35rem] border bg-[#fbfaf6] p-4 shadow-[0_16px_50px_-42px_rgba(15,23,42,0.55)] before:absolute before:inset-x-4 before:top-0 before:h-px ${toneClassName}`}
    >
      <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-stone-500">
        {label}
      </div>
      <div className="mt-3 font-mono text-3xl font-semibold tabular-nums text-slate-950">{value}</div>
      <div className="mt-1 text-sm font-medium text-stone-600">{hint}</div>
    </div>
  );
}

function HistoryRunCard({
  run,
  selected,
  selectMode,
  starred,
  tags,
  onToggleSelect,
}: {
  run: HistoryRun;
  selected: boolean;
  selectMode: boolean;
  starred: boolean;
  tags: RunTag[];
  onToggleSelect: () => void;
}) {
  const status = HISTORY_STATUS_META[run.status];
  const cardClassName = `group rounded-[1.25rem] border p-4 transition ${
    selected
      ? "border-teal-300 bg-teal-50 shadow-md shadow-teal-100"
      : "border-stone-200 bg-white/82 hover:border-teal-200 hover:bg-white hover:shadow-[0_18px_55px_-44px_rgba(15,23,42,0.55)]"
  }`;

  return (
    <article
      className={cardClassName}
      onClick={selectMode ? onToggleSelect : undefined}
      role={selectMode ? "button" : undefined}
      tabIndex={selectMode ? 0 : undefined}
      onKeyDown={
        selectMode
          ? (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onToggleSelect();
              }
            }
          : undefined
      }
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
        {selectMode && (
          <input
            type="checkbox"
            checked={selected}
            onClick={(event) => event.stopPropagation()}
            onChange={onToggleSelect}
            aria-label={`Select ${run.query}`}
            className="h-4 w-4 rounded border-stone-300 text-teal-700 focus:ring-teal-500 lg:mt-1"
          />
        )}

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ${status.badgeClassName}`}
            >
              <span className={`h-2 w-2 rounded-full ${status.dotClassName}`} aria-hidden="true" />
              {status.label}
            </span>
            {starred && (
              <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700 ring-1 ring-amber-200">
                Starred
              </span>
            )}
            {run.hasSources && (
              <span className="rounded-full bg-teal-50 px-2.5 py-1 text-[11px] font-semibold text-teal-800 ring-1 ring-teal-100">
                Sources
              </span>
            )}
            {run.recoverySource === "local" && (
              <span className="rounded-full bg-sky-50 px-2.5 py-1 text-[11px] font-semibold text-sky-800 ring-1 ring-sky-100">
                Local recovery
              </span>
            )}
            <span className="font-mono text-[11px] font-medium text-stone-400">ID {shortId(run.id)}</span>
          </div>

          <h2 className="mt-3 line-clamp-2 text-lg font-semibold leading-snug tracking-[-0.02em] text-slate-950">
            {run.query || "Untitled research"}
          </h2>

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 font-mono text-[12px] text-stone-500">
            <span>{formatDateTime(run.createdAt)}</span>
            <span>{formatDuration(run.durationMs)}</span>
            <span>
              {run.provider || "provider unknown"} / {run.model || "model unknown"}
            </span>
          </div>

          {(run.keywords?.length || tags.length) && (
            <div className="mt-3 flex flex-wrap gap-2">
              {run.keywords?.slice(0, 6).map((keyword) => (
                <span
                  key={keyword}
                  className="rounded-full bg-stone-100 px-2.5 py-1 text-xs font-medium text-stone-600"
                >
                  {keyword}
                </span>
              ))}
              {tags.slice(0, 4).map((tag) => (
                <span
                  key={tag.id}
                  className="rounded-full border px-2.5 py-1 text-xs font-semibold"
                  style={tagChipStyle(tag)}
                >
                  {tag.name}
                </span>
              ))}
              {tags.length > 4 && (
                <span className="rounded-full bg-stone-100 px-2.5 py-1 text-xs font-medium text-stone-500">
                  +{tags.length - 4} tags
                </span>
              )}
            </div>
          )}
        </div>

        {!selectMode && (
          <Link
            href={`/research/${run.id}`}
            className="inline-flex shrink-0 items-center justify-center rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-800"
          >
            Open report
          </Link>
        )}
      </div>
    </article>
  );
}

function HistorySkeletonList() {
  return (
    <div className="grid gap-3" aria-label="Loading history">
      {Array.from({ length: 5 }).map((_, index) => (
        <div key={index} className="rounded-[1.25rem] border border-stone-200 bg-white/85 p-4">
          <div className="flex animate-pulse flex-col gap-4 lg:flex-row lg:items-center">
            <div className="min-w-0 flex-1">
              <div className="h-5 w-32 rounded-full bg-stone-100" />
              <div className="mt-4 h-6 w-3/4 rounded-lg bg-stone-100" />
              <div className="mt-3 flex gap-3">
                <div className="h-4 w-24 rounded bg-stone-100" />
                <div className="h-4 w-20 rounded bg-stone-100" />
                <div className="h-4 w-32 rounded bg-stone-100" />
              </div>
            </div>
            <div className="h-10 w-28 rounded-full bg-stone-100" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState({
  isFiltered,
  onClearFilters,
}: {
  isFiltered: boolean;
  onClearFilters: () => void;
}) {
  return (
    <div className="flex min-h-[360px] items-center justify-center rounded-[1.5rem] border border-dashed border-stone-300 bg-white/58 p-8 text-center">
      <div className="max-w-md">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#fbfaf6] font-mono text-sm font-semibold text-teal-800 shadow-sm ring-1 ring-stone-200">
          RS
        </div>
        <h2 className="mt-5 text-2xl font-semibold tracking-[-0.03em] text-slate-950">
          {isFiltered ? "No matching reports" : "No saved research yet"}
        </h2>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          {isFiltered
            ? "Try clearing filters or searching with a broader phrase."
            : "Run a research task and the completed report will appear here for recovery, export, and follow-up review."}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          {isFiltered && (
            <button
              type="button"
              onClick={onClearFilters}
              className="rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-teal-300 hover:text-teal-800"
            >
              Clear filters
            </button>
          )}
          <Link
            href="/"
            className="rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white shadow-[0_16px_40px_-24px_rgba(15,23,42,0.9)] transition hover:bg-teal-800"
          >
            Start research
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="rounded-[1.5rem] border border-rose-200 bg-rose-50 p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-rose-950">History could not load</h2>
          <p className="mt-2 text-sm text-rose-700">{message}</p>
        </div>
        <button
          type="button"
          onClick={onRetry}
          className="rounded-full bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-700"
        >
          Try again
        </button>
      </div>
    </div>
  );
}

function DropdownPanel({
  children,
  align,
}: {
  children: React.ReactNode;
  align: "left" | "right";
}) {
  return (
    <div
      className={`absolute z-20 mt-2 w-64 rounded-2xl border border-stone-200 bg-white p-2 shadow-xl shadow-stone-200 ${
        align === "right" ? "right-0" : "left-0"
      }`}
    >
      {children}
    </div>
  );
}

function formatDateTime(timestamp: number): string {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return "Date not recorded";
  return `${new Date(timestamp).toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

function shortId(id: string): string {
  if (id.length <= 14) return id;
  return `${id.slice(0, 8)}...${id.slice(-4)}`;
}

function tagChipStyle(tag: RunTag): CSSProperties {
  const color = tag.color || "#6366f1";
  const isHex = /^#[0-9a-f]{6}$/i.test(color);
  return {
    color,
    borderColor: isHex ? `${color}55` : color,
    backgroundColor: isHex ? `${color}12` : "#f8fafc",
  };
}

function downloadTextFile(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
