"use client";

interface BarDataPoint {
  label: string;
  value: number;
  color?: string;
}

interface BarChartProps {
  data: BarDataPoint[];
  height?: number;
  horizontal?: boolean;
  showValues?: boolean;
  maxValue?: number;
  barColor?: string;
}

export function BarChart({
  data,
  height = 160,
  horizontal = false,
  showValues = true,
  maxValue,
  barColor = "#6366f1",
}: BarChartProps) {
  const max = maxValue ?? Math.max(...data.map((d) => d.value), 1);

  if (horizontal) {
    return (
      <div className="bar-chart bar-chart-horizontal" style={{ height }}>
        {data.map((d, i) => {
          const pct = (d.value / max) * 100;
          return (
            <div key={i} className="bar-row">
              <span className="bar-label" title={d.label}>{d.label}</span>
              <div className="bar-track">
                <div
                  className="bar-fill"
                  style={{ width: pct + "%", background: d.color || barColor }}
                />
              </div>
              {showValues && <span className="bar-value">{d.value}</span>}
            </div>
          );
        })}
      </div>
    );
  }

  // Vertical bar chart
  return (
    <div className="bar-chart bar-chart-vertical" style={{ height }}>
      {data.map((d, i) => {
        const pct = (d.value / max) * 100;
        return (
          <div key={i} className="bar-column">
            {showValues && <span className="bar-value-top">{d.value}</span>}
            <div className="bar-track-vertical">
              <div
                className="bar-fill-vertical"
                style={{ height: pct + "%", background: d.color || barColor }}
              />
            </div>
            <span className="bar-label-bottom">{d.label}</span>
          </div>
        );
      })}
    </div>
  );
}
