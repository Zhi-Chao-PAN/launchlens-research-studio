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
