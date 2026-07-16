"use client";

import {
  Analytics,
  type BeforeSendEvent,
} from "@vercel/analytics/next";

const PUBLIC_SHARE_PATH = /^\/share(?:\/|$)/;

/**
 * Public report URLs contain a bearer capability. Repository view counters
 * already provide aggregate usage, so analytics events from these pages are
 * dropped rather than allowing the capability into a third-party dashboard.
 */
export function filterSensitiveAnalyticsEvent(
  event: BeforeSendEvent,
): BeforeSendEvent | null {
  try {
    const url = new URL(event.url, "https://launchlens.invalid");
    return PUBLIC_SHARE_PATH.test(url.pathname) ? null : event;
  } catch {
    // A malformed URL is not useful telemetry and may contain unstructured
    // sensitive data, so fail closed.
    return null;
  }
}

export function PrivacySafeAnalytics() {
  return <Analytics beforeSend={filterSensitiveAnalyticsEvent} />;
}
