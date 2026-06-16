// Auth audit alerting system.
// Monitors the auth audit log for suspicious patterns and triggers alerts.
//
// Supported detection rules:
//   - auth_failed burst: N failures in a time window (default: 10 in 60s)
//   - csrf_failed burst: N failures in a time window (default: 5 in 60s)
//   - rate_limited burst: N rate-limited events in a window (default: 20 in 60s)
//   - New admin token creation (always alerts, high severity)
//
// Alert delivery:
//   - In-memory alert buffer (queryable via admin API)
//   - Webhook endpoint (configured via LAUNCHLENS_ALERT_WEBHOOK_URL)
//
// Configuration via env vars:
//   LAUNCHLENS_ALERT_WEBHOOK_URL  — webhook URL to POST alerts to
//   LAUNCHLENS_ALERT_AUTH_FAILED_THRESHOLD  — auth failures per window (default 10)
//   LAUNCHLENS_ALERT_CSRF_FAILED_THRESHOLD  — CSRF failures per window (default 5)
//   LAUNCHLENS_ALERT_WINDOW_SECONDS  — detection window in seconds (default 60)

import { recordAuthAudit, onAuthAuditEvent, AuthAuditEvent } from "./auth-audit";

export interface AlertEvent {
  id: string;
  type: "auth_failed_burst" | "csrf_failed_burst" | "rate_limited_burst" | "admin_token_created";
  severity: "info" | "warning" | "critical";
  message: string;
  count: number;
  windowSeconds: number;
  ipHash?: string;
  tokenHash?: string;
  details: Record<string, unknown>;
  ts: number;
}

const MAX_ALERTS = 50;
const alerts: AlertEvent[] = [];

// Configuration
const WINDOW_MS = (parseInt(process.env.LAUNCHLENS_ALERT_WINDOW_SECONDS || "60", 10) || 60) * 1000;
const AUTH_FAILED_THRESHOLD = parseInt(process.env.LAUNCHLENS_ALERT_AUTH_FAILED_THRESHOLD || "10", 10) || 10;
const CSRF_FAILED_THRESHOLD = parseInt(process.env.LAUNCHLENS_ALERT_CSRF_FAILED_THRESHOLD || "5", 10) || 5;
const RATE_LIMITED_THRESHOLD = parseInt(process.env.LAUNCHLENS_ALERT_RATE_LIMITED_THRESHOLD || "20", 10) || 20;
const WEBHOOK_URL = process.env.LAUNCHLENS_ALERT_WEBHOOK_URL || "";

// Per-ipHash event tracking for sliding window detection
interface EventTracker {
  events: number[]; // timestamps
  lastAlertTs: number;
}

const trackers = new Map<string, EventTracker>(); // key = `${type}:${ipHash}`

function getTracker(type: string, ipHash: string): EventTracker {
  const key = `${type}:${ipHash}`;
  let tracker = trackers.get(key);
  if (!tracker) {
    tracker = { events: [], lastAlertTs: 0 };
    trackers.set(key, tracker);
  }
  return tracker;
}

function checkBurst(
  type: string,
  ipHash: string,
  threshold: number,
  windowMs: number,
): { burst: boolean; count: number } {
  const tracker = getTracker(type, ipHash);
  const now = Date.now();
  const windowStart = now - windowMs;

  // Add current event
  tracker.events.push(now);

  // Remove events outside the window
  tracker.events = tracker.events.filter((t) => t > windowStart);

  // Cooldown: don't alert more than once per window
  const inCooldown = now - tracker.lastAlertTs < windowMs;

  if (tracker.events.length >= threshold && !inCooldown) {
    tracker.lastAlertTs = now;
    return { burst: true, count: tracker.events.length };
  }

  return { burst: false, count: tracker.events.length };
}

function addAlert(alert: Omit<AlertEvent, "id" | "ts">) {
  const fullAlert: AlertEvent = {
    ...alert,
    id: Math.random().toString(36).slice(2, 10),
    ts: Date.now(),
  };

  alerts.unshift(fullAlert);
  if (alerts.length > MAX_ALERTS) {
    alerts.length = MAX_ALERTS;
  }

  // Send webhook if configured
  if (WEBHOOK_URL) {
    sendWebhook(fullAlert).catch(() => {
      // Silently ignore webhook failures
    });
  }
}

async function sendWebhook(alert: AlertEvent) {
  if (!WEBHOOK_URL) return;

  try {
    await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "LaunchLens-Security-Alert/1.0",
      },
      body: JSON.stringify({
        alert: {
          type: alert.type,
          severity: alert.severity,
          message: alert.message,
          count: alert.count,
          window_seconds: alert.windowSeconds,
          ip_hash: alert.ipHash,
          token_hash: alert.tokenHash,
          details: alert.details,
          timestamp: new Date(alert.ts).toISOString(),
        },
        source: "launchlens-research-studio",
      }),
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    // Webhook delivery is best-effort
  }
}

// Listen to auth audit events and run detection
onAuthAuditEvent((event: AuthAuditEvent) => {
  const ipHash = event.ipHash || "unknown";

  switch (event.type) {
    case "auth_failed": {
      const { burst, count } = checkBurst("auth_failed", ipHash, AUTH_FAILED_THRESHOLD, WINDOW_MS);
      if (burst) {
        addAlert({
          type: "auth_failed_burst",
          severity: "warning",
          message: `Burst of ${count} auth failures from same IP in ${Math.round(WINDOW_MS / 1000)}s`,
          count,
          windowSeconds: Math.round(WINDOW_MS / 1000),
          ipHash,
          details: { detail: event.detail, userAgent: event.userAgent },
        });
      }
      break;
    }

    case "csrf_failed": {
      const { burst, count } = checkBurst("csrf_failed", ipHash, CSRF_FAILED_THRESHOLD, WINDOW_MS);
      if (burst) {
        addAlert({
          type: "csrf_failed_burst",
          severity: "warning",
          message: `Burst of ${count} CSRF failures from same IP in ${Math.round(WINDOW_MS / 1000)}s`,
          count,
          windowSeconds: Math.round(WINDOW_MS / 1000),
          ipHash,
          details: { detail: event.detail, userAgent: event.userAgent },
        });
      }
      break;
    }

    case "rate_limited": {
      const { burst, count } = checkBurst("rate_limited", ipHash, RATE_LIMITED_THRESHOLD, WINDOW_MS);
      if (burst) {
        addAlert({
          type: "rate_limited_burst",
          severity: "info",
          message: `Burst of ${count} rate-limited requests from same IP in ${Math.round(WINDOW_MS / 1000)}s`,
          count,
          windowSeconds: Math.round(WINDOW_MS / 1000),
          ipHash,
          details: { detail: event.detail },
        });
      }
      break;
    }

    case "token_created": {
      if (event.scope === "admin") {
        addAlert({
          type: "admin_token_created",
          severity: "critical",
          message: "New admin token created",
          count: 1,
          windowSeconds: 0,
          tokenHash: event.tokenHash,
          ipHash,
          details: { label: event.detail },
        });
      }
      break;
    }
  }
});

/** Get recent alerts (admin use only). */
export function getAlerts(limit: number = 20): AlertEvent[] {
  const n = Math.min(limit, alerts.length, MAX_ALERTS);
  return alerts.slice(0, n);
}

/** Clear all alerts (for testing / reset). */
export function clearAlerts() {
  alerts.length = 0;
  trackers.clear();
}

/** Current alert configuration (for diagnostics). */
export const alertConfig = {
  windowSeconds: Math.round(WINDOW_MS / 1000),
  authFailedThreshold: AUTH_FAILED_THRESHOLD,
  csrfFailedThreshold: CSRF_FAILED_THRESHOLD,
  rateLimitedThreshold: RATE_LIMITED_THRESHOLD,
  webhookEnabled: !!WEBHOOK_URL,
  maxAlerts: MAX_ALERTS,
};
