"use client";

import { SiteHeader } from "@/components/layout/SiteHeader";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { parseSynthesis, type SynthesisOutput } from "@/lib/research/synthesis-parser";
import { diffResearch, formatDelta, type ResearchDiff } from "@/lib/research/research-diff";
import { computeSourceOverlap, type SourceOverlapResult } from "@/lib/research/source-overlap";
import { VennDiagram } from "@/components/venn/VennDiagram";
import { CardSkeleton } from "@/components/skeleton/Skeleton";

interface ResearchRun {
  id: string;
  query: string;
  keywords: string[];
  result: string;
  provider: string;
  model: string;
  createdAt: number;
  durationMs: number;
  sources?: { title: string; url: string }[];
  status: "completed" | "failed";
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleString();
}

function formatDuration(ms: number): string {
  if (ms < 1000) return ms + "ms";
  if (ms < 60000) return (ms / 1000).toFixed(1) + "s";
  return Math.floor(ms / 60000) + "m " + Math.floor((ms % 60000) / 1000) + "s";
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


export default function ComparePage() {
  const searchParams = useSearchParams();
  const idA = searchParams.get("a");
  const idB = searchParams.get("b");

  const [runA, setRunA] = useState<ResearchRun | null>(null);
  const [runB, setRunB] = useState<ResearchRun | null>(null);
  const [synA, setSynA] = useState<SynthesisOutput | null>(null);
  const [synB, setSynB] = useState<SynthesisOutput | null>(null);
  const [loading, setLoading] = useState(true);
  const [showDiff, setShowDiff] = useState(false);
  const [diff, setDiff] = useState<ResearchDiff | null>(null);
  const [sourceOverlap, setSourceOverlap] = useState<SourceOverlapResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!idA || !idB) {
      // Queue as microtask to avoid synchronous setState in effect
      void Promise.resolve().then(() => {
        setError("请选择两个研究进行对比。");
        setLoading(false);
      });
      return;
    }

    let cancelled = false;
    const controller = new AbortController();

    async function load() {
      try {
        const [resA, resB] = await Promise.all([
          fetch(`/api/research/runs/${idA}`, { signal: controller.signal }),
          fetch(`/api/research/runs/${idB}`, { signal: controller.signal }),
        ]);

        if (cancelled) return;

        if (!resA.ok) throw new Error(`研究 A 加载失败 (HTTP ${resA.status})`);
        if (!resB.ok) throw new Error(`研究 B 加载失败 (HTTP ${resB.status})`);

        const dataA = await resA.json();
        const dataB = await resB.json();

        setRunA(dataA);
        setRunB(dataB);
        setSynA(parseSynthesis(dataA.result));
        setSynB(parseSynthesis(dataB.result));
        setError(null);
      } catch (e: unknown) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "加载失败");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void Promise.resolve().then(load);

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [idA, idB]);

  // Compute diff when both syntheses are available
  useEffect(() => {
    if (synA && synB) {
      // Queue as microtask to avoid synchronous setState in effect
      void Promise.resolve().then(() => {
        setDiff(diffResearch(synA, synB));
        setSourceOverlap(computeSourceOverlap(
          (synA.citations || []).map((c: { title: string; url: string }) => ({ title: c.title, url: c.url })),
          (synB.citations || []).map((c: { title: string; url: string }) => ({ title: c.title, url: c.url })),
        ));
      });
    }
  }, [synA, synB]);

  if (loading) {
    return (
      <div className="compare-page">
        <header className="compare-header">
          <div className="compare-header-inner">
            <div className="research-back-link" style={{ opacity: 0.5 }}>← 返回历史</div>
            <h1 className="compare-title">研究对比</h1>
          </div>
        </header>
        <main className="compare-main">
          <div className="compare-header-row">
            <div className="compare-header-cell compare-header-a">
              <div className="compare-label">方案 A</div>
              <div style={{ height: 24, width: "70%", borderRadius: 6, background: "rgba(255,255,255,0.1)" }} />
              <div className="compare-meta" style={{ opacity: 0.5 }}>加载中...</div>
            </div>
            <div className="compare-header-divider">VS</div>
            <div className="compare-header-cell compare-header-b">
              <div className="compare-label">方案 B</div>
              <div style={{ height: 24, width: "70%", borderRadius: 6, background: "rgba(255,255,255,0.1)" }} />
              <div className="compare-meta" style={{ opacity: 0.5 }}>加载中...</div>
            </div>
          </div>
          <section className="compare-section">
            <h2 className="compare-section-title">评分对比</h2>
            <div className="compare-row">
              <div className="compare-col compare-col-a"><CardSkeleton lines={3} /></div>
              <div className="compare-divider" />
              <div className="compare-col compare-col-b"><CardSkeleton lines={3} /></div>
            </div>
          </section>
          <section className="compare-section">
            <h2 className="compare-section-title">执行摘要</h2>
            <div className="compare-row">
              <div className="compare-col compare-col-a"><CardSkeleton lines={5} /></div>
              <div className="compare-divider" />
              <div className="compare-col compare-col-b"><CardSkeleton lines={5} /></div>
            </div>
          </section>
        </main>
      </div>
    );
  }

  if (error) {
    return (
      <div className="research-detail">
        <div className="research-detail-inner share-error">
          <div className="share-icon">⚖️</div>
          <h1>对比失败</h1>
          <p>{error}</p>
          <Link href="/history" className="share-home-link">← 返回历史记录</Link>
        </div>
      </div>
    );
  }

  // Compute diff for scores
  const oppDiff = synA && synB ? synB.opportunityScore - synA.opportunityScore : 0;
  const riskDiff = synA && synB ? synB.riskScore - synA.riskScore : 0;

  return (
    <div className="compare-page">
      <header className="compare-header">
        <div className="compare-header-inner">
          <Link href="/history" className="research-back-link">← 返回历史</Link>
          <h1 className="compare-title">研究对比</h1>
          <div className="compare-toolbar">
            <p className="compare-subtitle">
              {runA?.query} <span className="compare-vs">vs</span> {runB?.query}
            </p>
            {synA && synB && diff && (
              <button
                className={`diff-toggle ${showDiff ? "active" : ""}`}
                onClick={() => setShowDiff(!showDiff)}
              >
                {showDiff ? "📊 并排视图" : "🔍 差异视图"}
                {diff.summary.totalChanges > 0 && (
                  <span className="diff-badge">{diff.summary.totalChanges} 处变化</span>
                )}
              </button>
            )}
          </div>
        </div>
      </header>

      <div className="compare-header-row">
        <div className="compare-header-cell compare-header-a">
          <div className="compare-label">方案 A</div>
          <h3>{runA?.query}</h3>
          <div className="compare-meta">
            <span>{runA?.provider} / {runA?.model}</span>
            <span>{runA ? formatDuration(runA.durationMs) : ""}</span>
          </div>
        </div>
        <div className="compare-header-divider">VS</div>
        <div className="compare-header-cell compare-header-b">
          <div className="compare-label">方案 B</div>
          <h3>{runB?.query}</h3>
          <div className="compare-meta">
            <span>{runB?.provider} / {runB?.model}</span>
            <span>{runB ? formatDuration(runB.durationMs) : ""}</span>
          </div>
        </div>
      </div>

      <SiteHeader />
      <main className="compare-main">
        {showDiff && diff && (
          <section className="diff-section">
            <h2 className="compare-section-title">
              差异概览
              <span className="diff-summary-badge">
                {diff.summary.added} 新增 · {diff.summary.removed} 移除 · {diff.summary.modified} 变更
              </span>
            </h2>

            {/* Score diff */}
            <div className="diff-scores">
              <div className="diff-score-item">
                <span className="diff-score-label">机遇指数</span>
                <span className={`diff-score-value ${diff.scoreChanges.opportunityScore >= 0 ? "positive" : "negative"}`}>
                  {formatDelta(diff.scoreChanges.opportunityScore, "分")}
                </span>
              </div>
              <div className="diff-score-item">
                <span className="diff-score-label">风险指数</span>
                <span className={`diff-score-value ${diff.scoreChanges.riskScore <= 0 ? "positive" : "negative"}`}>
                  {formatDelta(diff.scoreChanges.riskScore, "分")}
                </span>
              </div>
            </div>

            {/* Insight diff */}
            {diff.insights.added.length > 0 && (
              <div className="diff-group">
                <h3 className="diff-group-title diff-added-title">
                  新增洞察 ({diff.insights.added.length})
                </h3>
                <div className="diff-items">
                  {diff.insights.added.map((insight, i) => (
                    <div key={i} className="diff-item diff-item-added">
                      <span className="diff-icon">+</span>
                      <p>{insight}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {diff.insights.removed.length > 0 && (
              <div className="diff-group">
                <h3 className="diff-group-title diff-removed-title">
                  移除洞察 ({diff.insights.removed.length})
                </h3>
                <div className="diff-items">
                  {diff.insights.removed.map((insight, i) => (
                    <div key={i} className="diff-item diff-item-removed">
                      <span className="diff-icon">−</span>
                      <p>{insight}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {diff.insights.modified.length > 0 && (
              <div className="diff-group">
                <h3 className="diff-group-title diff-modified-title">
                  修改洞察 ({diff.insights.modified.length})
                </h3>
                <div className="diff-modified-list">
                  {diff.insights.modified.map((pair, i) => (
                    <div key={i} className="diff-modified-item">
                      <div className="diff-modified-side diff-modified-old">
                        <div className="diff-modified-label">之前</div>
                        <p className="diff-modified-text">{pair.old}</p>
                      </div>
                      <div className="diff-modified-divider">
                        <span className="diff-modified-similarity">
                          {Math.round(pair.similarity * 100)}%
                        </span>
                      </div>
                      <div className="diff-modified-side diff-modified-new">
                        <div className="diff-modified-label">现在</div>
                        <p className="diff-modified-text">{pair.new}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Opportunities diff */}
            {diff.opportunities.added.length > 0 && (
              <div className="diff-group">
                <h3 className="diff-group-title diff-added-title">
                  新增机遇 ({diff.opportunities.added.length})
                </h3>
                <div className="diff-cards">
                  {diff.opportunities.added.map((opp, i) => (
                    <div key={i} className="research-card research-card-opportunity diff-card-added">
                      <div className="research-card-header">
                        <span className="research-card-number">+</span>
                        <h3 className="research-card-title">{opp.title}</h3>
                      </div>
                      <p className="research-card-desc">{opp.description}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {diff.opportunities.removed.length > 0 && (
              <div className="diff-group">
                <h3 className="diff-group-title diff-removed-title">
                  移除机遇 ({diff.opportunities.removed.length})
                </h3>
                <div className="diff-cards">
                  {diff.opportunities.removed.map((opp, i) => (
                    <div key={i} className="research-card research-card-opportunity diff-card-removed">
                      <div className="research-card-header">
                        <span className="research-card-number">−</span>
                        <h3 className="research-card-title">{opp.title}</h3>
                      </div>
                      <p className="research-card-desc">{opp.description}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {diff.opportunities.modified.length > 0 && (
              <div className="diff-group">
                <h3 className="diff-group-title diff-modified-title">
                  修改机遇 ({diff.opportunities.modified.length})
                </h3>
                <div className="diff-modified-list">
                  {diff.opportunities.modified.map((pair, i) => (
                    <div key={i} className="diff-modified-item">
                      <div className="diff-modified-side diff-modified-old">
                        <div className="diff-modified-label">之前</div>
                        <div className="research-card research-card-opportunity diff-card-modified">
                          <div className="research-card-header">
                            <span className="research-card-number">~</span>
                            <h3 className="research-card-title">{pair.old.title}</h3>
                          </div>
                          <p className="research-card-desc">{pair.old.description}</p>
                        </div>
                      </div>
                      <div className="diff-modified-divider">
                        <span className="diff-modified-arrow">→</span>
                      </div>
                      <div className="diff-modified-side diff-modified-new">
                        <div className="diff-modified-label">现在</div>
                        <div className="research-card research-card-opportunity diff-card-modified">
                          <div className="research-card-header">
                            <span className="research-card-number">~</span>
                            <h3 className="research-card-title">{pair.new.title}</h3>
                          </div>
                          <p className="research-card-desc">{pair.new.description}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Risks diff */}
            {diff.risks.added.length > 0 && (
              <div className="diff-group">
                <h3 className="diff-group-title diff-added-title">
                  新增风险 ({diff.risks.added.length})
                </h3>
                <div className="diff-cards">
                  {diff.risks.added.map((risk, i) => (
                    <div key={i} className="research-card research-card-risk diff-card-added">
                      <div className="research-card-header">
                        <span className="research-card-number">+</span>
                        <h3 className="research-card-title">{risk.title}</h3>
                      </div>
                      <p className="research-card-desc">{risk.description}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {diff.risks.removed.length > 0 && (
              <div className="diff-group">
                <h3 className="diff-group-title diff-removed-title">
                  移除风险 ({diff.risks.removed.length})
                </h3>
                <div className="diff-cards">
                  {diff.risks.removed.map((risk, i) => (
                    <div key={i} className="research-card research-card-risk diff-card-removed">
                      <div className="research-card-header">
                        <span className="research-card-number">−</span>
                        <h3 className="research-card-title">{risk.title}</h3>
                      </div>
                      <p className="research-card-desc">{risk.description}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {diff.risks.modified.length > 0 && (
              <div className="diff-group">
                <h3 className="diff-group-title diff-modified-title">
                  修改风险 ({diff.risks.modified.length})
                </h3>
                <div className="diff-modified-list">
                  {diff.risks.modified.map((pair, i) => (
                    <div key={i} className="diff-modified-item">
                      <div className="diff-modified-side diff-modified-old">
                        <div className="diff-modified-label">之前</div>
                        <div className="research-card research-card-risk diff-card-modified">
                          <div className="research-card-header">
                            <span className="research-card-number">~</span>
                            <h3 className="research-card-title">{pair.old.title}</h3>
                          </div>
                          <p className="research-card-desc">{pair.old.description}</p>
                        </div>
                      </div>
                      <div className="diff-modified-divider">
                        <span className="diff-modified-arrow">→</span>
                      </div>
                      <div className="diff-modified-side diff-modified-new">
                        <div className="diff-modified-label">现在</div>
                        <div className="research-card research-card-risk diff-card-modified">
                          <div className="research-card-header">
                            <span className="research-card-number">~</span>
                            <h3 className="research-card-title">{pair.new.title}</h3>
                          </div>
                          <p className="research-card-desc">{pair.new.description}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Next step diff */}
            {diff.nextStepChanged && (
              <div className="diff-group">
                <h3 className="diff-group-title">建议下一步（已变更）</h3>
                <div className="diff-nextstep">
                  <div className="diff-nextstep-old">
                    <div className="diff-nextstep-label">之前</div>
                    <p className="research-next-step">{diff.oldNextStep}</p>
                  </div>
                  <div className="diff-nextstep-arrow">→</div>
                  <div className="diff-nextstep-new">
                    <div className="diff-nextstep-label">现在</div>
                    <p className="research-next-step">{diff.newNextStep}</p>
                  </div>
                </div>
              </div>
            )}

            {diff.summary.totalChanges === 0 && (
              <div className="diff-empty">
                <p>✨ 两份研究完全相同</p>
              </div>
            )}
          </section>
        )}
        {/* Scores comparison */}
        {synA && synB && (
          <section className="compare-section">
            <h2 className="compare-section-title">评分对比</h2>
            <div className="compare-row">
              <div className="compare-col compare-col-a">
                <ScoreBar label="机遇指数" value={synA.opportunityScore} color="#4ade80" />
                <ScoreBar label="风险指数" value={synA.riskScore} color="#f87171" />
              </div>
              <div className="compare-divider compare-divider-scores">
                <div className={`score-diff ${oppDiff >= 0 ? "diff-positive" : "diff-negative"}`}>
                  {oppDiff >= 0 ? "+" : ""}{oppDiff}
                  <span className="diff-label">机遇</span>
                </div>
                <div className={`score-diff ${riskDiff <= 0 ? "diff-positive" : "diff-negative"}`}>
                  {riskDiff >= 0 ? "+" : ""}{riskDiff}
                  <span className="diff-label">风险</span>
                </div>
              </div>
              <div className="compare-col compare-col-b">
                <ScoreBar label="机遇指数" value={synB.opportunityScore} color="#4ade80" />
                <ScoreBar label="风险指数" value={synB.riskScore} color="#f87171" />
              </div>
            </div>
          </section>
        )}

        {/* Keywords overlap Venn */}
        {runA && runB && runA.keywords.length > 0 && runB.keywords.length > 0 && (
          <section className="compare-section">
            <h2 className="compare-section-title">关键词重合度</h2>
            <div className="compare-venn-wrapper">
              {(() => {
                const labelA = runA.query.length > 20 ? runA.query.slice(0, 20) + "…" : runA.query;
                const labelB = runB.query.length > 20 ? runB.query.slice(0, 20) + "…" : runB.query;
                const vennSets = [
                  { label: labelA, color: "#6366f1", items: runA.keywords },
                  { label: labelB, color: "#ec4899", items: runB.keywords },
                ];
                return <VennDiagram sets={vennSets} width={440} height={240} />;
              })()}
            </div>
            {(() => {
              const setA = new Set(runA.keywords);
              const setB = new Set(runB.keywords);
              const shared = [...setA].filter((k) => setB.has(k));
              const onlyA = [...setA].filter((k) => !setB.has(k));
              const onlyB = [...setB].filter((k) => !setA.has(k));
              return (
                <div className="compare-keyword-list">
                  {shared.length > 0 && (
                    <div className="compare-keyword-group">
                      <span className="compare-keyword-label">共有 ({shared.length})</span>
                      <div className="compare-keywords">
                        {shared.map((k) => (
                          <span key={k} className="compare-kw-tag shared">{k}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {onlyA.length > 0 && (
                    <div className="compare-keyword-group">
                      <span className="compare-keyword-label">仅 A ({onlyA.length})</span>
                      <div className="compare-keywords">
                        {onlyA.map((k) => (
                          <span key={k} className="compare-kw-tag only-a">{k}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {onlyB.length > 0 && (
                    <div className="compare-keyword-group">
                      <span className="compare-keyword-label">仅 B ({onlyB.length})</span>
                      <div className="compare-keywords">
                        {onlyB.map((k) => (
                          <span key={k} className="compare-kw-tag only-b">{k}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
          </section>
        )}

        {/* Source overlap analysis */}
        {sourceOverlap ? (
          <section className="compare-section">
            <h2 className="compare-section-title">
              来源重合度
              <span className="diff-summary-badge">
                相似度 {Math.round(sourceOverlap.jaccardSimilarity * 100)}%
              </span>
            </h2>

            <div className="source-overlap-stats">
              <div className="source-overlap-stat">
                <div className="source-overlap-stat-value">{sourceOverlap.totalA}</div>
                <div className="source-overlap-stat-label">方案 A 来源</div>
              </div>
              <div className="source-overlap-stat shared">
                <div className="source-overlap-stat-value">{sourceOverlap.shared}</div>
                <div className="source-overlap-stat-label">共有</div>
              </div>
              <div className="source-overlap-stat">
                <div className="source-overlap-stat-value">{sourceOverlap.totalB}</div>
                <div className="source-overlap-stat-label">方案 B 来源</div>
              </div>
            </div>

            {sourceOverlap.sharedDomains.length > 0 && (
              <div className="source-domain-group">
                <p className="source-domain-label">共有域名 ({sourceOverlap.sharedDomains.length})</p>
                <div className="source-domain-list">
                  {sourceOverlap.sharedDomains.map((d: string) => (
                    <span key={d} className="source-domain-tag shared">{d}</span>
                  ))}
                </div>
              </div>
            )}

            {(sourceOverlap.domainsOnlyA.length > 0 || sourceOverlap.domainsOnlyB.length > 0) && (
              <div className="compare-row" style={{ marginTop: 16 }}>
                <div className="compare-col compare-col-a">
                  {sourceOverlap.domainsOnlyA.length > 0 && (
                    <div className="source-domain-group">
                      <p className="source-domain-label">仅 A 域名</p>
                      <div className="source-domain-list">
                        {sourceOverlap.domainsOnlyA.map((d: string) => (
                          <span key={d} className="source-domain-tag only-a">{d}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <div className="compare-divider" />
                <div className="compare-col compare-col-b">
                  {sourceOverlap.domainsOnlyB.length > 0 && (
                    <div className="source-domain-group">
                      <p className="source-domain-label">仅 B 域名</p>
                      <div className="source-domain-list">
                        {sourceOverlap.domainsOnlyB.map((d: string) => (
                          <span key={d} className="source-domain-tag only-b">{d}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </section>
        ) : null}



        {/* Executive summaries */}
        {synA && synB && (
          <section className="compare-section">
            <h2 className="compare-section-title">执行摘要</h2>
            <div className="compare-row">
              <div className="compare-col compare-col-a">
                <p className="compare-exec-summary">{synA.execSummary}</p>
              </div>
              <div className="compare-divider" />
              <div className="compare-col compare-col-b">
                <p className="compare-exec-summary">{synB.execSummary}</p>
              </div>
            </div>
          </section>
        )}

        {/* Key insights */}
        {synA && synB && (
          <section className="compare-section">
            <h2 className="compare-section-title">
              关键洞察 (A: {synA.keyInsights.length} · B: {synB.keyInsights.length})
            </h2>
            <div className="compare-row">
              <div className="compare-col compare-col-a">
                <div className="compare-insights">
                  {synA.keyInsights.map((insight, i) => (
                    <div key={i} className="research-insight-item">
                      <div className="research-insight-header">
                        <span className="research-insight-number">{i + 1}</span>
                        <span className={`confidence-badge confidence-${insight.confidence}`}>
                          {insight.confidence}
                        </span>
                      </div>
                      <p className="research-insight-text">{insight.insight}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="compare-divider" />
              <div className="compare-col compare-col-b">
                <div className="compare-insights">
                  {synB.keyInsights.map((insight, i) => (
                    <div key={i} className="research-insight-item">
                      <div className="research-insight-header">
                        <span className="research-insight-number">{i + 1}</span>
                        <span className={`confidence-badge confidence-${insight.confidence}`}>
                          {insight.confidence}
                        </span>
                      </div>
                      <p className="research-insight-text">{insight.insight}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Opportunities */}
        {synA && synB && (
          <section className="compare-section">
            <h2 className="compare-section-title">核心机遇</h2>
            <div className="compare-row">
              <div className="compare-col compare-col-a">
                <div className="research-cards">
                  {synA.topThreeOpportunities.map((opp, i) => (
                    <div key={i} className="research-card research-card-opportunity">
                      <div className="research-card-header">
                        <span className="research-card-number">{i + 1}</span>
                        <h3 className="research-card-title">{opp.title}</h3>
                      </div>
                      <p className="research-card-desc">{opp.description}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="compare-divider" />
              <div className="compare-col compare-col-b">
                <div className="research-cards">
                  {synB.topThreeOpportunities.map((opp, i) => (
                    <div key={i} className="research-card research-card-opportunity">
                      <div className="research-card-header">
                        <span className="research-card-number">{i + 1}</span>
                        <h3 className="research-card-title">{opp.title}</h3>
                      </div>
                      <p className="research-card-desc">{opp.description}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Risks */}
        {synA && synB && (
          <section className="compare-section">
            <h2 className="compare-section-title">主要风险</h2>
            <div className="compare-row">
              <div className="compare-col compare-col-a">
                <div className="research-cards">
                  {synA.topThreeRisks.map((risk, i) => (
                    <div key={i} className="research-card research-card-risk">
                      <div className="research-card-header">
                        <span className="research-card-number">{i + 1}</span>
                        <h3 className="research-card-title">{risk.title}</h3>
                      </div>
                      <p className="research-card-desc">{risk.description}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="compare-divider" />
              <div className="compare-col compare-col-b">
                <div className="research-cards">
                  {synB.topThreeRisks.map((risk, i) => (
                    <div key={i} className="research-card research-card-risk">
                      <div className="research-card-header">
                        <span className="research-card-number">{i + 1}</span>
                        <h3 className="research-card-title">{risk.title}</h3>
                      </div>
                      <p className="research-card-desc">{risk.description}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Next steps */}
        {synA && synB && (
          <section className="compare-section">
            <h2 className="compare-section-title">建议下一步</h2>
            <div className="compare-row">
              <div className="compare-col compare-col-a">
                <div className="research-next-step">{synA.recommendedNextStep}</div>
              </div>
              <div className="compare-divider" />
              <div className="compare-col compare-col-b">
                <div className="research-next-step">{synB.recommendedNextStep}</div>
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
