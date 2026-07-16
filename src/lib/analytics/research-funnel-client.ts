"use client";

import { fetchWithCsrfStrict } from "@/lib/api/csrf-client";
import type { ResearchFunnelEvent, ResearchFunnelMode } from "@/lib/research/funnel-analytics";

const JOURNEY_STORAGE_KEY = "launchlens.research.journey";

export type ClientResearchFunnelEvent =
  | "workspace_viewed"
  | "deep_selected"
  | "query_filled";

function createJourneyId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
}

export function getResearchJourneyId(): string {
  if (typeof window === "undefined") return "server-no-journey";
  try {
    const existing = window.localStorage.getItem(JOURNEY_STORAGE_KEY);
    if (existing && /^[a-zA-Z0-9._:-]{16,128}$/.test(existing)) return existing;
    const next = createJourneyId();
    window.localStorage.setItem(JOURNEY_STORAGE_KEY, next);
    return next;
  } catch {
    return createJourneyId();
  }
}

/**
 * Record a product-funnel action without sending query text, identity, or
 * provider data. The request is best-effort so telemetry never blocks a run.
 */
export async function trackResearchFunnelEvent(
  event: ClientResearchFunnelEvent,
  options: { mode?: ResearchFunnelMode } = {},
): Promise<void> {
  if (typeof window === "undefined") return;
  const payload: {
    event: ResearchFunnelEvent;
    journeyId: string;
    mode?: ResearchFunnelMode;
  } = { event, journeyId: getResearchJourneyId(), mode: options.mode };
  try {
    await fetchWithCsrfStrict("/api/analytics/funnel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
    });
  } catch {
    // Funnel telemetry is intentionally non-blocking and may be unavailable
    // when Redis is not configured or the user is offline.
  }
}
