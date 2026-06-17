/**
 * Browser notification system.
 * Shows desktop notifications when long-running research completes.
 */

const PERMISSION_KEY = "launchlens:notif-permission";
const PENDING_KEY = "launchlens:pending-notifs";

export interface PendingNotification {
  runId: string;
  query: string;
  createdAt: number;
}

/**
 * Check if notifications are supported.
 */
export function areNotificationsSupported(): boolean {
  if (typeof window === "undefined") return false;
  return "Notification" in window;
}

/**
 * Get current notification permission state.
 */
export function getNotificationPermission(): NotificationPermission {
  if (!areNotificationsSupported()) return "denied";
  return Notification.permission;
}

/**
 * Request notification permission.
 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (!areNotificationsSupported()) return false;
  
  try {
    const result = await Notification.requestPermission();
    return result === "granted";
  } catch {
    return false;
  }
}

/**
 * Register a pending notification for a running research.
 * Will be shown when the research completes (polling or SSE detects completion).
 */
export function registerPendingNotification(runId: string, query: string): void {
  if (typeof localStorage === "undefined") return;
  
  try {
    const pending: PendingNotification[] = getPendingNotifications();
    // Don't duplicate
    if (pending.some((p) => p.runId === runId)) return;
    
    pending.push({
      runId,
      query,
      createdAt: Date.now(),
    });
    
    localStorage.setItem(PENDING_KEY, JSON.stringify(pending));
  } catch {
    // ignore storage errors
  }
}

/**
 * Get all pending notifications.
 */
export function getPendingNotifications(): PendingNotification[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

/**
 * Remove a pending notification.
 */
export function clearPendingNotification(runId: string): void {
  if (typeof localStorage === "undefined") return;
  try {
    const pending = getPendingNotifications().filter((p) => p.runId !== runId);
    localStorage.setItem(PENDING_KEY, JSON.stringify(pending));
  } catch {
    // ignore
  }
}

/**
 * Show a notification for a completed research.
 */
export function showResearchCompleteNotification(runId: string, query: string): void {
  if (!areNotificationsSupported()) return;
  if (getNotificationPermission() !== "granted") return;
  
  try {
    const notification = new Notification("研究完成", {
      body: query.length > 100 ? query.slice(0, 100) + "..." : query,
      icon: "/favicon.ico",
      badge: "/favicon.ico",
      tag: "research-" + runId,
      requireInteraction: false,
    });
    
    notification.onclick = () => {
      window.focus();
      window.location.href = "/research/" + runId;
      notification.close();
    };
    
    // Auto close after 5 seconds
    setTimeout(() => notification.close(), 5000);
    
    // Clear from pending
    clearPendingNotification(runId);
  } catch {
    // ignore notification errors
  }
}

/**
 * Check pending notifications against actual run status.
 * Call this periodically or when the page loads.
 */
export async function checkPendingNotifications(): Promise<void> {
  const pending = getPendingNotifications();
  if (pending.length === 0) return;
  
  for (const notif of pending) {
    try {
      const res = await fetch("/api/research/runs?limit=1");
      if (!res.ok) continue;
      
      // Just check if we have this run completed
      // We can check the SSE or fetch individually
      const runRes = await fetch("/api/research/" + notif.runId);
      if (runRes.ok) {
        const runData = await runRes.json();
        if (runData.status === "completed" || runData.status === "failed") {
          showResearchCompleteNotification(notif.runId, notif.query);
          clearPendingNotification(notif.runId);
        }
      }
    } catch {
      // ignore
    }
  }
}
