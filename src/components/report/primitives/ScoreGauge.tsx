"use client";

export function ScoreGauge({ value, label, color }: { value: number; label: string; color: string }) {
  const radius = 50;
  const circumference = 2 * Math.PI * radius;
  const safeValue = typeof value === "number" && Number.isFinite(value) ? value : 0;
  const clampedValue = Math.max(0, Math.min(100, safeValue));
  const offset = circumference - (clampedValue / 100) * circumference;

  return (
    <figure className="score-gauge flex flex-col items-center">
      <svg
        viewBox="0 0 120 120"
        className="score-gauge-svg h-28 w-28"
        role="img"
        aria-label={`${label}: ${Math.round(clampedValue)} out of 100`}
      >
        <circle
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.12)"
          strokeWidth="7"
        />
        <circle
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="7"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform="rotate(-90 60 60)"
          className="transition-[stroke-dashoffset] duration-500 ease-out"
        />
        <text x="60" y="59" textAnchor="middle" fill={color} fontSize="22" fontWeight="600">
          {Math.round(clampedValue)}
        </text>
        <text x="60" y="77" textAnchor="middle" fill="#64748b" fontSize="10">
          / 100
        </text>
      </svg>
      <figcaption className="score-gauge-label mt-1 text-xs font-medium text-slate-600">{label}</figcaption>
    </figure>
  );
}
