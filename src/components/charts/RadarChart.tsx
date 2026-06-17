"use client";

interface RadarDataPoint {
  label: string;
  value: number;
  color?: string;
}

interface RadarChartProps {
  data: RadarDataPoint[];
  size?: number;
  levels?: number;
  showLabels?: boolean;
  fillColor?: string;
  strokeColor?: string;
}

export function RadarChart({
  data,
  size = 220,
  levels = 5,
  showLabels = true,
  fillColor = "rgba(99, 102, 241, 0.25)",
  strokeColor = "#6366f1",
}: RadarChartProps) {
  const cx = size / 2;
  const cy = size / 2;
  const radius = (size / 2) - (showLabels ? 40 : 10);
  const angleStep = (Math.PI * 2) / data.length;
  const startAngle = -Math.PI / 2;

  const getPoint = (index: number, value: number) => {
    const angle = startAngle + index * angleStep;
    const r = (value / 100) * radius;
    return {
      x: cx + r * Math.cos(angle),
      y: cy + r * Math.sin(angle),
    };
  };

  const gridPolygons = Array.from({ length: levels }, (_, i) => {
    const level = i + 1;
    const r = (level / levels) * radius;
    const points = data.map((__, idx) => {
      const angle = startAngle + idx * angleStep;
      return `${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`;
    }).join(" ");
    return points;
  });

  const dataPoints = data.map((d, i) => {
    const pt = getPoint(i, d.value);
    return `${pt.x},${pt.y}`;
  }).join(" ");

  const labelRadius = radius + 20;
  const labels = data.map((d, i) => {
    const angle = startAngle + i * angleStep;
    const x = cx + labelRadius * Math.cos(angle);
    const y = cy + labelRadius * Math.sin(angle);
    let textAnchor = "middle";
    if (Math.cos(angle) > 0.3) textAnchor = "start";
    else if (Math.cos(angle) < -0.3) textAnchor = "end";
    let dy = "0.35em";
    if (Math.sin(angle) > 0.5) dy = "1em";
    else if (Math.sin(angle) < -0.5) dy = "-0.5em";
    return { x, y, label: d.label, textAnchor, dy, value: d.value };
  });

  return (
    <div className="radar-chart-container">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="radar-chart-svg"
      >
        {gridPolygons.map((points, i) => (
          <polygon
            key={i}
            points={points}
            fill="none"
            stroke="currentColor"
            strokeWidth={1}
            className="radar-grid"
            opacity={0.15 + i * 0.08}
          />
        ))}

        {data.map((__, i) => {
          const angle = startAngle + i * angleStep;
          return (
            <line
              key={i}
              x1={cx}
              y1={cy}
              x2={cx + radius * Math.cos(angle)}
              y2={cy + radius * Math.sin(angle)}
              stroke="currentColor"
              strokeWidth={1}
              className="radar-axis"
              opacity={0.1}
            />
          );
        })}

        <polygon
          points={dataPoints}
          fill={fillColor}
          stroke={strokeColor}
          strokeWidth={2}
          className="radar-data-polygon"
        />

        {data.map((d, i) => {
          const pt = getPoint(i, d.value);
          return (
            <circle
              key={i}
              cx={pt.x}
              cy={pt.y}
              r={4}
              fill={strokeColor}
              stroke="white"
              strokeWidth={2}
              className="radar-data-point"
            />
          );
        })}

        {showLabels && labels.map((l, i) => (
          <text
            key={i}
            x={l.x}
            y={l.y}
            textAnchor={l.textAnchor}
            dominantBaseline="middle"
            className="radar-label"
            fontSize={11}
            fill="currentColor"
          >
            <tspan className="radar-label-name">{l.label}</tspan>
            <tspan x={l.x} dy="14" className="radar-label-value" fontSize={10} fontWeight={600}>
              {l.value}
            </tspan>
          </text>
        ))}
      </svg>
    </div>
  );
}
