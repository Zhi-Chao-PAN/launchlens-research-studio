"use client";

/**
 * R220: extracted from src/app/research/[id]/page.tsx. The source
 * distribution bar chart is rendered as plain DOM (no SVG), so this
 * one doesn't strictly need ssr: false — but colocating it with
 * ScoreGauge keeps the dynamic-import surface uniform.
 */
export function SourceChart({ sources }: { sources: { domain?: string; url: string; title: string }[] }) {
  if (!sources?.length) return null;

  // Count by domain
  const domainCounts = new Map<string, number>();
  for (const s of sources) {
    let domain = s.domain;
    if (!domain) {
      try {
        domain = new URL(s.url).hostname;
      } catch {
        domain = "unknown";
      }
    }
    domainCounts.set(domain, (domainCounts.get(domain) || 0) + 1);
  }

  // Sort by count, take top 6
  const sorted = Array.from(domainCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);

  const maxCount = Math.max(...sorted.map(([, c]) => c));

  const colors = ["#6366f1", "#8b5cf6", "#06b6d4", "#10b981", "#f59e0b", "#ec4899"];

  return (
    <div className="source-chart">
      <div className="source-chart-title">Sources by Domain</div>
      <div className="source-chart-bars">
        {sorted.map(([domain, count], i) => (
          <div key={domain} className="source-chart-row">
            <span className="source-chart-domain">{domain}</span>
            <div className="source-chart-bar-track">
              <div
                className="source-chart-bar-fill"
                style={{
                  width: (count / maxCount * 100) + "%",
                  background: colors[i % colors.length],
                }}
              />
            </div>
            <span className="source-chart-count">{count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
