"use client";

import { SiteHeader } from "@/components/layout/SiteHeader";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ScheduleManager } from "@/components/scheduler/ScheduleManager";
import { fetchWithCsrfStrict, RateLimitError } from "@/lib/api/csrf-client";

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
  const router = useRouter();
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
      alert("最多支持 10 个研究问题");
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
      let msg = err instanceof Error ? err.message : "Failed to create batch.";
      if (err instanceof RateLimitError) {
        msg = "Too many batch requests. Please wait " + Math.ceil(err.retryAfterMs / 1000) + "s before trying again.";
      }
      setSubmitError(msg);
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
  useEffect(() => {
    if (!currentBatch || currentBatch.status === "completed") return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/research/batch/${currentBatch.id}`);
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
  }, [currentBatch?.id, currentBatch?.status, loadRecent]);

  // Load recent on mount
  useEffect(() => {
    // Queue as microtask to avoid synchronous setState in effect
    void Promise.resolve().then(loadRecent);
  }, [loadRecent]);

  const statusLabel = (status: string) => {
    switch (status) {
      case "queued": return "等待中";
      case "running": return "运行中";
      case "completed": return "完成";
      case "failed": return "失败";
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
    return new Date(ts).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  };

  return (
    <div className="batch-page">
      <header className="batch-header">
        <div className="batch-header-inner">
          <Link href="/" className="research-back-link">← 返回首页</Link>
          <h1 className="batch-title">批量研究</h1>
          <p className="batch-subtitle">一次提交多个研究问题，系统依次处理</p>
        </div>
      </header>

      <SiteHeader />
      <main className="batch-main">
        <form className="batch-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label>
              研究问题（每行一个，最多 10 个）
            </label>
            <textarea
              value={queries}
              onChange={(e) => setQueries(e.target.value)}
              placeholder={"分析生成式 AI 的市场机会\n研究 AI Agent 的发展趋势\n评估 AI 在教育行业的应用"}
              className="batch-textarea"
              rows={6}
            />
            <div className="form-hint">
              {queries.split("\n").filter((q) => q.trim()).length} / 10 个问题
            </div>
          </div>

          <div className="form-group">
            <label>共同关键词（用逗号分隔，可选）</label>
            <input
              type="text"
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              placeholder="例如：市场规模, 竞争格局"
              className="form-input"
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary batch-submit"
            disabled={submitting || !queries.trim()}
          >
            {submitting ? "提交中..." : "🚀 开始批量研究"}
          </button>
          {submitError && <div className="form-error" role="alert">{submitError}</div>}
        </form>

        {/* Current batch status */}
        {currentBatch && (
          <div className="batch-progress">
            <div className="batch-progress-header">
              <h3>批量研究进度</h3>
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
              {currentBatch.completed + currentBatch.failed} / {currentBatch.total} 完成
              · {currentBatch.completed} 成功
              · {currentBatch.failed} 失败
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
                      查看 →
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
            <h3 className="batch-history-title">最近批量研究</h3>
            <div className="batch-history-list">
              {recentBatches.slice(0, 5).map((batch) => (
                <div key={batch.id} className="batch-history-item">
                  <div className="batch-history-info">
                    <div className="batch-history-id">{batch.id}</div>
                    <div className="batch-history-meta">
                      {batch.total} 个研究 · {formatTime(batch.createdAt)}
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
