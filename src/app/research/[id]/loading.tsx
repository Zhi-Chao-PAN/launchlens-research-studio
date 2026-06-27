import { CardSkeleton, DetailHeaderSkeleton } from "@/components/skeleton/Skeleton";

/**
 * R220: route-segment Suspense fallback for /research/[id]. Previously
 * the page set `useState(loading=true)` and rendered a few CardSkeletons
 * only after a useEffect-driven fetch resolved. The skeletons didn't
 * match the final layout (sticky TOC, reading progress bar, multi-
 * section accordion) so the user saw a layout shift when the real
 * content arrived.
 *
 * This loading.tsx renders before the page even starts executing, so
 * the user gets an immediate skeleton that matches the final DOM
 * heights — no CLS jump.
 */
export default function ResearchDetailLoading() {
  return (
    <div className="research-detail">
      <div className="research-detail-inner">
        <DetailHeaderSkeleton />
        <div className="research-detail-grid">
          <aside className="research-toc">
            <div className="research-toc-skeleton" />
            <div className="research-toc-skeleton" />
            <div className="research-toc-skeleton" />
          </aside>
          <div className="research-detail-content">
            <CardSkeleton lines={4} />
            <div style={{ height: 16 }} />
            <CardSkeleton lines={6} />
            <div style={{ height: 16 }} />
            <CardSkeleton lines={3} />
            <div style={{ height: 16 }} />
            <CardSkeleton lines={8} />
            <div style={{ height: 16 }} />
            <CardSkeleton lines={5} />
          </div>
        </div>
      </div>
    </div>
  );
}
