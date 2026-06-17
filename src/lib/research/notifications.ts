import { addNotification } from "./notification-store";
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
/**
 * Show a notification for a completed research.
 * Also dispatches an in-app notification event.
 */
export function showResearchCompleteNotification(runId: string, query: string, status: "completed" | "failed" = "completed"): void {
  // Dispatch in-app notification event first
  if (typeof window !== "undefined") {
    try {
      // addNotification is imported at the top of the file
      addNotification({
        type: status === "completed" ? "research-complete" : "research-failed",
        title: status === "completed" ? "Research complete" : "Research failed",
        body: query.length > 120 ? query.slice(0, 120) + "..." : query,
        link: "/research/" + runId,
        metadata: { runId },
      });
      window.dispatchEvent(new CustomEvent("launchlens-notification"));
    } catch {
      // ignore if store module not available
    }
  }

  // Desktop notification
  if (!areNotificationsSupported()) return;
  if (getNotificationPermission() !== "granted") return;
  
  try {
    const notification = new Notification(status === "completed" ? "Research complete" : "Research failed", {
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
/**
 * Check pending notifications against actual run status.
 * Call this periodically or when the page loads.
 */
export async function checkPendingNotifications(): Promise<void> {
  const pending = getPendingNotifications();
  if (pending.length === 0) return;
  
  for (const notif of pending) {
    try {
      const runRes = await fetch("/api/research/" + notif.runId);
      if (runRes.ok) {
        const runData = await runRes.json();
        if (runData.status === "completed" || runData.status === "failed") {
          showResearchCompleteNotification(notif.runId, notif.query, runData.status);
          clearPendingNotification(notif.runId);
        }
      }
    } catch {
      // ignore
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Notification preferences                                           */
/* ------------------------------------------------------------------ */

const PREFS_KEY = "launchlens:notif-prefs";

export interface NotificationPrefs {
  desktopEnabled: boolean;
  soundEnabled: boolean;
  inAppEnabled: boolean;
  doNotDisturb: boolean;
  dndStartHour?: number; // 0-23
  dndEndHour?: number;
  notifyOnComplete: boolean;
  notifyOnFailure: boolean;
  notifyOnStar: boolean;
}

const DEFAULT_PREFS: NotificationPrefs = {
  desktopEnabled: true,
  soundEnabled: false,
  inAppEnabled: true,
  doNotDisturb: false,
  notifyOnComplete: true,
  notifyOnFailure: true,
  notifyOnStar: false,
};

export function getNotificationPrefs(): NotificationPrefs {
  if (typeof localStorage === "undefined") return { ...DEFAULT_PREFS };
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    return { ...DEFAULT_PREFS, ...JSON.parse(raw) };
  } catch { return { ...DEFAULT_PREFS }; }
}

export function updateNotificationPrefs(prefs: Partial<NotificationPrefs>): NotificationPrefs {
  const merged = { ...getNotificationPrefs(), ...prefs };
  if (typeof localStorage !== "undefined") {
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(merged)); } catch {}
  }
  return merged;
}

export function isInDNDWindow(): boolean {
  const prefs = getNotificationPrefs();
  if (!prefs.doNotDisturb || prefs.dndStartHour === undefined || prefs.dndEndHour === undefined) return false;
  const hour = new Date().getHours();
  if (prefs.dndStartHour <= prefs.dndEndHour) {
    return hour >= prefs.dndStartHour && hour < prefs.dndEndHour;
  } else {
    return hour >= prefs.dndStartHour || hour < prefs.dndEndHour;
  }
}

/* ------------------------------------------------------------------ */
/*  Notification history                                               */
/* ------------------------------------------------------------------ */

const HISTORY_KEY = "launchlens:notif-history";
const MAX_HISTORY = 100;

export interface HistoryEntry {
  id: string;
  title: string;
  body: string;
  type: string;
  runId?: string;
  seen: boolean;
  createdAt: string;
}

export function getNotificationHistory(): HistoryEntry[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export function recordNotificationHistory(entry: Omit<HistoryEntry, "id" | "seen" | "createdAt">): void {
  if (typeof localStorage === "undefined") return;
  try {
    const history = getNotificationHistory();
    history.unshift({
      id: "notif_" + Date.now().toString(36),
      seen: false,
      createdAt: new Date().toISOString(),
      ...entry,
    });
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, MAX_HISTORY)));
  } catch {}
}

export function markNotificationSeen(id: string): void {
  const history = getNotificationHistory();
  const entry = history.find((e) => e.id === id);
  if (entry) entry.seen = true;
  if (typeof localStorage !== "undefined") {
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(history)); } catch {}
  }
}

export function markAllNotificationsSeen(): number {
  const history = getNotificationHistory();
  let count = 0;
  for (const e of history) { if (!e.seen) { e.seen = true; count++; } }
  if (typeof localStorage !== "undefined") {
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(history)); } catch {}
  }
  return count;
}

export function getUnreadNotificationCount(): number {
  return getNotificationHistory().filter((e) => !e.seen).length;
}

export function clearNotificationHistory(): void {
  if (typeof localStorage !== "undefined") {
    localStorage.removeItem(HISTORY_KEY);
  }
}

/* ------------------------------------------------------------------ */
/*  Bulk operations                                                    */
/* ------------------------------------------------------------------ */

export function clearAllPendingNotifications(): number {
  const pending = getPendingNotifications();
  if (typeof localStorage !== "undefined") {
    try { localStorage.setItem(PENDING_KEY, "[]"); } catch {}
  }
  return pending.length;
}

export function getPendingCount(): number {
  return getPendingNotifications().length;
}

export function removeStalePendingNotifications(maxAgeMs: number = 24 * 60 * 60 * 1000): number {
  const pending = getPendingNotifications();
  const now = Date.now();
  const fresh = pending.filter((p) => now - p.createdAt < maxAgeMs);
  const removed = pending.length - fresh.length;
  if (removed > 0 && typeof localStorage !== "undefined") {
    try { localStorage.setItem(PENDING_KEY, JSON.stringify(fresh)); } catch {}
  }
  return removed;
}
