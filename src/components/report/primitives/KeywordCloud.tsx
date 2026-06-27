"use client";

/**
 * R220: extracted from src/app/research/[id]/page.tsx. Sizes each
 * keyword by its position in the user-supplied list (earlier = larger
 * = more important) and colours them deterministically. Pure
 * presentation — no fetches, no state.
 */
export function KeywordCloud({ keywords }: { keywords: string[] }) {
  if (!keywords?.length) return null;

  // Size each keyword by its position (earlier = larger = more important)
  const maxSize = 22;
  const minSize = 12;

  const getSize = (index: number): number => {
    const ratio = 1 - index / Math.min(keywords.length, 15);
    return Math.round(minSize + (maxSize - minSize) * Math.max(0.2, ratio));
  };

  const colors = [
    "#6366f1", "#8b5cf6", "#ec4899", "#f59e0b",
    "#10b981", "#06b6d4", "#3b82f6", "#f43f5e"
  ];

  return (
    <div className="keyword-cloud">
      {keywords.slice(0, 20).map((kw, i) => (
        <span
          key={kw}
          className="keyword-cloud-item"
          style={{
            fontSize: getSize(i) + "px",
            color: colors[i % colors.length],
            opacity: 0.85 - i * 0.02,
          }}
        >
          {kw}
        </span>
      ))}
    </div>
  );
}
