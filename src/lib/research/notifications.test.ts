import { describe, it, expect, beforeEach, beforeAll, vi } from "vitest";
import {
  areNotificationsSupported,
  getNotificationPermission,
  registerPendingNotification,
  getPendingNotifications,
  clearPendingNotification,
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
