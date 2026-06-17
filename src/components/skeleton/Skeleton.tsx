"use client";

import "./skeleton.css";

interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  variant?: "text" | "circular" | "rectangular";
  count?: number;
  className?: string;
  style?: React.CSSProperties;
}

export function Skeleton({
  width,
  height,
  variant = "text",
  count = 1,
  className = "",
  style = {},
}: SkeletonProps) {
  const combinedStyle: React.CSSProperties = {
    width: typeof width === "number" ? width + "px" : width,
    height: typeof height === "number" ? height + "px" : height,
    ...style,
  };

  const skeletonClass = "skeleton skeleton-" + variant + " " + className;

  if (count <= 1) {
    return <div className={skeletonClass.trim()} style={combinedStyle} aria-hidden="true" />;
  }

  return (
    <div className="skeleton-line-group" aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className={skeletonClass.trim()}
          style={{
            ...combinedStyle,
            width: width ?? (i === count - 1 ? "60%" : "100%"),
          }}
        />
      ))}
    </div>
  );
}

/**
 * Skeleton for a history list item.
 */
export function HistoryItemSkeleton() {
  return (
    <div className="skeleton-history-item">
      <div className="skeleton-history-item-title">
        <Skeleton variant="text" width="70%" height={18} />
      </div>
      <div className="skeleton-history-item-meta">
        <Skeleton variant="text" width={100} height={12} />
        <Skeleton variant="text" width={80} height={12} />
        <Skeleton variant="text" width={60} height={12} />
      </div>
      <div className="skeleton-history-item-tags">
        <Skeleton variant="text" width={50} height={18} style={{ borderRadius: 999 }} />
        <Skeleton variant="text" width={40} height={18} style={{ borderRadius: 999 }} />
      </div>
    </div>
  );
}

/**
 * Skeleton for a detail page header.
 */
export function DetailHeaderSkeleton() {
  return (
    <div className="skeleton-detail-header">
      <Skeleton variant="text" width="60%" height={32} />
      <div className="skeleton-detail-meta">
        <Skeleton variant="text" width={120} height={14} />
        <Skeleton variant="text" width={100} height={14} />
        <Skeleton variant="text" width={80} height={14} />
      </div>
      <div className="skeleton-detail-scores">
        <Skeleton variant="rectangular" width={120} height={120} />
        <Skeleton variant="rectangular" width={120} height={120} />
      </div>
    </div>
  );
}

/**
 * Skeleton for a card / section.
 */
export function CardSkeleton({ lines = 5 }: { lines?: number }) {
  return (
    <div className="skeleton-card">
      <Skeleton variant="text" width="30%" height={20} />
      <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
        <Skeleton variant="text" count={lines} height={14} />
      </div>
    </div>
  );
}

export default Skeleton;
