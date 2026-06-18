/// <reference types="vitest/globals" />
import { recordAuthAudit, snapshotAuthAudit, clearAuthAudit } from "@/lib/api/auth-audit";

describe("auth-audit", () => {
  beforeEach(() => {
    clearAuthAudit();
  });

  it("records events with incrementing IDs", () => {
    const e1 = recordAuthAudit("auth_success", { ipHash: "abc123" });
    const e2 = recordAuthAudit("auth_failed", { detail: "wrong token" });
    expect(e1.id).toBeLessThan(e2.id);
    expect(e1.type).toBe("auth_success");
    expect(e2.type).toBe("auth_failed");
    expect(e1.timestamp).toBeGreaterThan(0);
    expect(e2.timestamp).toBeGreaterThanOrEqual(e1.timestamp);
  });

  it("stores ipHash, tokenHash, scope, detail, userAgent", () => {
    const e = recordAuthAudit("admin_action", {
      ipHash: "ip-123",
      tokenHash: "tok-456",
      scope: "admin",
      detail: "created new token",
      userAgent: "TestAgent/1.0",
    });
    expect(e.ipHash).toBe("ip-123");
    expect(e.tokenHash).toBe("tok-456");
    expect(e.scope).toBe("admin");
    expect(e.detail).toBe("created new token");
    expect(e.userAgent).toBe("TestAgent/1.0");
  });

  it("snapshot returns most recent events", () => {
    for (let i = 0; i < 10; i++) {
      recordAuthAudit("csrf_failed", { detail: "event-" + i });
    }
    const snap = snapshotAuthAudit(5);
    expect(snap).toHaveLength(5);
    expect(snap[0].detail).toBe("event-5");
    expect(snap[4].detail).toBe("event-9");
  });

  it("caps at MAX_EVENTS (100)", () => {
    for (let i = 0; i < 150; i++) {
      recordAuthAudit("rate_limited", { detail: String(i) });
    }
    const snap = snapshotAuthAudit();
    expect(snap).toHaveLength(100);
    expect(snap[0].detail).toBe("50");
    expect(snap[99].detail).toBe("149");
  });

  it("clearAuthAudit resets everything", () => {
    recordAuthAudit("token_created");
    clearAuthAudit();
    expect(snapshotAuthAudit()).toHaveLength(0);

    // New events start from id 1
    const e = recordAuthAudit("token_revoked");
    expect(e.id).toBe(1);
  });

  it("handles all event types", () => {
    const types = [
      "token_created",
      "token_revoked",
      "auth_success",
      "auth_failed",
      "csrf_failed",
      "rate_limited",
      "admin_action",
    ] as const;
    for (const t of types) {
      const e = recordAuthAudit(t);
      expect(e.type).toBe(t);
    }
    expect(snapshotAuthAudit()).toHaveLength(types.length);
  });
});
