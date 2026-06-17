"use client";

interface VennDiagramProps {
  sets: Array<{
    label: string;
    color: string;
    items: string[];
  }>;
  width?: number;
  height?: number;
}

/**
 * Pure SVG Venn diagram for 2 or 3 sets.
 * Computes intersection sizes and renders proportional circles.
 */
export function VennDiagram({ sets, width = 400, height = 260 }: VennDiagramProps) {
  if (sets.length < 2 || sets.length > 3) {
    return (
      <div style={{ textAlign: "center", padding: 20, color: "#888" }}>
        Venn diagram supports 2-3 sets only
      </div>
    );
  }

  const totalItems = new Set(sets.flatMap((s) => s.items)).size;
  if (totalItems === 0) {
    return (
      <div style={{ textAlign: "center", padding: 20, color: "#888" }}>
        No data to compare
      </div>
    );
  }

  if (sets.length === 2) {
    return <Venn2 sets={sets} width={width} height={height} totalItems={totalItems} />;
  }

  return <Venn3 sets={sets} width={width} height={height} totalItems={totalItems} />;
}

function Venn2({
  sets,
  width,
  height,
  totalItems,
}: {
  sets: Array<{ label: string; color: string; items: string[] }>;
  width: number;
  height: number;
  totalItems: number;
}) {
  const setA = new Set(sets[0].items);
  const setB = new Set(sets[1].items);
  const intersect = new Set([...setA].filter((x) => setB.has(x)));

  // Circle sizes proportional to set size (min 30% of total area)
  const sizeA = Math.max(setA.size, totalItems * 0.3);
  const sizeB = Math.max(setB.size, totalItems * 0.3);
  const radiusA = Math.sqrt(sizeA / Math.PI) * 8;
  const radiusB = Math.sqrt(sizeB / Math.PI) * 8;

  // Overlap proportional to intersection size
  const overlapRatio = totalItems > 0 ? intersect.size / totalItems : 0;
  const centerDistance = (radiusA + radiusB) * (1 - overlapRatio * 0.7);

  const cx1 = width / 2 - centerDistance / 2;
  const cx2 = width / 2 + centerDistance / 2;
  const cy = height / 2;

  return (
    <svg width={width} height={height} className="venn-svg" aria-label="Venn diagram">
      <circle
        cx={cx1}
        cy={cy}
        r={radiusA}
        fill={sets[0].color}
        fillOpacity={0.3}
        stroke={sets[0].color}
        strokeWidth={2}
      />
      <circle
        cx={cx2}
        cy={cy}
        r={radiusB}
        fill={sets[1].color}
        fillOpacity={0.3}
        stroke={sets[1].color}
        strokeWidth={2}
      />
      <text
        x={cx1 - radiusA * 0.3}
        y={cy - 10}
        textAnchor="middle"
        className="venn-label"
        fill={sets[0].color}
        fontWeight={600}
        fontSize={13}
      >
        {sets[0].label}
      </text>
      <text
        x={cx1 - radiusA * 0.3}
        y={cy + 12}
        textAnchor="middle"
        className="venn-count"
        fill={sets[0].color}
        fontSize={11}
      >
        {setA.size - intersect.size} unique
      </text>
      <text
        x={cx2 + radiusB * 0.3}
        y={cy - 10}
        textAnchor="middle"
        className="venn-label"
        fill={sets[1].color}
        fontWeight={600}
        fontSize={13}
      >
        {sets[1].label}
      </text>
      <text
        x={cx2 + radiusB * 0.3}
        y={cy + 12}
        textAnchor="middle"
        className="venn-count"
        fill={sets[1].color}
        fontSize={11}
      >
        {setB.size - intersect.size} unique
      </text>
      <text
        x={width / 2}
        y={cy + 4}
        textAnchor="middle"
        className="venn-intersect"
        fill="#333"
        fontWeight={700}
        fontSize={14}
      >
        {intersect.size} shared
      </text>
    </svg>
  );
}

function Venn3({
  sets,
  width,
  height,
  totalItems,
}: {
  sets: Array<{ label: string; color: string; items: string[] }>;
  width: number;
  height: number;
  totalItems: number;
}) {
  const setA = new Set(sets[0].items);
  const setB = new Set(sets[1].items);
  const setC = new Set(sets[2].items);

  const onlyA = new Set([...setA].filter((x) => !setB.has(x) && !setC.has(x)));
  const onlyB = new Set([...setB].filter((x) => !setA.has(x) && !setC.has(x)));
  const onlyC = new Set([...setC].filter((x) => !setA.has(x) && !setB.has(x)));

  const abOnly = new Set([...setA].filter((x) => setB.has(x) && !setC.has(x)));
  const acOnly = new Set([...setA].filter((x) => setC.has(x) && !setB.has(x)));
  const bcOnly = new Set([...setB].filter((x) => setC.has(x) && !setA.has(x)));
  const abc = new Set([...setA].filter((x) => setB.has(x) && setC.has(x)));

  const maxSize = Math.max(setA.size, setB.size, setC.size, 1);
  const baseRadius = Math.min(width, height) * 0.28;
  const scale = (s: number) => baseRadius * (0.7 + 0.3 * (s / maxSize));

  const rA = scale(setA.size);
  const rB = scale(setB.size);
  const rC = scale(setC.size);

  // Triangle layout
  const centerX = width / 2;
  const centerY = height * 0.52;
  const dist = baseRadius * 1.1;

  const cx1 = centerX - dist * 0.5;
  const cy1 = centerY - dist * 0.5;
  const cx2 = centerX + dist * 0.5;
  const cy2 = centerY - dist * 0.5;
  const cx3 = centerX;
  const cy3 = centerY + dist * 0.55;

  return (
    <svg width={width} height={height} className="venn-svg" aria-label="Venn diagram">
      <circle cx={cx1} cy={cy1} r={rA} fill={sets[0].color} fillOpacity={0.25} stroke={sets[0].color} strokeWidth={2} />
      <circle cx={cx2} cy={cy2} r={rB} fill={sets[1].color} fillOpacity={0.25} stroke={sets[1].color} strokeWidth={2} />
      <circle cx={cx3} cy={cy3} r={rC} fill={sets[2].color} fillOpacity={0.25} stroke={sets[2].color} strokeWidth={2} />

      <text x={cx1} y={cy1 - rA * 0.65} textAnchor="middle" fill={sets[0].color} fontWeight={600} fontSize={12}>
        {sets[0].label}
      </text>
      <text x={cx2} y={cy2 - rB * 0.65} textAnchor="middle" fill={sets[1].color} fontWeight={600} fontSize={12}>
        {sets[1].label}
      </text>
      <text x={cx3} y={cy3 + rC * 0.75} textAnchor="middle" fill={sets[2].color} fontWeight={600} fontSize={12}>
        {sets[2].label}
      </text>

      {/* Counts */}
      <text x={cx1 - rA * 0.3} y={cy1 - rA * 0.15} textAnchor="middle" fill="#333" fontSize={11} fontWeight={600}>
        {onlyA.size}
      </text>
      <text x={cx2 + rA * 0.3} y={cy2 - rB * 0.15} textAnchor="middle" fill="#333" fontSize={11} fontWeight={600}>
        {onlyB.size}
      </text>
      <text x={cx3} y={cy3 + rC * 0.3} textAnchor="middle" fill="#333" fontSize={11} fontWeight={600}>
        {onlyC.size}
      </text>
      <text x={centerX} y={centerY - dist * 0.3} textAnchor="middle" fill="#333" fontSize={10} fontWeight={600}>
        {abOnly.size}
      </text>
      <text x={centerX} y={centerY + dist * 0.05} textAnchor="middle" fill="#222" fontSize={13} fontWeight={700}>
        {abc.size}
      </text>
      <text x={cx1 + rA * 0.15} y={cy1 + rA * 0.4} textAnchor="middle" fill="#333" fontSize={10} fontWeight={600}>
        {acOnly.size}
      </text>
      <text x={cx2 - rB * 0.15} y={cy2 + rB * 0.4} textAnchor="middle" fill="#333" fontSize={10} fontWeight={600}>
        {bcOnly.size}
      </text>
    </svg>
  );
}

export default VennDiagram;