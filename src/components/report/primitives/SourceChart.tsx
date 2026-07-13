"use client";

export function SourceChart({ sources }: { sources: { domain?: string; url: string; title: string }[] }) {
  if (!sources?.length) return null;

  const domainCounts = new Map<string, number>();
  for (const source of sources) {
    let domain = source.domain;
    if (!domain) {
      try {
        domain = new URL(source.url).hostname;
      } catch {
        domain = "unknown";
      }
    }
    domainCounts.set(domain, (domainCounts.get(domain) || 0) + 1);
  }

  const sorted = Array.from(domainCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);
  const maxCount = Math.max(...sorted.map(([, count]) => count), 1);

  return (
    <section aria-label="Sources by domain" className="border-t border-slate-200 pt-4">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-slate-700">
        Sources by domain
      </h3>
      <div className="space-y-2.5">
        {sorted.map(([domain, count]) => (
          <div key={domain} className="grid grid-cols-[minmax(0,8rem)_1fr_2rem] items-center gap-3">
            <span className="truncate text-xs text-slate-600" title={domain}>{domain}</span>
            <div className="h-1.5 overflow-hidden rounded-sm bg-slate-100" aria-hidden>
              <div
                className="h-full rounded-sm bg-slate-700"
                style={{ width: `${(count / maxCount) * 100}%` }}
              />
            </div>
            <span className="text-right font-mono text-xs tabular-nums text-slate-700">{count}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
