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
