"use client";

/**
 * R220: extracted from src/app/research/[id]/page.tsx. The detail page
 * is a 1500-line client component; pulling the SVG-heavy visual
 * primitives into their own client components lets us next/dynamic
 * the heavy bits with ssr: false so the initial bundle skips the SVG
 * code (which is identical server- and client-side anyway).
 *
 * The signature is unchanged; we just colocate the import in
 * src/components/report/primitives so the detail page can do
 *   const ScoreGauge = dynamic(() => import("@/components/report/primitives/ScoreGauge"), { ssr: false });
 * without touching the implementation.
 */
export function ScoreGauge({ value, label, color }: { value: number; label: string; color: string }) {
  const radius = 50;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (value / 100) * circumference;

  return (
    <div className="score-gauge">
      <svg viewBox="0 0 120 120" className="score-gauge-svg">
        <circle
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth="8"
        />
        <circle
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform="rotate(-90 60 60)"
          style={{ transition: "stroke-dashoffset 0.8s ease-out" }}
        />
        <text
          x="60"
          y="58"
          textAnchor="middle"
          fill={color}
          fontSize="22"
          fontWeight="700"
        >
          {value}
        </text>
        <text
          x="60"
          y="78"
          textAnchor="middle"
          fill="#64748b"
          fontSize="11"
        >
          / 100
        </text>
      </svg>
      <div className="score-gauge-label">{label}</div>
    </div>
  );
}
