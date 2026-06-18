import { describe, it, expect, beforeEach } from "vitest";

class MockStorage {
  private d = new Map<string, string>();
  getItem(k: string) { return this.d.get(k) ?? null; }
  setItem(k: string, v: string) { this.d.set(k, v); }
  removeItem(k: string) { this.d.delete(k); }
  clear() { this.d.clear(); }
  get length() { return this.d.size; }
  key(i: number) { return Array.from(this.d.keys())[i] ?? null; }
}
const storage = new MockStorage();
(globalThis as any).localStorage = storage;

import {
  addNotification, getNotifications, getUnreadCount, markRead, markAllRead,
  dismissNotification, clearAllNotifications,
  summarizeNotifications, getNotificationHealth, isValidNotification,
  sanitizeNotifications, filterNotifications, notificationsToCsv,
  notificationsEqual, buildNotification,
} from "@/lib/research/notification-store";

const NOW = 1_700_000_000_000;

beforeEach(() => { clearAllNotifications(); storage.clear(); });

describe("notification-store CRUD", () => {
  it("adds and lists notifications newest first", () => {
    addNotification({ type: "system", title: "hi", body: "b", createdAt: NOW });
    addNotification({ type: "research-complete", title: "done", body: "ok", createdAt: NOW + 1000 });
    const list = getNotifications();
    expect(list.length).toBe(2);
    expect(list[0].type).toBe("research-complete");
  });

  it("tracks unread count and markAllRead flips all", () => {
    addNotification({ type: "system", title: "a", body: "a", createdAt: NOW });
    addNotification({ type: "system", title: "b", body: "b", createdAt: NOW + 1 });
    expect(getUnreadCount()).toBe(2);
    markRead(getNotifications()[1].id);
    expect(getUnreadCount()).toBe(1);
    markAllRead();
    expect(getUnreadCount()).toBe(0);
  });

  it("dismiss removes a single entry", () => {
    const n = addNotification({ type: "system", title: "x", body: "y", createdAt: NOW });
    expect(getNotifications().length).toBe(1);
    dismissNotification(n.id);
    expect(getNotifications().length).toBe(0);
  });
});

describe("notification pure helpers (round 160)", () => {
  const base = (overrides: any = {}): any => ({
    id: "n1", type: "system", title: "t", body: "b", read: false, createdAt: NOW, ...overrides,
  });

  it("summarizeNotifications tallies by type and errors", () => {
    const list = [
      base(), base({ id: "n2", type: "research-failed", read: true }),
      base({ id: "n3", type: "research-complete" }),
    ];
    const s = summarizeNotifications(list, NOW + 1000);
    expect(s.total).toBe(3);
    expect(s.unread).toBe(2);
    expect(s.byType["research-failed"]).toBe(1);
    expect(s.byType["research-complete"]).toBe(1);
    expect(s.byType.system).toBe(1);
    expect(s.hasErrors).toBe(true);
    expect(s.newestAgeMs).toBe(1000);
  });

  it("getNotificationHealth classifies ok/unread/errors/stale", () => {
    expect(getNotificationHealth(summarizeNotifications([], NOW))).toBe("ok");
    const one = [base()];
    expect(getNotificationHealth(summarizeNotifications(one, NOW + 1000))).toBe("unread");
    const err = [base({ type: "research-failed" })];
    expect(getNotificationHealth(summarizeNotifications(err, NOW))).toBe("has-errors");
    const stale = [base({ createdAt: NOW - 48 * 60 * 60 * 1000 })];
    expect(getNotificationHealth(summarizeNotifications(stale, NOW))).toBe("stale-unread");
  });

  it("isValidNotification guards shapes", () => {
    expect(isValidNotification(null)).toBe(false);
    expect(isValidNotification({})).toBe(false);
    expect(isValidNotification(base())).toBe(true);
    expect(isValidNotification({ ...base(), read: "yes" as any })).toBe(false);
  });

  it("sanitizeNotifications filters and sorts desc", () => {
    const list = [
      { bad: true }, base({ id: "old", createdAt: NOW }), base({ id: "new", createdAt: NOW + 1000 }),
    ];
    const out = sanitizeNotifications(list);
    expect(out.map((n) => n.id)).toEqual(["new", "old"]);
  });

  it("filterNotifications supports type/read/search", () => {
    const list = [
      base({ type: "system", title: "Alpha release", body: "out" }),
      base({ id: "n2", type: "research-failed", title: "oops", body: "boom" }),
      base({ id: "n3", type: "system", title: "Beta", body: "hi", read: true }),
    ];
    expect(filterNotifications(list, { type: "system" }).length).toBe(2);
    expect(filterNotifications(list, { read: true }).length).toBe(1);
    expect(filterNotifications(list, { search: "boom" })[0].type).toBe("research-failed");
    expect(filterNotifications(list, { search: "   " }).length).toBe(3);
  });

  it("notificationsToCsv emits header and rows", () => {
    const csv = notificationsToCsv([base()]);
    const [header, row] = csv.split("\n");
    expect(header).toBe("id,type,title,body,read,createdAt,link");
    expect(row.startsWith("n1,system,")).toBe(true);
  });

  it("notificationsEqual deep compares including metadata", () => {
    const a = base({ metadata: { x: "1" } });
    expect(notificationsEqual(a, { ...a })).toBe(true);
    expect(notificationsEqual(a, { ...a, title: "other" })).toBe(false);
    expect(notificationsEqual(a, { ...a, metadata: { x: "2" } })).toBe(false);
  });

  it("buildNotification produces a valid AppNotification", () => {
    const n = buildNotification("system", " Hello ", " World ", {}, NOW);
    expect(n.title).toBe("Hello");
    expect(n.body).toBe("World");
    expect(n.id).toContain("notif-");
    expect(n.read).toBe(false);
    expect(isValidNotification(n)).toBe(true);
  });
});
