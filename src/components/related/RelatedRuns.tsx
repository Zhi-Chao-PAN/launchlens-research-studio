"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { findRelatedRuns } from "@/lib/research/suggestions";

interface RelatedRun {
  id: string;
  query: string;
  keywords: string[];
  status: "completed" | "failed";
  createdAt: number;
}

interface RelatedRunsProps {
  runId: string;
  keywords: string[];
  limit?: number;
}

export function RelatedRuns({ runId, keywords, limit = 5 }: RelatedRunsProps) {
  const [related, setRelated] = useState<Array<{
    run: { id: string; keywords: string[]; query: string; status?: string; createdAt?: number };
    similarity: number;
    sharedKeywords: string[];
  }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch("/api/research/runs?limit=100");
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;

        const runs = data.runs || [];
        const target = { id: runId, keywords, query: "" };
        const results = findRelatedRuns(target, runs, limit);
        setRelated(results);
      } catch {
        // Silently fail - related runs are non-critical
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void Promise.resolve().then(load);

    return () => {
      cancelled = true;
    };
  }, [runId, keywords.join(","), limit]);

  if (loading) {
    return (
      <div className="related-runs-card">
        <h4 className="related-runs-title">相关研究</h4>
        <div className="related-runs-loading">加载中...</div>
      </div>
    );
  }

  if (related.length === 0) {
    return null;
  }

  return (
    <div className="related-runs-card">
      <h4 className="related-runs-title">
        相关研究
        <span className="related-runs-count">{related.length}</span>
      </h4>
      <div className="related-runs-list">
        {related.map(({ run, similarity, sharedKeywords }) => (
          <Link
            key={run.id}
            href={`/research/${run.id}`}
            className="related-run-item"
          >
            <div className="related-run-header">
              <span className="related-run-query">{run.query}</span>
              <span className="related-run-similarity">
                {Math.round(similarity * 100)}%
              </span>
            </div>
            {sharedKeywords.length > 0 && (
              <div className="related-run-keywords">
                {sharedKeywords.map((k) => (
                  <span key={k} className="related-kw-tag">{k}</span>
                ))}
              </div>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}

export default RelatedRuns;