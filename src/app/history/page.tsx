"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { formatDistanceToNow } from "@/lib/utils/date-utils";
import { FolderSidebar } from "@/components/folders/FolderSidebar";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { getFolder } from "@/lib/research/folders";
import { DataManager } from "@/components/data/DataManager";

interface HistoryRun {
  id: string;
  query: string;
  keywords: string[];
  status: string;
  createdAt: number;
  durationMs: number;
  opportunityScore?: number;
  riskScore?: number;
}

export default function HistoryPage() {
  const [runs, setRuns] = useState<HistoryRun[]>([]);
  const [totalRuns, setTotalRuns] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [folderName, setFolderName] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "completed" | "failed">("all");
  const [sortBy, setSortBy] = useState<"newest" | "oldest" | "fastest" | "slowest">("newest");

  const loadRuns = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("limit", "100");
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

        if (selectedFolder) {
          const folder = getFolder(selectedFolder);
          if (folder) {
            allRuns = allRuns.filter((r: HistoryRun) =>
              folder.runIds.includes(r.id),
            );
          }
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
      }
    } catch (e) {
      console.error("Failed to load runs", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadRuns();
    }, 200); // debounce search
    return () => clearTimeout(timer);
  }, [selectedFolder, searchQuery, statusFilter, sortBy]);

  useEffect(() => {
    if (selectedFolder) {
      const folder = getFolder(selectedFolder);
      void Promise.resolve().then(() => { setFolderName(folder?.name || ""); })
    } else {
      void Promise.resolve().then(() => { setFolderName(""); })
    }
  }, [selectedFolder, runs.length]);

  return (
    <div className="history-page">
      <SiteHeader />
      <div className="history-layout">
        <FolderSidebar
          selectedFolderId={selectedFolder}
          onSelectFolder={setSelectedFolder}
        />

        <div className="history-content">
          <DataManager />
          <header className="history-header">
            <div>
              <h1 className="history-title">
                {selectedFolder ? folderName : "Research History"}
              </h1>
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
            <Link href="/" className="btn btn-primary">
              + New Research
            </Link>
          </header>

          {/* Search & filter toolbar */}
          <div className="history-toolbar">
            <div className="history-search">
              <span className="history-search-icon">üîç</span>
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
                  ‚ú?                </button>
              )}
            </div>

            <div className="history-filters">
              <div className="history-filter-group">
                <label className="history-filter-label">Status</label>
                <div className="history-filter-buttons">
                  {(["all", "completed", "failed"] as const).map((s) => (
                    <button
                      key={s}
                      className={`history-filter-btn status-${s} ${statusFilter === s ? "active" : ""}`}
                      onClick={() => setStatusFilter(s)}
                    >
                      {s === "all" ? "All" : s === "completed" ? "‚ú?Success" : "‚ú?Failed"}
                    </button>
                  ))}
                </div>
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

          {loading ? (
            <div className="history-loading">Loading...</div>
          ) : runs.length === 0 ? (
            <div className="history-empty">
              <div className="history-empty-icon">È¶ÉÊë•</div>
              <h3>No research yet</h3>
              <p>
                {selectedFolder
                  ? "This folder is empty"
                  : "Start your first research project"}
              </p>
              <Link href="/" className="btn btn-primary">
                Start Research
              </Link>
            </div>
          ) : (
            <div className="history-list">
              {runs.map((run) => (
                <Link
                  key={run.id}
                  href={"/research/" + run.id}
                  className={"history-item status-" + run.status}
                >
                  <div className="history-item-main">
                    <h3 className="history-item-query">{run.query}</h3>
                    {run.keywords.length > 0 && (
                      <div className="history-item-keywords">
                        {run.keywords.slice(0, 3).map((kw) => (
                          <span key={kw} className="history-kw-tag">
                            {kw}
                          </span>
                        ))}
                        {run.keywords.length > 3 && (
                          <span className="history-kw-more">
                            +{run.keywords.length - 3}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="history-item-meta">
                    <span className="history-status">{run.status}</span>
                    <span className="history-date">
                      {formatDistanceToNow(run.createdAt)}
                    </span>
                    {run.opportunityScore !== undefined && (
                      <span className="history-score">
                        Opportunity {run.opportunityScore}
                      </span>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
