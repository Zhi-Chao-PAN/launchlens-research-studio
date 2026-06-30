export type HistoryStatus = "completed" | "failed" | "cancelled" | "running";

export type HistorySortBy = "newest" | "oldest" | "fastest" | "slowest";

export interface HistoryRunForView {
  id: string;
  query: string;
  status: HistoryStatus;
  createdAt: number;
  durationMs: number;
  provider: string;
  model: string;
  keywords?: string[];
  hasSources?: boolean;
  recoverySource?: "server" | "local";
}

export const HISTORY_STATUS_META: Record<
  HistoryStatus,
  {
    label: string;
    shortLabel: string;
    dotClassName: string;
    badgeClassName: string;
  }
> = {
  completed: {
    label: "Completed",
    shortLabel: "OK",
    dotClassName: "bg-emerald-500",
    badgeClassName: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  },
  failed: {
    label: "Failed",
    shortLabel: "Fail",
    dotClassName: "bg-rose-500",
    badgeClassName: "bg-rose-50 text-rose-700 ring-rose-200",
  },
  cancelled: {
    label: "Cancelled",
    shortLabel: "Stop",
    dotClassName: "bg-amber-500",
    badgeClassName: "bg-amber-50 text-amber-700 ring-amber-200",
  },
  running: {
    label: "Running",
    shortLabel: "Run",
    dotClassName: "bg-indigo-500",
    badgeClassName: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  },
};

export function formatDuration(durationMs: number | null | undefined): string {
  if (!Number.isFinite(durationMs) || !durationMs || durationMs <= 0) {
    return "Not recorded";
  }

  if (durationMs < 1000) {
    return `${Math.round(durationMs)} ms`;
  }

  if (durationMs < 60_000) {
    const seconds = durationMs / 1000;
    return `${seconds < 10 ? seconds.toFixed(1) : Math.round(seconds)} sec`;
  }

  const minutes = Math.floor(durationMs / 60_000);
  const seconds = Math.round((durationMs % 60_000) / 1000);
  return seconds > 0 ? `${minutes} min ${seconds} sec` : `${minutes} min`;
}

export function sortHistoryRuns<T extends Pick<HistoryRunForView, "createdAt" | "durationMs">>(
  runs: T[],
  sortBy: HistorySortBy,
): T[] {
  return [...runs].sort((a, b) => {
    switch (sortBy) {
      case "oldest":
        return a.createdAt - b.createdAt;
      case "fastest":
        return a.durationMs - b.durationMs;
      case "slowest":
        return b.durationMs - a.durationMs;
      case "newest":
      default:
        return b.createdAt - a.createdAt;
    }
  });
}

export interface LocalHistoryEntryForMerge {
  id: string;
  query: string;
  keywords?: string[];
  createdAt: string;
  status?: HistoryStatus | "failed" | "completed" | "cancelled";
}

export interface MergeLocalHistoryOptions {
  query?: string;
  status?: Exclude<HistoryStatus, "running">;
}

function localStatus(entry: LocalHistoryEntryForMerge): HistoryStatus {
  if (
    entry.status === "completed" ||
    entry.status === "failed" ||
    entry.status === "cancelled" ||
    entry.status === "running"
  ) {
    return entry.status;
  }
  return "completed";
}

function localCreatedAt(entry: LocalHistoryEntryForMerge): number {
  const timestamp = new Date(entry.createdAt).getTime();
  return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : Date.now();
}

function matchesLocalFilters(entry: LocalHistoryEntryForMerge, options: MergeLocalHistoryOptions): boolean {
  const status = localStatus(entry);
  if (status === "running") return false;
  if (options.status && status !== options.status) return false;

  const query = options.query?.trim().toLowerCase();
  if (!query) return true;
  return (
    entry.query.toLowerCase().includes(query) ||
    (entry.keywords ?? []).some((keyword) => keyword.toLowerCase().includes(query))
  );
}

export function historyRunFromLocalEntry(entry: LocalHistoryEntryForMerge): HistoryRunForView {
  return {
    id: entry.id,
    query: entry.query,
    keywords: entry.keywords ?? [],
    status: localStatus(entry),
    createdAt: localCreatedAt(entry),
    durationMs: 0,
    provider: "browser",
    model: "local recovery",
    hasSources: false,
    recoverySource: "local",
  };
}

export function mergeServerRunsWithLocalHistory<T extends HistoryRunForView>(
  serverRuns: T[],
  localEntries: LocalHistoryEntryForMerge[],
  options: MergeLocalHistoryOptions = {},
): HistoryRunForView[] {
  const byId = new Map<string, HistoryRunForView>();
  for (const run of serverRuns) {
    byId.set(run.id, { ...run, recoverySource: run.recoverySource ?? "server" });
  }

  for (const entry of localEntries) {
    const id = entry.id.trim();
    if (!id || byId.has(id) || !matchesLocalFilters(entry, options)) continue;
    byId.set(id, historyRunFromLocalEntry({ ...entry, id }));
  }

  return [...byId.values()];
}

export interface HistorySummary {
  total: number;
  visible: number;
  completed: number;
  failed: number;
  cancelled: number;
  running: number;
  withSources: number;
  completionRate: number;
}

export function summarizeHistoryRuns(
  runs: HistoryRunForView[],
  totalFromServer = runs.length,
): HistorySummary {
  const completed = runs.filter((run) => run.status === "completed").length;
  const failed = runs.filter((run) => run.status === "failed").length;
  const cancelled = runs.filter((run) => run.status === "cancelled").length;
  const running = runs.filter((run) => run.status === "running").length;
  const withSources = runs.filter((run) => run.hasSources).length;
  const terminal = completed + failed + cancelled;

  return {
    total: totalFromServer,
    visible: runs.length,
    completed,
    failed,
    cancelled,
    running,
    withSources,
    completionRate: terminal > 0 ? Math.round((completed / terminal) * 100) : 0,
  };
}
