"use client";

import { useEffect } from "react";

// Lightweight web-vitals reporter: logs LCP, CLS, INP-ish to the console
// in development and posts to /api/vitals if available in production.
export function WebVitalsReporter() {
  useEffect(() => {
    if (typeof window === "undefined" || typeof PerformanceObserver === "undefined") return;

    const send = (name: string, value: number, extra: Record<string, unknown> = {}) => {
      const payload = { name, value, ...extra, ts: Date.now() };
      if (process.env.NODE_ENV !== "production") {
        // eslint-disable-next-line no-console
        console.info("[vitals]", payload);
      }
      try {
        const blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
        if ("sendBeacon" in navigator) {
          navigator.sendBeacon("/api/vitals", blob);
        }
      } catch {
        // best-effort only
      }
    };

    const observers: PerformanceObserver[] = [];
    try {
      const lcp = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const last = entries[entries.length - 1];
        if (last) send("LCP", last.startTime);
      });
      lcp.observe({ type: "largest-contentful-paint", buffered: true });
      observers.push(lcp);
    } catch {}

    let cls = 0;
    try {
      const layoutShift = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const e = entry as PerformanceEntry & { value?: number; hadRecentInput?: boolean };
          if (!e.hadRecentInput && typeof e.value === "number") cls += e.value;
        }
      });
      layoutShift.observe({ type: "layout-shift", buffered: true });
      observers.push(layoutShift);
    } catch {}

    try {
      const fid = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const e = entry as PerformanceEntry & { processingStart?: number };
          if (typeof e.processingStart === "number") {
            send("INP", e.processingStart - entry.startTime, { name: entry.name });
          }
        }
      });
      fid.observe({ type: "first-input", buffered: true });
      observers.push(fid);
    } catch {}

    const onHide = () => send("CLS", cls);
    document.addEventListener("visibilitychange", onHide, { once: true });

    return () => {
      observers.forEach((o) => o.disconnect());
      document.removeEventListener("visibilitychange", onHide);
    };
  }, []);

  return null;
}
