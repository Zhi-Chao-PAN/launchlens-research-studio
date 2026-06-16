// Performance helpers used to stabilize re-renders.
// Bucketing progress to a small set of values lets memoized agent cards
// skip re-renders during the high-frequency streaming updates.
export const PROGRESS_BUCKETS = [0, 10, 25, 40, 55, 70, 85, 95, 100] as const;
export type ProgressBucket = typeof PROGRESS_BUCKETS[number];

export function bucketProgress(p: number): ProgressBucket {
  if (Number.isNaN(p)) return 0 as ProgressBucket;
  if (p === Infinity) return 100 as ProgressBucket;
  if (p === -Infinity) return 0 as ProgressBucket;
  const clamped = Math.max(0, Math.min(100, p));
  let best: ProgressBucket = PROGRESS_BUCKETS[0];
  let bestDist = Math.abs(PROGRESS_BUCKETS[0] - clamped);
  for (const b of PROGRESS_BUCKETS) {
    const d = Math.abs(b - clamped);
    if (d < bestDist) {
      best = b;
      bestDist = d;
    }
  }
  return best;
}

export function debounceRaf<TArgs extends unknown[]>(fn: (...a: TArgs) => void) {
  let scheduled = false;
  let lastArgs: TArgs | null = null;
  return (...args: TArgs) => {
    lastArgs = args;
    if (scheduled) return;
    scheduled = true;
    const raf = typeof requestAnimationFrame !== "undefined"
      ? requestAnimationFrame
      : (cb: FrameRequestCallback) => setTimeout(() => cb(performance.now()), 16);
    raf(() => {
      scheduled = false;
      if (lastArgs) fn(...lastArgs);
    });
  };
}
