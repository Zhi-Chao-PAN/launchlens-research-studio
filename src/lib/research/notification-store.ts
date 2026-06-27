/**
 * In-app notification store.
 * Persists notification history in localStorage.
 */

const STORAGE_KEY = "launchlens:notifications";
const MAX_NOTIFICATIONS = 50;

export type NotificationType =
  | "research-complete"
  | "research-failed"
  | "batch-complete"
  | "schedule-missed"
  | "system";

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  read: boolean;
  createdAt: number;
  link?: string;
  metadata?: Record<string, string>;
}

function readAll(): AppNotification[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function writeAll(notifications: AppNotification[]): void {
  if (typeof localStorage === "undefined") return;
  try {
    const trimmed = notifications.slice(0, MAX_NOTIFICATIONS);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    // ignore storage errors
  }
}

/**
 * Get all notifications, newest first.
 */
export function getNotifications(): AppNotification[] {
  return readAll().sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * Get count of unread notifications.
 */
export function getUnreadCount(): number {
  return readAll().filter((n) => !n.read).length;
}

/**
 * Add a new notification.
 */
export function addNotification(
  notification: Omit<AppNotification, "id" | "read" | "createdAt"> & {
    id?: string;
    read?: boolean;
    createdAt?: number;
  }
): AppNotification {
  const all = readAll();
  const newNotif: AppNotification = {
    id: notification.id ?? "notif-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8),
    type: notification.type,
    title: notification.title,
    body: notification.body,
    read: notification.read ?? false,
    createdAt: notification.createdAt ?? Date.now(),
    link: notification.link,
    metadata: notification.metadata,
  };

  all.unshift(newNotif);
  writeAll(all);
  return newNotif;
}

/**
 * Mark a notification as read.
 */
export function markRead(id: string): void {
  const all = readAll();
  const notif = all.find((n) => n.id === id);
  if (notif) {
    notif.read = true;
    writeAll(all);
  }
}

/**
 * Mark all notifications as read.
 */
export function markAllRead(): void {
  const all = readAll();
  all.forEach((n) => (n.read = true));
  writeAll(all);
}

/**
 * Clear all notifications.
 */
export function clearAllNotifications(): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

/**
 * Dismiss (remove) a single notification.
 */
export function dismissNotification(id: string): void {
  const all = readAll().filter((n) => n.id !== id);
  writeAll(all);
}

/* ------------------------------------------------------------------ */
/*  Pure notification helpers (round 160)                            */
/* ------------------------------------------------------------------ */

export interface NotificationSummary {
  total: number;
  unread: number;
  byType: Record<NotificationType, number>;
  oldestAgeMs: number;
  newestAgeMs: number;
  hasErrors: boolean;
}

export function summarizeNotifications(notifications: AppNotification[], nowMs: number = Date.now()): NotificationSummary {
  const byType: Record<NotificationType, number> = {
    "research-complete": 0, "research-failed": 0, "batch-complete": 0,
    "schedule-missed": 0, "system": 0,
  };
  let unread = 0, oldest = Infinity, newest = -Infinity;
  for (const n of notifications) {
    byType[n.type] = (byType[n.type] || 0) + 1;
    if (!n.read) unread++;
    if (n.createdAt < oldest) oldest = n.createdAt;
    if (n.createdAt > newest) newest = n.createdAt;
  }
  return {
    total: notifications.length,
    unread,
    byType,
    oldestAgeMs: oldest < Infinity ? Math.max(0, nowMs - oldest) : 0,
    newestAgeMs: newest > -Infinity ? Math.max(0, nowMs - newest) : 0,
    hasErrors: byType["research-failed"] > 0 || byType["schedule-missed"] > 0,
  };
}

export type NotificationHealth = "ok" | "unread" | "has-errors" | "stale-unread";
const STALE_UNREAD_MS = 24 * 60 * 60 * 1000;

export function getNotificationHealth(summary: NotificationSummary): NotificationHealth {
  if (summary.total === 0) return "ok";
  if (summary.hasErrors) return "has-errors";
  if (summary.unread === 0) return "ok";
  if (summary.oldestAgeMs > STALE_UNREAD_MS) return "stale-unread";
  return "unread";
}

/** Validate notification shape (defensive against localStorage corruption). */
export function isValidNotification(v: unknown): v is AppNotification {
  if (!v || typeof v !== "object") return false;
  const n = v as Record<string, unknown>;
  if (typeof n.id !== "string" || !n.id) return false;
  if (typeof n.type !== "string") return false;
  if (typeof n.title !== "string") return false;
  if (typeof n.body !== "string") return false;
  if (typeof n.read !== "boolean") return false;
  if (typeof n.createdAt !== "number") return false;
  return true;
}

/** Filter out invalid entries and sort newest first. */
export function sanitizeNotifications(entries: unknown[]): AppNotification[] {
  return entries
    .filter(isValidNotification)
    .sort((a, b) => b.createdAt - a.createdAt);
}

/** Filter notifications by type, read state, or search term. */
export function filterNotifications(
  notifications: AppNotification[],
  opts: { type?: NotificationType; read?: boolean; search?: string } = {}
): AppNotification[] {
  let out = notifications.slice();
  if (opts.type !== undefined) out = out.filter((n) => n.type === opts.type);
  if (opts.read !== undefined) out = out.filter((n) => n.read === opts.read);
  const q = (opts.search || "").trim().toLowerCase();
  if (q) out = out.filter((n) => n.title.toLowerCase().includes(q) || n.body.toLowerCase().includes(q));
  return out;
}

/** Export notifications to CSV. */
export function notificationsToCsv(notifications: AppNotification[]): string {
  const header = "id,type,title,body,read,createdAt,link";
  const rows = notifications.map((n) => [
    n.id, n.type, JSON.stringify(n.title), JSON.stringify(n.body),
    n.read ? 1 : 0, n.createdAt, n.link ?? "",
  ].join(","));
  return [header, ...rows].join("\n");
}

/** Deep structural equality. */
export function notificationsEqual(a: AppNotification, b: AppNotification): boolean {
  if (a.id !== b.id || a.type !== b.type) return false;
  if (a.title !== b.title || a.body !== b.body) return false;
  if (a.read !== b.read || a.createdAt !== b.createdAt) return false;
  if ((a.link || "") !== (b.link || "")) return false;
  const ak = Object.keys(a.metadata || {}).sort().join(",");
  const bk = Object.keys(b.metadata || {}).sort().join(",");
  if (ak !== bk) return false;
  for (const k of a.metadata ? Object.keys(a.metadata) : []) {
    const am = a.metadata as Record<string, unknown>;
    const bm = b.metadata as Record<string, unknown>;
    if (am[k] !== bm[k]) return false;
  }
  return true;
}

/** Build a notification object without touching localStorage (pure factory for tests/SSR). */
export function buildNotification(
  type: NotificationType,
  title: string,
  body: string,
  extras: Partial<AppNotification> = {},
  nowMs: number = Date.now(),
): AppNotification {
  return {
    id: extras.id ?? "notif-" + nowMs.toString(36),
    type,
    title: title.trim() || "Notification",
    body: body.trim(),
    read: extras.read ?? false,
    createdAt: extras.createdAt ?? nowMs,
    link: extras.link,
    metadata: extras.metadata,
  };
}
