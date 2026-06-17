"use client";

import { useState, useEffect } from "react";
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

export default function SharePage({ params }: { params: { token: string } }) {
  const [run, setRun] = useState<ResearchRun | null>(null);
  const [shareInfo, setShareInfo] = useState<ShareInfo | null>(null);
  const [synthesis, setSynthesis] = useState<SynthesisOutput | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);




  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    async function load() {
      try {
        const res = await fetch(`/api/research/share/${params.token}`, {
          signal: controller.signal,
        });
        if (!res.ok) {
          if (res.status === 404) {
            throw new Error("此分享链接不存在或已过期。");
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
        setError(e instanceof Error ? e.message : "加载失败");
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    // Queue as microtask to avoid synchronous setState in effect body
    void Promise.resolve().then(load);

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [params.token]);

  if (loading) {
    return (
      <div className="research-detail">
        <div className="research-detail-inner">
          <p className="loading">加载中...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="research-detail">
        <div className="research-detail-inner share-error">
          <div className="share-icon">🔒</div>
          <h1>无法访问</h1>
          <p>{error}</p>
          <Link href="/" className="share-home-link">← 返回首页</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="research-detail">
      <header className="research-detail-header">
        <div className="research-detail-header-inner">
          <Link href="/" className="research-back-link">← LaunchLens</Link>
          <div className="share-badge">🔗 公开分享</div>
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
              <h2>执行摘要</h2>
              <p className="research-exec-summary">{synthesis.execSummary}</p>
            </section>

            <section className="research-section research-scores-section">
              <h2>评分</h2>
              <div className="research-scores-grid">
                <ScoreBar label="机遇指数" value={synthesis.opportunityScore} color="#4ade80" />
                <ScoreBar label="风险指数" value={synthesis.riskScore} color="#f87171" />
              </div>
            </section>

            <section className="research-section">
              <h2>关键洞察 ({synthesis.keyInsights.length})</h2>
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
                        分析角度: {insight.supportingAgents.join("、")}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>

            <section className="research-section">
              <h2>核心机遇</h2>
              <div className="research-cards">
                {synthesis.topThreeOpportunities.map((opp, i) => (
                  <div key={i} className="research-card research-card-opportunity">
                    <div className="research-card-header">
                      <span className="research-card-number">{i + 1}</span>
                      <h3 className="research-card-title">{opp.title}</h3>
                    </div>
                    <p className="research-card-desc">{opp.description}</p>
                    <div className="research-card-rationale">
                      <strong>依据:</strong> {opp.rationale}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="research-section">
              <h2>主要风险</h2>
              <div className="research-cards">
                {synthesis.topThreeRisks.map((risk, i) => (
                  <div key={i} className="research-card research-card-risk">
                    <div className="research-card-header">
                      <span className="research-card-number">{i + 1}</span>
                      <h3 className="research-card-title">{risk.title}</h3>
                    </div>
                    <p className="research-card-desc">{risk.description}</p>
                    <div className="research-card-mitigation">
                      <strong>应对:</strong> {risk.mitigation}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="research-section">
              <h2>建议下一步</h2>
              <div className="research-next-step">
                {synthesis.recommendedNextStep}
              </div>
            </section>

            {synthesis.citations && synthesis.citations.length > 0 && (
              <section className="research-section">
                <h2>参考来源 ({synthesis.citations.length})</h2>
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
            <h2>研究结果</h2>
            <div className="research-result">
              <pre className="research-result-text">{run.result}</pre>
            </div>
          </section>
        )}

        {shareInfo && (
          <div className="share-footer">
            <p>已被浏览 {shareInfo.views} 次
              {shareInfo.maxViews && ` / 最多 ${shareInfo.maxViews} 次`}
              {shareInfo.expiresAt && ` · ${new Date(shareInfo.expiresAt).toLocaleString()} 过期`}
            </p>
            <p className="share-brand">由 LaunchLens 生成 · 多智能体市场研究平台</p>
          </div>
        )}
      </main>
    </div>
  );
}
