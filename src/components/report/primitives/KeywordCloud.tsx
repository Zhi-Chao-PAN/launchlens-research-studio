"use client";

const emphasisForRank = (index: number): string => {
  if (index < 3) return "text-sm font-semibold text-slate-900";
  if (index < 8) return "text-xs font-medium text-slate-700";
  return "text-xs font-normal text-slate-600";
};

export function KeywordCloud({ keywords }: { keywords: string[] }) {
  if (!keywords?.length) return null;

  return (
    <ol className="flex flex-wrap gap-x-4 gap-y-2" aria-label="Research keywords by priority">
      {keywords.slice(0, 20).map((keyword, index) => (
        <li
          key={`${keyword}-${index}`}
          className={`inline-flex items-baseline gap-1.5 border-b border-slate-200 pb-0.5 ${emphasisForRank(index)}`}
        >
          <span className="font-mono text-[9px] font-normal tabular-nums text-slate-400" aria-hidden>
            {String(index + 1).padStart(2, "0")}
          </span>
          <span>{keyword}</span>
        </li>
      ))}
    </ol>
  );
}
