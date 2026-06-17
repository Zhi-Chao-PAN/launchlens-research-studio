"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import {
  getNotifications,
  getUnreadCount,
  markRead,
  markAllRead,
  clearAllNotifications,
  dismissNotification,
  type AppNotification,
  type NotificationType,
} from "@/lib/research/notification-store";

function formatNotificationTime(ts: number): string {
  const now = Date.now();
  const diff = now - ts;

  if (diff < 60000) return "just now";
  if (diff < 3600000) return Math.floor(diff / 60000) + "m ago";
  if (diff < 86400000) return Math.floor(diff / 3600000) + "h ago";
  return Math.floor(diff / 86400000) + "d ago";
}

function getNotifIcon(type: NotificationType): string {
  switch (type) {
    case "research-complete":
      return "✅";
    case "research-failed":
      return "❌";
    case "batch-complete":
      return "📦";
    case "schedule-missed":
      return "⏰";
    case "system":
      return "📢";
    default:
      return "🔔";
  }
}

export function NotificationCenter() {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const refresh = useCallback(() => {
    setNotifications(getNotifications());
    setUnreadCount(getUnreadCount());
  }, []);

  // Load on mount
  useEffect(() => {
    void Promise.resolve().then(refresh);
  }, [refresh]);

  // Listen for storage changes (cross-tab)
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key?.includes("notifications")) {
        refresh();
      }
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, [refresh]);

  // Custom event for new notifications
  useEffect(() => {
    const handler = () => refresh();
    window.addEventListener("launchlens-notification", handler);
    return () => window.removeEventListener("launchlens-notification", handler);
  }, [refresh]);

  // Close when clicking outside
  useEffect(() => {
    if (!isOpen) return;

    const handler = (e: MouseEvent) => {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [isOpen]);

  // Mark all as read when opening
  const handleOpen = () => {
    setIsOpen(!isOpen);
    if (!isOpen && unreadCount > 0) {
      // Mark visible ones as read after a short delay
      setTimeout(() => {
        markAllRead();
        setUnreadCount(0);
        setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      }, 500);
    }
  };

  const handleDismiss = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    e.preventDefault();
    dismissNotification(id);
    refresh();
  };

  const handleClearAll = (e: React.MouseEvent) => {
    e.stopPropagation();
    clearAllNotifications();
    refresh();
  };

  const handleMarkAllRead = (e: React.MouseEvent) => {
    e.stopPropagation();
    markAllRead();
    refresh();
  };

  return (
    <div className="notification-center">
      <button
        ref={buttonRef}
        className="notification-bell-btn"
        onClick={handleOpen}
        aria-label="Notifications"
        aria-expanded={isOpen}
      >
        <span className="notification-bell-icon">🔔</span>
        {unreadCount > 0 && (
          <span className="notification-badge">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div ref={panelRef} className="notification-panel">
          <div className="notification-panel-header">
            <h3 className="notification-panel-title">Notifications</h3>
            <div className="notification-panel-actions">
              {unreadCount > 0 && (
                <button
                  className="notification-panel-action"
                  onClick={handleMarkAllRead}
                >
                  Mark all read
                </button>
              )}
              {notifications.length > 0 && (
                <button
                  className="notification-panel-action danger"
                  onClick={handleClearAll}
                >
                  Clear all
                </button>
              )}
            </div>
          </div>

          <div className="notification-list">
            {notifications.length === 0 ? (
              <div className="notification-empty">
                <div className="notification-empty-icon">🎉</div>
                <p className="notification-empty-text">No notifications</p>
                <p className="notification-empty-hint">
                  We&apos;ll let you know when research completes
                </p>
              </div>
            ) : (
              notifications.map((notif) => (
                <div
                  key={notif.id}
                  className={`notification-item ${notif.read ? "read" : "unread"}`}
                >
                  <div className="notification-item-icon">
                    {getNotifIcon(notif.type)}
                  </div>
                  <div className="notification-item-content">
                    {notif.link ? (
                      <Link
                        href={notif.link}
                        className="notification-item-title-link"
                        onClick={() => {
                          markRead(notif.id);
                          setIsOpen(false);
                        }}
                      >
                        <div className="notification-item-title">{notif.title}</div>
                      </Link>
                    ) : (
                      <div className="notification-item-title">{notif.title}</div>
                    )}
                    <div className="notification-item-body">{notif.body}</div>
                    <div className="notification-item-time">
                      {formatNotificationTime(notif.createdAt)}
                    </div>
                  </div>
                  <button
                    className="notification-item-dismiss"
                    onClick={(e) => handleDismiss(e, notif.id)}
                    aria-label="Dismiss"
                  >
                    ✕
                  </button>
                </div>
              ))
            )}
          </div>

          <div className="notification-panel-footer">
            <Link href="/history" className="notification-view-all" onClick={() => setIsOpen(false)}>
              View all research &rarr;
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
