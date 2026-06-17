"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { parseSynthesis, type SynthesisOutput, type Source } from "@/lib/research/synthesis-parser";

interface ResearchRun {
  id: string;
  query: string;
  keywords: string[];
  result: string;
  sources?: Source[];
  provider: string;
  model: string;
  createdAt: number;
  durationMs: number;
  status: "completed" | "failed";
}

interface ShareInfo {
  token: string;
  views: number;
  maxViews: number | null;
  expiresAt: number | null;
  creator?: string | null;
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleString();
}

function formatDuration(ms: number): string {
  if (ms < 1000) return ms + "ms";
  if (ms < 60000) return (ms / 1000).toFixed(1) + "s";
  return Math.floor(ms / 60000) + "m " + Math.floor((ms % 60000) / 1000) + "s";
}

function ConfidenceBadge({ level }: { level: string }) {
  return <span className={`confidence-badge confidence-${level}`}>{level} confidence</span>;
}

function ScoreBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="score-bar">
      <div className="score-bar-header">
        <span className="score-bar-label">{label}</span>
        <span className="score-bar-value" style={{ color }}>{value}/100</span>
      </div>
      <div className="score-bar-track">
        <div className="score-bar-fill" style={{ width: `${value}%`, background: color }} />
      </div>
    </div>
  );
}

function ShareInfoBanner({ shareInfo }: { shareInfo: ShareInfo }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  }, []);

  return (
    <div className="share-info-banner">
      <div className="share-info-row">
        <div className="share-info-item">
          <span className="share-info-icon">???</span>
          <span className="share-info-label">Views</span>
          <span className="share-info-value">
            {shareInfo.views}
            {shareInfo.maxViews !== null && ` / ${shareInfo.maxViews} max`}
          </span>
        </div>

        {shareInfo.expiresAt !== null && (
          <div className="share-info-item">
            <span className="share-info-icon">?</span>
            <span className="share-info-label">Expires</span>
            <span className="share-info-value">
              {formatTime(shareInfo.expiresAt)}
            </span>
          </div>
        )}

        <div className="share-info-spacer" />

        <button
          className="share-copy-btn"
          onClick={handleCopy}
          aria-label="Copy share link"
        >
          {copied ? "? Copied!" : "?? Copy link"}
        </button>
      </div>
    </div>
  );
}

export default function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const [token, setToken] = useState<string | null>(null);
  const [run, setRun] = useState<ResearchRun | null>(null);
  const [shareInfo, setShareInfo] = useState<ShareInfo | null>(null);
  const [synthesis, setSynthesis] = useState<SynthesisOutput | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Resolve params promise
  useEffect(() => {
    let cancelled = false;
    void Promise.resolve(params).then(({ token: t }) => {
      if (!cancelled) setToken(t);
    });
    return () => { cancelled = true; };
  }, [params]);

  // Update document title and meta description
  useEffect(() => {
    if (run?.query) {
      document.title = `${run.query} ? LaunchLens Research`;
    } else if (error) {
      document.title = "Share unavailable ? LaunchLens";
    } else {
      document.title = "LaunchLens ? Shared Research";
    }
  }, [run?.query, error]);

  useEffect(() => {
    if (!token) return;

    let cancelled = false;
    const controller = new AbortController();

    async function load() {
      try {
        const res = await fetch(`/api/research/share/${token}`, {
          signal: controller.signal,
        });
        if (!res.ok) {
          if (res.status === 404) {
            throw new Error("This share link does not exist or has expired.");
          }
          throw new Error(`HTTP ${res.status}`);
        }
        const data = await res.json();
        if (cancelled) return;
        setRun(data.run);
        setShareInfo(data.share);
        setSynthesis(parseSynthesis(data.run.result));
        setError(null);
      } catch (e: unknown) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void Promise.resolve().then(load);

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [token]);

  // Update meta description
  useEffect(() => {
    let meta = document.querySelector('meta[name="description"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.setAttribute("name", "description");
      document.head.appendChild(meta);
    }
    if (synthesis?.execSummary) {
      meta.setAttribute("content", synthesis.execSummary.substring(0, 160));
    } else if (run?.query) {
      meta.setAttribute("content", `Market research on ${run.query} powered by LaunchLens multi-agent system.`);
    }
  }, [synthesis?.execSummary, run?.query]);

  if (loading) {
    return (
      <div className="research-detail share-page">
        <div className="research-detail-inner">
          <p className="loading">Loading shared research...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="share-page share-error-page">
        <div className="share-error-inner">
          <div className="share-error-brand">
            <span className="share-error-logo">??</span>
            <span className="share-error-brand-name">LaunchLens</span>
          </div>
          <div className="share-error-card">
            <div className="share-error-icon">??</div>
            <h1>Link Unavailable</h1>
            <p className="share-error-desc">{error}</p>
            <p className="share-error-hint">
              The research may have been unshared, reached its view limit, or expired.
            </p>
            <Link href="/" className="share-error-btn">
              ? Explore LaunchLens
            </Link>
          </div>
          <p className="share-error-footer">
            Powered by LaunchLens ? multi-agent market research platform
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="research-detail share-page">
      {/* Branded header */}
      <header className="share-page-header">
        <div className="share-page-header-inner">
          <Link href="/" className="share-page-logo">
            <span className="share-page-logo-icon">??</span>
            <span className="share-page-logo-text">LaunchLens</span>
          </Link>
          <div className="share-page-badges">
            <span className="share-badge">?? Public share</span>
            {run?.status === "completed" && (
              <span className="share-status-badge status-completed">? Completed</span>
            )}
          </div>
        </div>
      </header>

      {shareInfo && <ShareInfoBanner shareInfo={shareInfo} />}

      <div className="research-detail-inner">
        <header className="research-detail-header">
          <div className="research-detail-header-inner">
            <h1 className="research-detail-title">{run?.query}</h1>
            <div className="research-detail-meta">
              <span className="research-provider">{run?.provider} / {run?.model}</span>
              <span className="research-time">{run ? formatTime(run.createdAt) : ""}</span>
              <span className="research-duration">{run ? formatDuration(run.durationMs) : ""}</span>
            </div>
            {run?.keywords.length ? (
              <div className="research-keywords">
                {run.keywords.map((kw) => (
                  <span key={kw} className="research-keyword">{kw}</span>
                ))}
              </div>
            ) : null}
          </div>
        </header>

        <main className="research-detail-main">
          {synthesis && (
            <>
              <section className="research-section">
                <h2>Executive Summary</h2>
                <p className="research-exec-summary">{synthesis.execSummary}</p>
              </section>

              <section className="research-section research-scores-section">
                <h2>Scores</h2>
                <div className="research-scores-grid">
                  <ScoreBar label="Opportunity Index" value={synthesis.opportunityScore} color="#4ade80" />
                  <ScoreBar label="Risk Index" value={synthesis.riskScore} color="#f87171" />
                </div>
              </section>

              <section className="research-section">
                <h2>Key Insights ({synthesis.keyInsights.length})</h2>
                <div className="research-insights">
                  {synthesis.keyInsights.map((insight, i) => (
                    <div key={i} className="research-insight-item">
                      <div className="research-insight-header">
                        <span className="research-insight-number">{i + 1}</span>
                        <ConfidenceBadge level={insight.confidence} />
                      </div>
                      <p className="research-insight-text">{insight.insight}</p>
                      {insight.supportingAgents.length > 0 && (
                        <div className="research-insight-agents">
                          Analysis angles: {insight.supportingAgents.join(" ? ")}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </section>

              <section className="research-section">
                <h2>Top Opportunities</h2>
                <div className="research-cards">
                  {synthesis.topThreeOpportunities.map((opp, i) => (
                    <div key={i} className="research-card research-card-opportunity">
                      <div className="research-card-header">
                        <span className="research-card-number">{i + 1}</span>
                        <h3 className="research-card-title">{opp.title}</h3>
                      </div>
                      <p className="research-card-desc">{opp.description}</p>
                      <div className="research-card-rationale">
                        <strong>Evidence:</strong> {opp.rationale}
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="research-section">
                <h2>Key Risks</h2>
                <div className="research-cards">
                  {synthesis.topThreeRisks.map((risk, i) => (
                    <div key={i} className="research-card research-card-risk">
                      <div className="research-card-header">
                        <span className="research-card-number">{i + 1}</span>
                        <h3 className="research-card-title">{risk.title}</h3>
                      </div>
                      <p className="research-card-desc">{risk.description}</p>
                      <div className="research-card-mitigation">
                        <strong>Mitigation:</strong> {risk.mitigation}
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="research-section">
                <h2>Recommended Next Step</h2>
                <div className="research-next-step">
                  {synthesis.recommendedNextStep}
                </div>
              </section>

              {synthesis.citations && synthesis.citations.length > 0 && (
                <section className="research-section">
                  <h2>Sources ({synthesis.citations.length})</h2>
                  <ul className="research-sources">
                    {synthesis.citations.map((s, i) => (
                      <li key={i} className="research-source-item">
                        <a href={s.url} target="_blank" rel="noopener noreferrer" className="research-source-title">
                          {s.title}
                        </a>
                        {s.snippet && <p className="research-source-snippet">{s.snippet}</p>}
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </>
          )}

          {!synthesis && run?.result && (
            <section className="research-section">
              <h2>Research Result</h2>
              <div className="research-result">
                <pre className="research-result-text">{run.result}</pre>
              </div>
            </section>
          )}

          {shareInfo && (
            <div className="share-footer">
              <p>
                Viewed {shareInfo.views} time{shareInfo.views !== 1 ? "s" : ""}
                {shareInfo.maxViews !== null && ` ? ${shareInfo.maxViews} view limit`}
                {shareInfo.expiresAt !== null && ` ? Expires ${formatTime(shareInfo.expiresAt)}`}
              </p>
              <p className="share-brand">
                Generated by LaunchLens ? Multi-agent market research platform
              </p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
