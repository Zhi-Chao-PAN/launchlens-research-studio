"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { useResearchHistory } from "@/lib/research/history";
import { findRelatedRuns } from "@/lib/research/suggestions";

interface RelatedRunsProps {
  runId: string;
  keywords: string[];
  limit?: number;
}

type RelatedRun = {
  run: {
    id: string;
    keywords: string[];
    query: string;
    status?: string;
    createdAt?: number;
  };
  similarity: number;
  sharedKeywords: string[];
};

export function RelatedRuns({ runId, keywords, limit = 5 }: RelatedRunsProps) {
  const { t } = useLocale();
  const { history, hydrated } = useResearchHistory();
  const keywordsKey = JSON.stringify(keywords);
  const related = useMemo<RelatedRun[]>(() => {
    if (!hydrated) return [];
    const stableKeywords = JSON.parse(keywordsKey) as string[];
    const target = { id: runId, keywords: stableKeywords, query: "" };
    const runs = history.map((entry) => ({
      ...entry,
      createdAt: new Date(entry.createdAt).getTime() || 0,
    }));
    return findRelatedRuns(target, runs, limit);
  }, [history, hydrated, runId, keywordsKey, limit]);

  if (!hydrated) {
    return (
      <div className="related-runs-card">
        <h4 className="related-runs-title">{t("related.title", "Related research")}</h4>
        <div className="related-runs-loading" role="status">
          {t("common.loading", "Loading...")}
        </div>
      </div>
    );
  }

  if (related.length === 0) return null;

  return (
    <div className="related-runs-card">
      <h4 className="related-runs-title">
        {t("related.title", "Related research")}
        <span className="related-runs-count">{related.length}</span>
      </h4>
      <div className="related-runs-list">
        {related.map(({ run, similarity, sharedKeywords }) => (
          <Link key={run.id} href={`/research/${run.id}`} className="related-run-item">
            <div className="related-run-header">
              <span className="related-run-query">{run.query}</span>
              <span className="related-run-similarity">
                {Math.round(similarity * 100)}%
              </span>
            </div>
            {sharedKeywords.length > 0 ? (
              <div className="related-run-keywords">
                {sharedKeywords.map((keyword) => (
                  <span key={keyword} className="related-kw-tag">{keyword}</span>
                ))}
              </div>
            ) : null}
          </Link>
        ))}
      </div>
    </div>
  );
}

export default RelatedRuns;
