"use client";

// Reusable visual meters for ratings (0-5 or 0-100)

interface MeterProps {
  value: number;
  max?: number;
  label?: string;
  color?: "emerald" | "amber" | "rose" | "indigo" | "violet" | "sky";
  size?: "sm" | "md" | "lg";
  showValue?: boolean;
}

const COLOR_BG: Record<NonNullable<MeterProps["color"]>, string> = {
  emerald: "bg-emerald-500",
  amber: "bg-amber-500",
  rose: "bg-rose-500",
  indigo: "bg-indigo-500",
  violet: "bg-violet-500",
  sky: "bg-sky-500",
};

export function Meter({ value, max = 5, label, color = "emerald", size = "sm", showValue = true }: MeterProps) {
  // R214: defend against non-finite inputs (NaN, undefined cast to number)
  // so the bar width CSS never collapses to "NaN%". Math.max/min already
  // coerces undefined to NaN here, so the extra Number.isFinite gate is
  // necessary.
  const safe = typeof value === "number" && Number.isFinite(value) ? value : 0;
  const pct = Math.max(0, Math.min(100, (safe / max) * 100));
  const heights = { sm: "h-1.5", md: "h-2", lg: "h-3" };

  return (
    <div className="flex items-center gap-2 flex-1 min-w-0">
      {label && <span className="text-xs text-slate-500 flex-shrink-0 w-16 truncate">{label}</span>}
      <div className={`flex-1 bg-slate-200 rounded-full overflow-hidden ${heights[size]}`}>
        <div
          className={`${COLOR_BG[color]} ${heights[size]} rounded-full transition-all duration-700`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {showValue && (
        <span className="text-xs font-semibold text-slate-700 flex-shrink-0 w-8 text-right font-mono">
          {typeof value === "number" ? value.toFixed(max > 10 ? 0 : 1) : "—"}
        </span>
      )}
    </div>
  );
}

interface StarsProps {
  value: number;
  max?: number;
  color?: string;
}

export function Stars({ value, max = 5, color = "text-amber-400" }: StarsProps) {
  return (
    <span className="inline-flex">
      {Array.from({ length: max }, (_, i) => (
        <span key={i} className={i < Math.round(value) ? color : "text-slate-200"}>
          ★
        </span>
      ))}
    </span>
  );
}

interface DonutProps {
  value: number;
  label: string;
  color: string;
  size?: number;
}

export function Donut({ value, label, color, size = 96 }: DonutProps) {
  const stroke = 8;
  const radius = (size - stroke) / 2;
  const circ = 2 * Math.PI * radius;
  // R214: SynthesisReport passes opportunityScore / riskScore directly into
  // Donut. The normalizer clamps to 0-100, but if a future provider bypasses
  // normalization (mock variants, persona mutations, etc.) we still don't
  // want a NaN donut centre. Coerce to finite and clamp here.
  const safe = typeof value === "number" && Number.isFinite(value) ? value : 0;
  const clamped = Math.max(0, Math.min(100, safe));
  const offset = circ - (clamped / 100) * circ;

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="#e2e8f0"
            strokeWidth={stroke}
            fill="none"
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={color}
            strokeWidth={stroke}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={circ}
            strokeDashoffset={offset}
            className="transition-all duration-1000"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-xl font-bold text-slate-800">{Math.round(clamped)}</span>
        </div>
      </div>
      <p className="text-xs text-slate-500 mt-1 font-medium">{label}</p>
    </div>
  );
}
