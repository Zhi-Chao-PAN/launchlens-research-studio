"use client";

/* eslint-disable */



import { useState, useEffect } from "react";
import Link from "next/link";

interface RunSummary {
  id: string;
  query: string;
  keywords: string[];
  status: "completed" | "failed";
  provider: string;
  model: string;
  createdAt: number;
  durationMs: number;
  hasSources: boolean;
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleString();
}

function formatDuration(ms: number): string {
  if (ms < 1000) return ms + "ms";
  if (ms < 60000) return (ms / 1000).toFixed(1) + "s";
  return Math.floor(ms / 60000) + "m " + Math.floor((ms % 60000) / 1000) + "s";
}

export default function HistoryPage() {
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [storageInfo, setStorageInfo] = useState<{ enabled: boolean; inMemoryCount: number; maxMemoryRuns: number } | null>(null);

  async function loadRuns() {
    try {
      const res = await fetch("/api/research/runs?limit=20");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setRuns(data.runs || []);
      setStorageInfo(data.storage || null);
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadRuns();
    const interval = setInterval(loadRuns, 10000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    async function loadRuns() {
      try {
        const res = await fetch("/api/research/runs?limit=20");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setRuns(data.runs || []);
        setStorageInfo(data.storage || null);
        setError(null);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        setLoading(false);
      }
    }
    loadRuns();
    const interval = setInterval(loadRuns, 10000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="history-page">
      <header className="history-header">
        <div className="history-header-inner">
          <h1>Research History</h1>
          <div className="history-header-actions">
            <Link href="/" className="history-link">Studio</Link>
            <Link href="/admin" className="history-link">Admin</Link>
          </div>
        </div>
      </header>

      <main className="history-main">
        {storageInfo && !storageInfo.enabled && (
          <div className="history-notice">
            <strong>Note:</strong> Runs are stored in memory only and will be lost when the server restarts.
            Set <code>LAUNCHLENS_STORAGE_DIR</code> for persistent storage.
          </div>
        )}

        {error && <div className="history-error">{error}</div>}

        {loading && !runs.length && (
          <p className="history-empty">Loading...</p>
        )}

        {!loading && runs.length === 0 && (
          <p className="history-empty">No research runs yet. <Link href="/">Go run one!</Link></p>
        )}

        <div className="history-list">
          {runs.map((run) => (
            <Link
              key={run.id}
              href={`/research/${run.id}`}
              className="history-card"
            >
              <div className="history-card-header">
                <span className={`history-status history-status-${run.status}`}>
                  {run.status}
                </span>
                <span className="history-provider">{run.provider} / {run.model}</span>
              </div>
              <h3 className="history-query">{run.query}</h3>
              {run.keywords.length > 0 && (
                <div className="history-keywords">
                  {run.keywords.slice(0, 5).map((kw) => (
                    <span key={kw} className="history-keyword">{kw}</span>
                  ))}
                  {run.keywords.length > 5 && (
                    <span className="history-keyword-more">+{run.keywords.length - 5} more</span>
                  )}
                </div>
              )}
              <div className="history-meta">
                <span className="history-time">{formatTime(run.createdAt)}</span>
                <span className="history-duration">{formatDuration(run.durationMs)}</span>
              </div>
            </Link>
          ))}
        </div>

        {storageInfo && (
          <p className="history-footer-note">
            Showing {runs.length} of {storageInfo.inMemoryCount} recent runs
            (max {storageInfo.maxMemoryRuns}).
          </p>
        )}
      </main>
    </div>
  );
}
