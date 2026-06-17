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

