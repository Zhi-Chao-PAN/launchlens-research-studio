/// <reference types="vitest/globals" />
import {
  areNotificationsSupported,
  getNotificationPermission,
  registerPendingNotification,
  getPendingNotifications,
  clearPendingNotification,
  getNotificationPrefs,
  updateNotificationPrefs,
  isInDNDWindow,
  getNotificationHistory,
  recordNotificationHistory,
  markNotificationSeen,
  markAllNotificationsSeen,
  getUnreadNotificationCount,
  clearNotificationHistory,
  clearAllPendingNotifications,
  getPendingCount,
  removeStalePendingNotifications,
  severityFor,
  truncateBody,
  formatNotificationTime,
  summarizeHistory,
  filterHistoryByType,
  filterHistoryBySeen,
  groupHistoryByDay,
  dedupeHistory,
  shouldSuppressByPrefs,
  pendingSummary,
  historyToCsv,
} from "@/lib/research/notifications";

// Mock localStorage
const storage = new Map<string, string>();
beforeAll(() => {
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => storage.set(k, v),
    removeItem: (k: string) => storage.delete(k),
    clear: () => storage.clear(),
  });
  
  // Mock Notification
  vi.stubGlobal("Notification", {
    permission: "granted",
    requestPermission: () => Promise.resolve("granted"),
  });
  
  vi.stubGlobal("window", { Notification: { permission: "granted" } });
});

beforeEach(() => {
  storage.clear();
});

describe("notifications", () => {
  describe("areNotificationsSupported", () => {
    it("returns true when Notification API exists", () => {
      expect(areNotificationsSupported()).toBe(true);
    });
  });

  describe("getNotificationPermission", () => {
    it("returns the permission state", () => {
      expect(getNotificationPermission()).toBe("granted");
    });
  });

  describe("pending notifications", () => {
    it("starts empty", () => {
      expect(getPendingNotifications()).toEqual([]);
    });

    it("registers a pending notification", () => {
      registerPendingNotification("run-1", "Test research");
      const pending = getPendingNotifications();
      expect(pending).toHaveLength(1);
      expect(pending[0].runId).toBe("run-1");
      expect(pending[0].query).toBe("Test research");
    });

    it("doesn't duplicate pending notifications", () => {
      registerPendingNotification("run-1", "Test");
      registerPendingNotification("run-1", "Test");
      expect(getPendingNotifications()).toHaveLength(1);
    });

    it("clears a pending notification", () => {
      registerPendingNotification("run-1", "Test");
      registerPendingNotification("run-2", "Test 2");
      
      clearPendingNotification("run-1");
      
      const pending = getPendingNotifications();
      expect(pending).toHaveLength(1);
      expect(pending[0].runId).toBe("run-2");
    });

    it("handles clearing non-existent notifications gracefully", () => {
      expect(() => clearPendingNotification("fake")).not.toThrow();
    });
  });
});


describe("notification preferences (round 137)", () => {
  beforeEach(() => localStorage.clear());

  it("returns default prefs initially", () => {
    const prefs = getNotificationPrefs();
    expect(prefs.desktopEnabled).toBe(true);
    expect(prefs.soundEnabled).toBe(false);
    expect(prefs.inAppEnabled).toBe(true);
    expect(prefs.doNotDisturb).toBe(false);
  });

  it("updateNotificationPrefs merges with existing", () => {
    updateNotificationPrefs({ soundEnabled: true });
    const p = getNotificationPrefs();
    expect(p.soundEnabled).toBe(true);
    expect(p.desktopEnabled).toBe(true); // preserved
  });

  it("updateNotificationPrefs persists and re-reads", () => {
    updateNotificationPrefs({ notifyOnStar: true, doNotDisturb: true, dndStartHour: 22, dndEndHour: 8 });
    const fresh = getNotificationPrefs();
    expect(fresh.notifyOnStar).toBe(true);
    expect(fresh.dndStartHour).toBe(22);
    expect(fresh.dndEndHour).toBe(8);
  });

  it("isInDNDWindow respects DND settings", () => {
    updateNotificationPrefs({ doNotDisturb: false });
    expect(isInDNDWindow()).toBe(false);
    updateNotificationPrefs({ doNotDisturb: true, dndStartHour: 0, dndEndHour: 23 });
    // 0-23 covers all hours
    expect(isInDNDWindow()).toBe(true);
  });
});

describe("notification history (round 137)", () => {
  beforeEach(() => localStorage.clear());

  it("records history entries", () => {
    recordNotificationHistory({ title: "Test", body: "Body", type: "complete" });
    const h = getNotificationHistory();
    expect(h).toHaveLength(1);
    expect(h[0].title).toBe("Test");
    expect(h[0].seen).toBe(false);
    expect(h[0].createdAt).toBeTruthy();
  });

  it("markNotificationSeen marks single entry", () => {
    recordNotificationHistory({ title: "T1", body: "b", type: "complete" });
    recordNotificationHistory({ title: "T2", body: "b", type: "failure" });
    const h = getNotificationHistory();
    markNotificationSeen(h[0].id);
    expect(getNotificationHistory()[0].seen).toBe(true);
    expect(getNotificationHistory()[1].seen).toBe(false);
  });

  it("markAllNotificationsSeen marks all and returns count", () => {
    recordNotificationHistory({ title: "A", body: "b", type: "complete" });
    recordNotificationHistory({ title: "B", body: "b", type: "failure" });
    const count = markAllNotificationsSeen();
    expect(count).toBe(2);
    expect(getUnreadNotificationCount()).toBe(0);
  });

  it("getUnreadNotificationCount counts unread", () => {
    recordNotificationHistory({ title: "A", body: "b", type: "complete" });
    recordNotificationHistory({ title: "B", body: "b", type: "failure" });
    expect(getUnreadNotificationCount()).toBe(2);
    markAllNotificationsSeen();
    expect(getUnreadNotificationCount()).toBe(0);
  });

  it("clearNotificationHistory empties history", () => {
    recordNotificationHistory({ title: "X", body: "y", type: "complete" });
    clearNotificationHistory();
    expect(getNotificationHistory()).toHaveLength(0);
  });
});

describe("bulk pending operations (round 137)", () => {
  beforeEach(() => localStorage.clear());

  it("clearAllPendingNotifications clears all and returns count", () => {
    registerPendingNotification("r1", "query 1");
    registerPendingNotification("r2", "query 2");
    const count = clearAllPendingNotifications();
    expect(count).toBe(2);
    expect(getPendingNotifications()).toHaveLength(0);
  });

  it("getPendingCount returns pending count", () => {
    expect(getPendingCount()).toBe(0);
    registerPendingNotification("r1", "q");
    expect(getPendingCount()).toBe(1);
  });

  it("removeStalePendingNotifications removes old entries", () => {
    registerPendingNotification("new", "new query");
    // Manually inject an old entry
    const pending = getPendingNotifications();
    pending.push({ runId: "old", query: "old", createdAt: Date.now() - 48 * 60 * 60 * 1000 });
    localStorage.setItem("launchlens:pending-notifs", JSON.stringify(pending));
    const removed = removeStalePendingNotifications(24 * 60 * 60 * 1000);
    expect(removed).toBe(1);
    const remaining = getPendingNotifications();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].runId).toBe("new");
  });
});
describe('notifications extensions (round 152)', () => {
  const iso = (t: number) => new Date(t).toISOString();
  const mk = (ov: any = {}): any => Object.assign({ id: 'n1', type: 'research-complete', title: 'Done', body: 'body', runId: 'r1', seen: false, createdAt: iso(1700000000000) }, ov);

  it('severityFor maps types to semantic severities', () => {
    expect(severityFor("research-complete")).toBe("success");
    expect(severityFor("batch-complete")).toBe("success");
    expect(severityFor("research-failed")).toBe("error");
    expect(severityFor("schedule-missed")).toBe("error");
    expect(severityFor("system")).toBe("warning");
    expect(severityFor("unknown")).toBe("info");
  });

  it('truncateBody respects max and appends ellipsis', () => {
    expect(truncateBody("short", 10)).toBe("short");
    expect(truncateBody("", 5)).toBe("");
    const long = "a".repeat(200);
    const t = truncateBody(long, 50);
    expect(t.length).toBe(50);
    expect(t.endsWith("\u2026")).toBe(true);
  });

  it('formatNotificationTime formats ISO or ms', () => {
    expect(formatNotificationTime(new Date(1700000000000).toISOString())).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
    expect(formatNotificationTime(1700000000000)).toMatch(/^\d{4}-/);
    expect(formatNotificationTime("garbage")).toBe("");
  });

  it('summarizeHistory aggregates by type/severity and tracks unread', () => {
    const entries = [
      mk({ id: "a", type: "research-complete", seen: false, createdAt: iso(1) }),
      mk({ id: "b", type: "research-failed", seen: true, createdAt: iso(2) }),
      mk({ id: "c", type: "system", seen: false, createdAt: iso(3) }),
    ];
    const s2 = summarizeHistory(entries);
    expect(s2.total).toBe(3);
    expect(s2.unread).toBe(2);
    expect(s2.byType["research-complete"]).toBe(1);
    expect(s2.bySeverity.success).toBe(1);
    expect(s2.bySeverity.error).toBe(1);
    expect(s2.bySeverity.warning).toBe(1);
    expect(s2.latest!.id).toBe("c");
  });

  it('filterHistoryByType and filterHistoryBySeen', () => {
    const list = [mk({ type: "a", seen: true }), mk({ type: "b", seen: false }), mk({ type: "a", seen: false })];
    expect(filterHistoryByType(list, "a")).toHaveLength(2);
    expect(filterHistoryBySeen(list, false)).toHaveLength(2);
    expect(filterHistoryBySeen(list, true)).toHaveLength(1);
  });

  it('groupHistoryByDay groups by YYYY-MM-DD preserving entry order', () => {
    const list = [
      mk({ createdAt: "2024-01-02T10:00:00.000Z" }),
      mk({ createdAt: "2024-01-01T10:00:00.000Z" }),
      mk({ createdAt: "2024-01-02T11:00:00.000Z" }),
    ];
    const groups = groupHistoryByDay(list);
    expect(groups).toHaveLength(2);
    expect(groups[0].day).toBe("2024-01-02");
    expect(groups[0].entries).toHaveLength(2);
    expect(groups[1].day).toBe("2024-01-01");
  });

  it('dedupeHistory collapses duplicates of same type/runId within window', () => {
    const list = [
      mk({ id: "x1", type: "research-complete", runId: "r", createdAt: iso(1000) }),
      mk({ id: "x2", type: "research-complete", runId: "r", createdAt: iso(2000) }),
      mk({ id: "x3", type: "research-complete", runId: "r", createdAt: iso(200000) }),
    ];
    const out = dedupeHistory(list, 60000);
    expect(out).toHaveLength(2);
    expect(out.map((e) => e.id).sort()).toEqual(["x2", "x3"]);
  });

  it('shouldSuppressByPrefs obeys DND, inAppEnabled, and per-type toggles', () => {
    const inDND = new Date(2024, 0, 1, 22, 0);
    const outside = new Date(2024, 0, 1, 10, 0);
    const base = { desktopEnabled: true, soundEnabled: false, inAppEnabled: true, doNotDisturb: true, dndStartHour: 21, dndEndHour: 8, notifyOnComplete: true, notifyOnFailure: true, notifyOnStar: false };
    expect(shouldSuppressByPrefs(base, "research-complete", inDND)).toBe(true);
    expect(shouldSuppressByPrefs(base, "research-complete", outside)).toBe(false);
    expect(shouldSuppressByPrefs({ ...base, inAppEnabled: false, doNotDisturb: false }, "research-complete")).toBe(true);
    expect(shouldSuppressByPrefs({ ...base, doNotDisturb: false, notifyOnComplete: false }, "research-complete")).toBe(true);
    expect(shouldSuppressByPrefs({ ...base, doNotDisturb: false, notifyOnFailure: false }, "research-failed")).toBe(true);
  });

  it('pendingSummary returns zeroed for empty and counts oldest/newest', () => {
    const now = Date.now();
    expect(pendingSummary([])).toEqual({ total: 0, oldestAgeMs: 0, newestCreatedAt: 0 });
    const out = pendingSummary([
      { runId: "a", query: "q", createdAt: now - 5000 },
      { runId: "b", query: "q2", createdAt: now - 1000 },
    ]);
    expect(out.total).toBe(2);
    expect(out.oldestAgeMs).toBeGreaterThanOrEqual(5000);
    expect(out.newestCreatedAt).toBe(now - 1000);
  });

  it('historyToCsv emits header and CSV-safe entries', () => {
    const csv = historyToCsv([mk({ title: "hello, world" })]);
    const lines = csv.split("\n");
    expect(lines[0]).toBe("id,type,title,body,runId,seen,createdAt");
    expect(lines[1]).toContain("hello, world");
  });

});
