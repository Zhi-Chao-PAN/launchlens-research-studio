"use client";

import { SiteHeader } from "@/components/layout/SiteHeader";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { ScheduleManager } from "@/components/scheduler/ScheduleManager";
import { fetchWithCsrfStrict, formatApiError } from "@/lib/api/csrf-client";
import { useLocale } from "@/lib/i18n/LocaleProvider";

interface BatchRun {
  id: string;
  query: string;
  status: "queued" | "running" | "completed" | "failed";
  startedAt?: number;
  completedAt?: number;
}

interface BatchInfo {
  id: string;
  total: number;
  completed: number;
  failed: number;
  status: "running" | "completed";
  runs: BatchRun[];
  createdAt: number;
  completedAt?: number;
  progress: number;
}

export default function BatchPage() {
  const { t, locale } = useLocale();
  const [queries, setQueries] = useState("");
  const [keywords, setKeywords] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [currentBatch, setCurrentBatch] = useState<BatchInfo | null>(null);
  const [recentBatches, setRecentBatches] = useState<BatchInfo[]>([]);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!queries.trim() || submitting) return;

    const queryList = queries
      .split("\n")
      .map((q) => q.trim())
      .filter(Boolean);

    if (queryList.length === 0) return;
    if (queryList.length > 10) {
      alert(t("batch.maxQueries", "A maximum of 10 research queries is supported."));
      return;
    }

    const keywordList = keywords
      .split(/[,，]/)
      .map((k) => k.trim())
      .filter(Boolean);

    setSubmitting(true);
    try {
      const res = await fetchWithCsrfStrict("/api/research/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          queries: queryList,
          keywords: keywordList,
        }),
        throwOnRateLimit: true,
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || ("HTTP " + res.status));
      }
      const data = await res.json();
      setCurrentBatch({
        id: data.batchId,
        total: data.total,
        completed: 0,
        failed: 0,
        status: data.status,
        runs: data.runs,
        createdAt: Date.now(),
        progress: 0,
      });
      setQueries("");
    } catch (err) {
      setSubmitError(formatApiError(err, { prefix: "Failed to create batch:" }));
    } finally {
      setSubmitting(false);
    }
  };

  const loadRecent = useCallback(async () => {
    try {
      const res = await fetch("/api/research/batch");
      if (res.ok) {
        const data = await res.json();
        setRecentBatches(data.batches || []);
      }
    } catch {
      // ignore
    }
  }, []);

  // Poll current batch status
  const batchId = currentBatch?.id;
  const batchStatus = currentBatch?.status;
  useEffect(() => {
    if (!batchId || batchStatus === "completed") return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/research/batch/${batchId}`);
        if (res.ok) {
          const data = await res.json();
          setCurrentBatch(data);
          if (data.status === "completed") {
            loadRecent();
          }
        }
      } catch {
        // ignore
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [batchId, batchStatus, loadRecent]);

  // Load recent on mount
  useEffect(() => {
    // Queue as microtask to avoid synchronous setState in effect
    void Promise.resolve().then(loadRecent);
  }, [loadRecent]);

  const statusLabel = (status: string) => {
    // R203: was hardcoded Chinese ("等待中"/"运行中"/"完成"/"失败") which
    // was neither English nor i18n-aware. Now pulled from the dictionary.
    switch (status) {
      case "queued": return t("batch.status.queued", "Queued");
      case "running": return t("batch.status.running", "Running");
      case "completed": return t("batch.status.completed", "Done");
      case "failed": return t("batch.status.failed", "Failed");
      default: return status;
    }
  };

  const statusClass = (status: string) => {
    switch (status) {
      case "queued": return "batch-status-queued";
      case "running": return "batch-status-running";
      case "completed": return "batch-status-completed";
      case "failed": return "batch-status-failed";
      default: return "";
    }
  };

  const formatTime = (ts?: number) => {
    if (!ts) return "—";
    return new Date(ts).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  };

  return (
    <div className="batch-page">
      <header className="batch-header">
        <div className="batch-header-inner">
          <Link href="/" className="research-back-link">{t("batch.backHome", "← Back to home")}</Link>
          <h1 className="batch-title">{t("batch.title", "Batch Research")}</h1>
          <p className="batch-subtitle">{t("batch.subtitle", "Submit multiple research queries at once; the system processes them in sequence.")}</p>
        </div>
      </header>

      <SiteHeader />
      <main className="batch-main">
        <form className="batch-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label>
              {t("batch.queriesLabel", "Research queries (one per line, max 10)")}
            </label>
            <textarea
              value={queries}
              onChange={(e) => setQueries(e.target.value)}
              placeholder={t("batch.queriesPlaceholder", "Analyze the generative AI market opportunity\nResearch AI Agent trends\nAssess AI in education")}
              className="batch-textarea"
              rows={6}
            />
            <div className="form-hint">
              {queries.split("\n").filter((q) => q.trim()).length} / 10 {t("batch.queryCount", "queries")}
            </div>
          </div>

          <div className="form-group">
            <label>{t("batch.keywordsLabel", "Shared keywords (comma-separated, optional)")}</label>
            <input
              type="text"
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              placeholder={t("batch.keywordsPlaceholder", "e.g. market size, competitive landscape")}
              className="form-input"
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary batch-submit"
            disabled={submitting || !queries.trim()}
          >
            {submitting ? t("batch.submitting", "Submitting...") : t("batch.submit", "🚀 Start batch research")}
          </button>
          {submitError && <div className="form-error" role="alert">{submitError}</div>}
        </form>

        {/* Current batch status */}
        {currentBatch && (
          <div className="batch-progress">
            <div className="batch-progress-header">
              <h3>{t("batch.progressTitle", "Batch progress")}</h3>
              <span className={`batch-status ${statusClass(currentBatch.status)}`}>
                {statusLabel(currentBatch.status)}
              </span>
            </div>

            <div className="batch-progress-bar">
              <div
                className="batch-progress-fill"
                style={{ width: `${currentBatch.progress}%` }}
              />
            </div>
            <div className="batch-progress-stats">
              {currentBatch.completed + currentBatch.failed} / {currentBatch.total} {t("batch.progressDone", "done")}
              · {currentBatch.completed} {t("batch.progressSuccess", "succeeded")}
              · {currentBatch.failed} {t("batch.progressFailed", "failed")}
            </div>

            <div className="batch-run-list">
              {currentBatch.runs.map((run, i) => (
                <div key={i} className="batch-run-item">
                  <span className={`batch-run-status ${statusClass(run.status)}`}>
                    {run.status === "completed" ? "✓" : run.status === "failed" ? "✗" : run.status === "running" ? "⟳" : "◦"}
                  </span>
                  <span className="batch-run-query">{run.query}</span>
                  {run.id ? (
                    <Link href={`/research/${run.id}`} className="batch-run-link">
                      {t("batch.viewRun", "View →")}
                    </Link>
                  ) : (
                    <span className="batch-run-time">{formatTime(run.startedAt)}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recent batches */}
        {recentBatches.length > 0 && (
          <div className="batch-history">
            <h3 className="batch-history-title">{t("batch.historyTitle", "Recent batches")}</h3>
            <div className="batch-history-list">
              {recentBatches.slice(0, 5).map((batch) => (
                <div key={batch.id} className="batch-history-item">
                  <div className="batch-history-info">
                    <div className="batch-history-id">{batch.id}</div>
                    <div className="batch-history-meta">
                      {batch.total} {t("batch.historyCount", "studies")} · {formatTime(batch.createdAt)}
                    </div>
                  </div>
                  <div className="batch-history-stats">
                    <span className="batch-success">{batch.completed}✓</span>
                    <span className="batch-fail">{batch.failed}✗</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      <ScheduleManager />
      </main>
    </div>
  );
}
