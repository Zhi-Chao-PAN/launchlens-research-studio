import { getAlerts, clearAlerts, alertConfig } from "@/lib/api/auth-alerts";
import { recordAuthAudit } from "@/lib/api/auth-audit";

// Note: auth-alerts.ts auto-registers a listener on import via onAuthAuditEvent.
// We just need to fire events via recordAuthAudit and check that alerts appear.

describe("Auth alerts", () => {
  beforeEach(() => {
    clearAlerts();
  });

  describe("configuration", () => {
    it("exposes default config", () => {
      expect(alertConfig.windowSeconds).toBe(60);
      expect(alertConfig.authFailedThreshold).toBe(10);
      expect(alertConfig.csrfFailedThreshold).toBe(5);
      expect(alertConfig.rateLimitedThreshold).toBe(20);
      expect(alertConfig.maxAlerts).toBe(50);
      expect(typeof alertConfig.webhookEnabled).toBe("boolean");
    });
  });

  describe("auth_failed burst detection", () => {
    it("does not alert below threshold", () => {
      for (let i = 0; i < 5; i++) {
        recordAuthAudit("auth_failed", {
          ipHash: "test-ip-1",
          detail: "wrong-password",
        });
      }
      const alerts = getAlerts();
      expect(alerts.length).toBe(0);
    });

    it("alerts when threshold is reached", () => {
      for (let i = 0; i < 10; i++) {
        recordAuthAudit("auth_failed", {
          ipHash: "test-ip-burst",
          detail: "wrong-token",
        });
      }
      const alerts = getAlerts();
      expect(alerts.length).toBe(1);
      expect(alerts[0].type).toBe("auth_failed_burst");
      expect(alerts[0].severity).toBe("warning");
      expect(alerts[0].ipHash).toBe("test-ip-burst");
      expect(alerts[0].count).toBeGreaterThanOrEqual(10);
    });

    it("tracks per-IP separately", () => {
      // 8 failures from IP A
      for (let i = 0; i < 8; i++) {
        recordAuthAudit("auth_failed", { ipHash: "ip-a", detail: "x" });
      }
      // 8 failures from IP B
      for (let i = 0; i < 8; i++) {
        recordAuthAudit("auth_failed", { ipHash: "ip-b", detail: "x" });
      }
      // Neither should have triggered (below threshold of 10)
      expect(getAlerts().length).toBe(0);

      // 2 more from IP A -> should trigger
      for (let i = 0; i < 2; i++) {
        recordAuthAudit("auth_failed", { ipHash: "ip-a", detail: "x" });
      }
      const alerts = getAlerts();
      expect(alerts.length).toBe(1);
      expect(alerts[0].ipHash).toBe("ip-a");
    });
  });

  describe("csrf_failed burst detection", () => {
    it("alerts at lower threshold", () => {
      for (let i = 0; i < 5; i++) {
        recordAuthAudit("csrf_failed", {
          ipHash: "csrf-test-ip",
          detail: "mismatch",
        });
      }
      const alerts = getAlerts();
      expect(alerts.length).toBe(1);
      expect(alerts[0].type).toBe("csrf_failed_burst");
      expect(alerts[0].severity).toBe("warning");
    });
  });

  describe("rate_limited burst detection", () => {
    it("alerts at rate limit threshold", () => {
      for (let i = 0; i < 20; i++) {
        recordAuthAudit("rate_limited", {
          ipHash: "rate-limit-ip",
          detail: "research endpoint",
        });
      }
      const alerts = getAlerts();
      expect(alerts.length).toBe(1);
      expect(alerts[0].type).toBe("rate_limited_burst");
      expect(alerts[0].severity).toBe("info");
    });
  });

  describe("admin token creation alerts", () => {
    it("alerts critically when admin token is created", () => {
      recordAuthAudit("token_created", {
        tokenHash: "admin-token-hash",
        scope: "admin",
        ipHash: "admin-ip",
        detail: "new-admin-token",
      });
      const alerts = getAlerts();
      expect(alerts.length).toBe(1);
      expect(alerts[0].type).toBe("admin_token_created");
      expect(alerts[0].severity).toBe("critical");
    });

    it("does not alert for bypass token creation", () => {
      recordAuthAudit("token_created", {
        tokenHash: "bypass-token-hash",
        scope: "bypass",
        ipHash: "admin-ip",
        detail: "new-bypass-token",
      });
      expect(getAlerts().length).toBe(0);
    });
  });

  describe("alert querying", () => {
    beforeEach(() => {
      // Create several alerts
      for (let i = 0; i < 10; i++) {
        recordAuthAudit("auth_failed", { ipHash: "ip-" + i, detail: "x" });
      }
      // Need 10 from same IP to trigger
      for (let i = 0; i < 15; i++) {
        recordAuthAudit("auth_failed", { ipHash: "burst1", detail: "x" });
      }
      for (let i = 0; i < 15; i++) {
        recordAuthAudit("auth_failed", { ipHash: "burst2", detail: "x" });
      }
    });

    it("returns alerts in reverse chronological order", () => {
      const alerts = getAlerts();
      expect(alerts.length).toBeGreaterThanOrEqual(2);
      // Most recent first
      expect(alerts[0].ts).toBeGreaterThanOrEqual(alerts[1].ts);
    });

    it("respects limit parameter", () => {
      const all = getAlerts();
      const limited = getAlerts(1);
      expect(limited.length).toBe(1);
      expect(limited[0].id).toBe(all[0].id);
    });
  });

  describe("clearAlerts", () => {
    it("resets all alerts and trackers", () => {
      for (let i = 0; i < 10; i++) {
        recordAuthAudit("auth_failed", { ipHash: "clear-test", detail: "x" });
      }
      expect(getAlerts().length).toBeGreaterThan(0);
      clearAlerts();
      expect(getAlerts().length).toBe(0);
    });
  });

  describe("alert cooldown", () => {
    it("doesn't alert multiple times within the same window", () => {
      // Trigger first alert at 10
      for (let i = 0; i < 10; i++) {
        recordAuthAudit("auth_failed", { ipHash: "cooldown-ip", detail: "x" });
      }
      expect(getAlerts().length).toBe(1);

      // 5 more should NOT trigger another alert (cooldown)
      for (let i = 0; i < 5; i++) {
        recordAuthAudit("auth_failed", { ipHash: "cooldown-ip", detail: "x" });
      }
      expect(getAlerts().length).toBe(1);
    });
  });

  describe("alert structure", () => {
    beforeEach(() => {
      for (let i = 0; i < 10; i++) {
        recordAuthAudit("auth_failed", {
          ipHash: "struct-ip",
          detail: "test-detail",
          userAgent: "TestAgent/1.0",
        });
      }
    });

    it("has expected fields", () => {
      const alert = getAlerts()[0];
      expect(alert).toHaveProperty("id");
      expect(alert).toHaveProperty("type");
      expect(alert).toHaveProperty("severity");
      expect(alert).toHaveProperty("message");
      expect(alert).toHaveProperty("count");
      expect(alert).toHaveProperty("windowSeconds");
      expect(alert).toHaveProperty("ts");
      expect(alert).toHaveProperty("details");
      expect(typeof alert.id).toBe("string");
      expect(alert.id.length).toBeGreaterThan(0);
      expect(typeof alert.ts).toBe("number");
      expect(Array.isArray(alert.details)).toBe(false);
      expect(typeof alert.details).toBe("object");
    });
  });
});
