"use client";
import { fetchWithCsrf } from "@/lib/api/csrf-client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { getFolder, getFolders, bulkAddRunsToFolder } from "@/lib/research/folders";
import { getStarredRunIds } from "@/lib/research/starred";
import { HistoryItemSkeleton } from "@/components/skeleton/Skeleton";
import { getRunTags, getTagDetails, bulkAddTags, type RunTag } from "@/lib/research/tags";
import { useToast } from "@/components/toast/ToastContext";
import { useConfirm } from "@/components/ui/useConfirm";
import { UndoManager } from "@/lib/utils/undo-manager";

interface HistoryRun {
  id: string;
  query: string;
  status: "completed" | "failed" | "cancelled" | "running";
  createdAt: number;
  durationMs: number;
  provider: string;
  model: string;
  keywords?: string[];
}

export default function HistoryPage() {
  const [runs, setRuns] = useState<HistoryRun[]>([]);
  const [totalRuns, setTotalRuns] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selectedFolder] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "completed" | "failed" | "cancelled"
  >("all");
  const [sortBy, setSortBy] = useState<"newest" | "oldest" | "fastest" | "slowest">("newest");
  const [starredOnly, setStarredOnly] = useState(false);
  const [allTags] = useState<RunTag[]>([]);
  const [starredIds, setStarredIds] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [totalPages, setTotalPages] = useState(1);

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectMode, setSelectMode] = useState(false);
  const [showMoveFolderMenu, setShowMoveFolderMenu] = useState(false);
  const [showBulkTagMenu, setShowBulkTagMenu] = useState(false);
  const [folders, setFolders] = useState<{ id: string; name: string }[]>([]);
  const [bulkActionLoading, setBulkActionLoading] = useState(false);
  const { showToast } = useToast();
  const { askConfirm, dialog: confirmDialog } = useConfirm();

  // Undo manager for soft deletes
  const undoManager = useMemo(() => {
    return new UndoManager<HistoryRun>({
      gracePeriod: 5000,
      onDelete: async (item) => {
        // Actually delete from API
        try {
          await fetchWithCsrf(`/api/research/${item.id}`, { method: "DELETE" });
        } catch (e) {
          console.error("Delete failed:", e);
          showToast("Failed to delete research", "error");
        }
      },
      onRestore: () => {
        showToast("Deletion undone", "info");
      },
    });
  }, [showToast]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      undoManager.destroy();
    };
  }, [undoManager]);

  const loadRuns = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("limit", pageSize.toString());
    params.set("offset", ((page - 1) * pageSize).toString());
      if (searchQuery.trim()) {
        params.set("q", searchQuery.trim());
      }
      if (statusFilter !== "all") {
        params.set("status", statusFilter);
      }

      const res = await fetch(`/api/research/runs?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        let allRuns = data.runs || [];
        setTotalRuns(data.total || allRuns.length);
      setTotalPages(Math.ceil((data.total || allRuns.length) / pageSize));

        if (selectedFolder) {
          const folder = getFolder(selectedFolder);
          if (folder) {
            allRuns = allRuns.filter((r: HistoryRun) =>
              folder.runIds.includes(r.id)
            );
          }
        }

        // Starred-only filter
        if (starredOnly) {
          allRuns = allRuns.filter((r: HistoryRun) => starredIds.has(r.id));
        }

        // Client-side sorting
        const sorted = [...allRuns].sort((a, b) => {
          switch (sortBy) {
            case "newest":
              return b.createdAt - a.createdAt;
            case "oldest":
              return a.createdAt - b.createdAt;
            case "fastest":
              return a.durationMs - b.durationMs;
            case "slowest":
              return b.durationMs - a.durationMs;
            default:
              return b.createdAt - a.createdAt;
          }
        });

        setRuns(sorted);

        // Clear selected IDs that no longer exist in the list
        const runIds = new Set(sorted.map((r: HistoryRun) => r.id));
        setSelectedIds((prev) => {
          const next = new Set(prev);
          next.forEach((id) => {
            if (!runIds.has(id)) next.delete(id);
          });
          return next;
        });
      }
    } catch (e) {
      console.error("Failed to load runs", e);
    } finally {
      setLoading(false);
    }
  }, [selectedFolder, searchQuery, statusFilter, sortBy, page, pageSize, starredIds, starredOnly]);

  // Load starred IDs on mount and refresh periodically
  useEffect(() => {
    const refreshStarred = () => {
      setStarredIds(new Set(getStarredRunIds()));
    };
    refreshStarred();
    // Refresh when window regains focus (in case user starred on another page)
    const handleFocus = () => refreshStarred();
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadRuns();
    }, 200); // debounce search
    return () => clearTimeout(timer);
  }, [loadRuns]);

  useEffect(() => {
    void Promise.resolve().then(() => {
      // Load folders for move-to-folder menu
      setFolders(
        getFolders()
          .filter((f) => !f.isSystem)
          .map((f) => ({ id: f.id, name: f.name }))
      );
    });
  }, [selectedFolder]);

  // Bulk selection helpers
  const allSelected = useMemo(() => {
    if (runs.length === 0) return false;
    return runs.every((r) => selectedIds.has(r.id));
  }, [runs, selectedIds]);

  const someSelected = useMemo(() => {
    return runs.some((r) => selectedIds.has(r.id));
  }, [runs, selectedIds]);

  const selectedCount = selectedIds.size;

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(runs.map((r) => r.id)));
    }
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

  const clearSelection = () => {
    setSelectedIds(new Set());
    setSelectMode(false);
    setShowMoveFolderMenu(false);
  };

  // Bulk actions
  const handleBulkDelete = () => {
    if (selectedIds.size === 0) return;
    askConfirm(`Delete ${selectedIds.size} selected run${selectedIds.size>1?'s':''}?`, 'This cannot be undone.', () => performBulkDelete());
  };
  const performBulkDelete = async () => {
    setBulkActionLoading(true);
    try {
      const ids = Array.from(selectedIds).join(",");
      const res = await fetchWithCsrf(`/api/research/runs?ids=${encodeURIComponent(ids)}`, {
        method: "DELETE",
      });
      if (res.ok) {
        clearSelection();
        void loadRuns();
      }
    } catch (e) {
      console.error("Bulk delete failed", e);
    } finally {
      setBulkActionLoading(false);
    }
  };

  const handleBulkExport = () => {
    if (selectedIds.size === 0) return;
    // Use the export endpoint with a filter ? but since we have IDs on client side,
    // we can fetch individual runs and build the export
    // For simplicity, let's just trigger a download from the export endpoint with query matching
    // Actually let's build the export client-side for selected runs
    const selectedRuns = runs.filter((r) => selectedIds.has(r.id));
    if (selectedRuns.length === 0) return;

    // We only have summary data here. For full export, user should go to individual pages.
    // Export summaries as JSON.
    const data = JSON.stringify(selectedRuns, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `selected-runs-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleBulkMoveToFolder = (folderId: string) => {
    if (selectedIds.size === 0) return;
    const added = bulkAddRunsToFolder(folderId, Array.from(selectedIds));
    setShowMoveFolderMenu(false);
    // Show a quick success indicator via browser notification or just close
    console.log(`Added ${added} run(s) to folder`);
    clearSelection();
  }

  // Bulk tag actions
  const handleBulkAddTags = (tagIds: string[]) => {
    if (selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    setBulkActionLoading(true);
    try {
      bulkAddTags(ids, tagIds);
      showToast(`Added ${tagIds.length} tag(s) to ${ids.length} research runs`, "success");
      setShowBulkTagMenu(false);
    } catch {
      showToast("Failed to add tags", "error");
    } finally {
      setBulkActionLoading(false);
    }
  };

  return (
    <div className="history-page">
      <div className="history-inner">
        <header className="history-header">
          <div>
            <h1 className="history-title">Research History</h1>
            <p className="history-subtitle">
              {selectedFolder
                ? "Research in this folder"
                : "All research records"}
              {totalRuns > 0 && (
                <>
                  {" "}
                  <span className="history-count">
                    {runs.length} of {totalRuns} results
                  </span>
                </>
              )}
            </p>
          </div>
          <div className="history-header-actions">
            {!selectMode ? (
              <>
                <Link href="/" className="btn btn-primary history-new-btn">
                  + New Research
                </Link>
                {runs.length > 0 && (
                  <button
                    className="btn btn-secondary"
                    onClick={() => setSelectMode(true)}
                  >
                    Select
                  </button>
                )}
              </>
            ) : (
              <button
                className="btn btn-secondary"
                onClick={clearSelection}
              >
                Cancel
              </button>
            )}
          </div>
        </header>

        {/* Search & filter toolbar */}
        <div className="history-toolbar">
          <div className="history-search">
            <span className="history-search-icon">🔍</span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search research queries, keywords..."
              className="history-search-input"
            />
            {searchQuery && (
              <button
                className="history-search-clear"
                onClick={() => setSearchQuery("")}
                aria-label="Clear search"
              >
                ×              </button>
            )}
          </div>

          <div className="history-filters">
            <div className="history-filter-group">
              <label className="history-filter-label">Status</label>
              <div className="history-filter-buttons">
                {(["all", "completed", "failed", "cancelled"] as const).map((s) => (
                  <button
                    key={s}
                    className={`history-filter-btn status-${s} ${statusFilter === s ? "active" : ""}`}
                    onClick={() => setStatusFilter(s)}
                  >
                    {s === "all"
                      ? "All"
                      : s === "completed"
                        ? "✓ Success"
                        : s === "failed"
                          ? "✕ Failed"
                          : "⊘ Cancelled"}
                  </button>
                ))}
              </div>
            </div>

            <div className="history-filter-group">
              <label className="history-filter-label">Filter</label>
              <button
                className={`history-filter-btn ${starredOnly ? "active starred" : ""}`}
                onClick={() => setStarredOnly(!starredOnly)}
              >
                ★ Starred
              </button>
            </div>

            <div className="history-filter-group">
              <label className="history-filter-label">Sort</label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                className="history-sort-select"
              >
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
                <option value="fastest">Fastest first</option>
                <option value="slowest">Slowest first</option>
              </select>
            </div>
          </div>
        </div>

        {/* Results count */}
        {(searchQuery || statusFilter !== "all") && (
          <div className="history-results-info">
            <span>
              Found <strong>{runs.length}</strong> result{runs.length !== 1 ? "s" : ""}
              {searchQuery && <> for &quot;<strong>{searchQuery}</strong>&quot;</>}
            </span>
            {searchQuery && (
              <button
                className="history-clear-all"
                onClick={() => {
                  setSearchQuery("");
                  setStatusFilter("all");
                  setSortBy("newest");
                }}
              >
                Clear filters
              </button>
            )}
          </div>
        )}

        {/* Bulk action bar */}
        {selectMode && selectedCount > 0 && (
          <div className="history-bulk-bar">
            <div className="history-bulk-left">
              <label className="history-bulk-select-all">
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={(el) => { if (el) el.indeterminate = someSelected && !allSelected; }}
                  onChange={toggleSelectAll}
                />
                <span>
                  {selectedCount} selected
                  {selectedCount === runs.length && runs.length < totalRuns && " (on this page)"}
                </span>
              </label>
            </div>
            <div className="history-bulk-actions">
              <div className="history-bulk-folder-menu">
                <button
                  className="btn btn-sm btn-secondary"
                  onClick={() => setShowMoveFolderMenu(!showMoveFolderMenu)}
                  disabled={bulkActionLoading}
                >
                  📁 Move to folder
                  {showMoveFolderMenu && (
                    <div className="history-folder-dropdown">
                      {folders.length === 0 ? (
                        <div className="history-folder-dropdown-empty">No folders yet</div>
                      ) : (
                        folders.map((f) => (
                          <button
                            key={f.id}
                            className="history-folder-dropdown-item"
                            onClick={() => handleBulkMoveToFolder(f.id)}
                          >
                            {f.name}
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </button>
              </div>
              <button
                className="btn btn-sm btn-secondary"
                onClick={() => handleBulkExport()}
                disabled={bulkActionLoading}
              >
                📤 Export
              </button>
              <div className="history-bulk-tag-menu">
  <button
    className="btn btn-sm btn-secondary"
    onClick={() => setShowBulkTagMenu(!showBulkTagMenu)}
    disabled={bulkActionLoading}
  >
    🏷 Add tags
    {showBulkTagMenu && (
      <div className="history-tag-dropdown">
        {allTags.length === 0 ? (
          <div className="history-tag-dropdown-empty">No tags yet</div>
        ) : (
          allTags.map((tag) => (
            <button
              key={tag.id}
              className="history-tag-dropdown-item"
              onClick={() => handleBulkAddTags([tag.id])}
            >
              <span className="history-tag-dot" style={{ background: tag.color || "#6366f1" }} />
              {tag.name}
            </button>
          ))
        )}
      </div>
    )}
  </button>
</div>
<button
                className="btn btn-sm btn-danger"
                onClick={handleBulkDelete}
                disabled={bulkActionLoading}
              >
                🗑 Delete
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="history-list">
            {Array.from({ length: 5 }).map((_, i) => (
              <HistoryItemSkeleton key={i} />
            ))}
          </div>
        ) : runs.length === 0 ? (
          <div className="history-empty">
            <div className="history-empty-icon">{searchQuery || statusFilter !== "all" || starredOnly ? "🔍" : "📋"}</div>
            <h3>{searchQuery || statusFilter !== "all" || starredOnly ? "No results found" : "No research yet"}</h3>
            <p className="history-empty-desc">
              {searchQuery || statusFilter !== "all" || starredOnly
                ? "Try adjusting your search terms or clearing the filters."
                : "Run your first research to start building insights — it only takes a minute."}
            </p>
            <div className="history-empty-actions">
              {(searchQuery || statusFilter !== "all" || starredOnly) ? (
                <>
                  <button
                    className="btn btn-secondary"
                    onClick={() => { setSearchQuery(""); setStatusFilter("all"); setStarredOnly(false); }}
                  >
                    Clear all filters
                  </button>
                  <Link href="/" className="btn btn-primary">
                    New Research
                  </Link>
                </>
              ) : (
                <Link href="/" className="btn btn-primary">
                  Start your first research
                </Link>
              )}
            </div>
          </div>
        ) : (<>
          <div className="history-list">
            {runs.map((run) => (
              <div
                key={run.id}
                className={`history-item ${selectMode ? "selectable" : ""} ${selectedIds.has(run.id) ? "selected" : ""}`}
                onClick={() => {
                  if (selectMode) {
                    toggleSelectOne(run.id);
                  }
                }}
              >
                {selectMode && (
                  <div className="history-item-checkbox">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(run.id)}
                      onChange={() => toggleSelectOne(run.id)}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </div>
                )}
                {!selectMode ? (
                  <Link
                    href={`/research/${run.id}`}
                    className="history-item-main-link"
                  >
                    <div className="history-item-main">
                      <div className={`history-item-status status-${run.status}`}>
                        {run.status === "completed"
                          ? "[ok]"
                          : run.status === "failed"
                            ? "[x]"
                            : run.status === "cancelled"
                              ? "[c]"
                              : "[...]"}
                      </div>
                      <div className="history-item-content">
                        <h3 className="history-item-query">
                      {starredIds.has(run.id) && (
                        <span className="history-item-star" title="Starred">★</span>
                      )}
                      {run.query}
                    </h3>
                        <div className="history-item-meta">
                          <span>{new Date(run.createdAt).toLocaleString()}</span>
                          <span>·</span>
                          <span>
                            {run.durationMs < 1000
                              ? run.durationMs + "ms"
                              : (run.durationMs / 1000).toFixed(1) + "s"}
                          </span>
                          <span>·</span>
                          <span>{run.provider} / {run.model}</span>
                        </div>
                        {(() => {
                          const runTagIds = getRunTags(run.id);
                          const runTags = getTagDetails(runTagIds);
                          if (runTags.length === 0) return null;
                          return (
                            <div className="history-item-tags">
                              {runTags.slice(0, 3).map((tag) => (
                                <span
                                  key={tag.id}
                                  className="history-item-tag"
                                  style={{
                                    background: tag.color + "20",
                                    color: tag.color,
                                    borderColor: tag.color + "40",
                                  }}
                                >
                                  {tag.name}
                                </span>
                              ))}
                              {runTags.length > 3 && (
                                <span className="history-item-tag-more">
                                  +{runTags.length - 3}
                                </span>
                              )}
                            </div>
                          );
                        })()}
                        {run.keywords && run.keywords.length > 0 && (
                          <div className="history-item-keywords">
                            {run.keywords.slice(0, 5).map((kw) => (
                              <span key={kw} className="history-kw-tag">{kw}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="history-item-arrow">→</div>
                  </Link>
                ) : (
                  <div className="history-item-main">
                    <div className={`history-item-status status-${run.status}`}>
                      {run.status === "completed"
                        ? "✓"
                        : run.status === "failed"
                          ? "✕"
                          : run.status === "cancelled"
                            ? "⊘"
                            : "○"}
                    </div>
                    <div className="history-item-content">
                      <h3 className="history-item-query">{run.query}</h3>
                      <div className="history-item-meta">
                        <span>{new Date(run.createdAt).toLocaleString()}</span>
                        <span>·</span>
                        <span>
                          {run.durationMs < 1000
                            ? run.durationMs + "ms"
                            : (run.durationMs / 1000).toFixed(1) + "s"}
                        </span>
                        <span>·</span>
                        <span>{run.provider} / {run.model}</span>
                      </div>
                      {run.keywords && run.keywords.length > 0 && (
                        <div className="history-item-keywords">
                          {run.keywords.slice(0, 5).map((kw) => (
                            <span key={kw} className="history-kw-tag">{kw}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="history-pagination">
              <button
                type="button"
                className="history-page-btn"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1 || loading}
              >
                {"<"} Prev
              </button>
              <span className="history-page-info">
                Page {page} of {totalPages}
                <span className="history-page-total">({totalRuns} total)</span>
              </span>
              <button
                type="button"
                className="history-page-btn"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages || loading}
              >
                Next {">"}
              </button>
            </div>
          )}
        </>)}
      </div>
      {confirmDialog}
    </div>
  );
}



