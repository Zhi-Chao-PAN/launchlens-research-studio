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
//   LAUNCHLENS_ALERT_WEBHOOK_URL  ? webhook URL to POST alerts to
//   LAUNCHLENS_ALERT_WEBHOOK_SECRET ? HMAC secret for signing webhook payloads
//   LAUNCHLENS_ALERT_AUTH_FAILED_THRESHOLD  ? auth failures per window (default 10)
//   LAUNCHLENS_ALERT_CSRF_FAILED_THRESHOLD  ? CSRF failures per window (default 5)
//   LAUNCHLENS_ALERT_WINDOW_SECONDS  ? detection window in seconds (default 60)

import { createHmac } from "crypto";
import { onAuthAuditEvent, AuthAuditEvent } from "./auth-audit";

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
const WEBHOOK_SECRET = process.env.LAUNCHLENS_ALERT_WEBHOOK_SECRET || "";
const MAX_RETRIES = parseInt(process.env.LAUNCHLENS_ALERT_WEBHOOK_MAX_RETRIES || "5", 10) || 5;
const INITIAL_RETRY_DELAY_MS = parseInt(process.env.LAUNCHLENS_ALERT_WEBHOOK_RETRY_DELAY || "1000", 10) || 1000;
const MAX_RETRY_DELAY_MS = 60000; // cap at 1 minute
const MAX_QUEUE_SIZE = 100; // prevent unbounded growth

// Per-ipHash event tracking for sliding window detection
interface EventTracker {
  events: number[]; // timestamps
  lastAlertTs: number;
}

const trackers = new Map<string, EventTracker>(); // key = `${type}:${ipHash}`

// Webhook retry queue
interface QueuedWebhook {
  alert: AlertEvent;
  retries: number;
  nextAttemptAt: number;
  timeoutId?: ReturnType<typeof setTimeout>;
}

const retryQueue: QueuedWebhook[] = [];
let queueActive = false;

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

  // Send webhook if configured (with retry queue)
  if (WEBHOOK_URL) {
    enqueueWebhook(fullAlert);
  }
}

/**
 * Compute HMAC-SHA256 signature for webhook payload.
 * Format: sha256=<hex>
 * The signature covers the timestamp + "." + body to prevent replay attacks.
 */
function computeWebhookSignature(timestamp: number, body: string): string {
  if (!WEBHOOK_SECRET) return "";
  const hmac = createHmac("sha256", WEBHOOK_SECRET);
  hmac.update(`${timestamp}.${body}`);
  return `sha256=${hmac.digest("hex")}`;
}

/** Compute HMAC-SHA256 webhook signature (exported for testing). */
export function _computeWebhookSignature(timestamp: number, body: string): string {
  return computeWebhookSignature(timestamp, body);
}

async function attemptWebhook(alert: AlertEvent): Promise<boolean> {
  if (!WEBHOOK_URL) return true;

  const timestamp = Math.floor(Date.now() / 1000);
  const payload = JSON.stringify({
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
    sent_at: timestamp,
  });

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": "LaunchLens-Security-Alert/1.0",
    "X-LaunchLens-Timestamp": String(timestamp),
  };

  if (WEBHOOK_SECRET) {
    headers["X-LaunchLens-Signature"] = computeWebhookSignature(timestamp, payload);
  }

  try {
    const res = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers,
      body: payload,
      signal: AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

function computeNextDelay(retryCount: number): number {
  // Exponential backoff: initial * 2^retry, with jitter and max cap
  const base = INITIAL_RETRY_DELAY_MS * Math.pow(2, retryCount);
  const capped = Math.min(base, MAX_RETRY_DELAY_MS);
  // Add 20% jitter to avoid thundering herd
  const jitter = capped * 0.2 * (Math.random() - 0.5);
  return Math.max(100, Math.floor(capped + jitter));
}

function enqueueWebhook(alert: AlertEvent) {
  if (retryQueue.length >= MAX_QUEUE_SIZE) {
    // Drop oldest entry if queue is full
    const oldest = retryQueue.shift();
    if (oldest?.timeoutId) clearTimeout(oldest.timeoutId);
  }

  const entry: QueuedWebhook = {
    alert,
    retries: 0,
    nextAttemptAt: Date.now(),
  };

  retryQueue.push(entry);
  processQueue();
}

function processQueue() {
  if (queueActive) return;
  queueActive = true;

  // Run through the queue, scheduling retries as needed
  function tick() {
    const now = Date.now();

    // Find entries ready for delivery
    for (let i = 0; i < retryQueue.length; i++) {
      const entry = retryQueue[i];
      if (entry.nextAttemptAt <= now && !entry.timeoutId) {
        // Attempt delivery
        attemptWebhook(entry.alert).then((ok) => {
          if (ok) {
            // Success — remove from queue
            const idx = retryQueue.indexOf(entry);
            if (idx >= 0) retryQueue.splice(idx, 1);
          } else {
            entry.retries++;
            if (entry.retries >= MAX_RETRIES) {
              // Dead letter — drop after max retries
              const idx = retryQueue.indexOf(entry);
              if (idx >= 0) retryQueue.splice(idx, 1);
            } else {
              // Schedule next retry
              const delay = computeNextDelay(entry.retries - 1);
              entry.nextAttemptAt = Date.now() + delay;
              entry.timeoutId = setTimeout(() => {
                entry.timeoutId = undefined;
                tick();
              }, delay);
            }
          }
        });
      }
    }

    // If queue is empty, stop processing
    if (retryQueue.length === 0) {
      queueActive = false;
      return;
    }

    // If no pending timeouts, schedule next tick based on earliest next attempt
    const nextAttempt = Math.min(...retryQueue.map((e) => e.nextAttemptAt));
    const delay = Math.max(0, nextAttempt - Date.now());
    if (delay > 0) {
      setTimeout(tick, Math.min(delay, 1000)); // check at least every second
    }
  }

  tick();
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

/** Get webhook queue stats (admin / diagnostics). */
export function getWebhookQueueStats() {
  const pending = retryQueue.filter((e) => e.retries < MAX_RETRIES).length;
  return {
    pending,
    total: retryQueue.length,
    maxRetries: MAX_RETRIES,
    initialDelayMs: INITIAL_RETRY_DELAY_MS,
    maxDelayMs: MAX_RETRY_DELAY_MS,
    maxQueueSize: MAX_QUEUE_SIZE,
  };
}

/** Get recent alerts (admin use only). */
export function getAlerts(limit: number = 20): AlertEvent[] {
  const n = Math.min(limit, alerts.length, MAX_ALERTS);
  return alerts.slice(0, n);
}

/** Reset webhook queue (for testing). */
export function _resetWebhookQueue() {
  for (const entry of retryQueue) {
    if (entry.timeoutId) clearTimeout(entry.timeoutId);
  }
  retryQueue.length = 0;
  queueActive = false;
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
  webhookSecretEnabled: !!WEBHOOK_SECRET,
  webhookMaxRetries: MAX_RETRIES,
  webhookInitialRetryDelayMs: INITIAL_RETRY_DELAY_MS,
  webhookMaxQueueSize: MAX_QUEUE_SIZE,
  maxAlerts: MAX_ALERTS,
};
