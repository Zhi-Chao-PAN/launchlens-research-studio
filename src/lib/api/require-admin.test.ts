/// <reference types="vitest/globals" />
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { requireAdmin } from "@/lib/api/require-admin";
import { createBypassToken, listBypassTokens, revokeBypassToken } from "@/lib/api/bypass-tokens";
import { clearRateLimits } from "@/lib/api/rate-limit";
import { ADMIN_SESSION_COOKIE, createAdminSession } from "@/lib/api/admin-session";
import { NextRequest } from "next/server";

const originalSessionSecret = process.env.LAUNCHLENS_ADMIN_SESSION_SECRET;

function makeReq(authHeader?: string, cookie?: string, ip = "203.0.113.1"): NextRequest {
  const headers = new Headers();
  if (authHeader) headers.set("authorization", authHeader);
  if (cookie) headers.set("cookie", `${ADMIN_SESSION_COOKIE}=${cookie}`);
  headers.set("x-forwarded-for", ip);
  return new NextRequest("http://localhost/api/admin/tokens", { method: "GET", headers });
}

describe("requireAdmin (round 202)", () => {
  beforeEach(() => {
    process.env.LAUNCHLENS_ADMIN_SESSION_SECRET = "require-admin-test-session-secret-32-bytes";
    clearRateLimits();
    // Wipe tokens between tests so the storage backend doesn't accumulate.
    for (const t of listBypassTokens()) {
      revokeBypassToken(t.hash);
    }
  });

  afterEach(() => {
    if (originalSessionSecret === undefined) delete process.env.LAUNCHLENS_ADMIN_SESSION_SECRET;
    else process.env.LAUNCHLENS_ADMIN_SESSION_SECRET = originalSessionSecret;
  });

  it("rejects requests with no Authorization header", () => {
    const res = requireAdmin(makeReq());
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.status).toBe(401);
      expect(res.reason).toBe("missing-auth");
      expect(res.response.status).toBe(401);
    }
  });

  it("rejects requests with a malformed bearer header", () => {
    const res = requireAdmin(makeReq("NotBearer xyz"));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("missing-auth");
  });

  it("rejects requests with a syntactically-valid but unknown token", () => {
    const res = requireAdmin(makeReq("Bearer this-token-does-not-exist-12345"));
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.status).toBe(401);
      expect(res.reason).toBe("invalid-token");
    }
  });

  it("rejects a valid bypass-scope token (insufficient scope)", () => {
    const tok = createBypassToken("bypass", "test-bypass-only");
    const res = requireAdmin(makeReq("Bearer " + tok));
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.status).toBe(401);
      expect(res.reason).toBe("insufficient-scope");
    }
  });

  it("accepts a valid admin-scope token and returns the token hash", () => {
    const tok = createBypassToken("admin", "test-admin");
    const res = requireAdmin(makeReq("Bearer " + tok));
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.tokenHash).toMatch(/^[a-f0-9]{64}$/); // sha256 hex
      expect(res.ip).toBe("203.0.113.1");
    }
  });

  it("accepts a signed HttpOnly-style session without a bearer token", () => {
    createBypassToken("admin", "browser-admin");
    const admin = listBypassTokens().find((entry) => entry.scope === "admin");
    expect(admin).toBeDefined();
    const session = createAdminSession(admin!.hash);

    const result = requireAdmin(makeReq(undefined, session.value));

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.tokenHash).toBe(admin!.hash);
  });

  it("rate-limits repeated invalid admin tokens by anonymous IP before authentication", () => {
    for (let index = 0; index < 30; index += 1) {
      const result = requireAdmin(makeReq(`Bearer invalid-admin-token-${index}`));
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe("invalid-token");
    }

    const limited = requireAdmin(makeReq("Bearer invalid-admin-token-30"));
    expect(limited.ok).toBe(false);
    if (!limited.ok) {
      expect(limited.status).toBe(429);
      expect(limited.reason).toBe("rate-limited");
      expect(limited.response.headers.get("Retry-After")).toBeTruthy();
    }
  });

  it("charges the IP bucket only once for each successful admin request", () => {
    const token = createBypassToken("admin", "single-ip-charge");
    for (let index = 0; index < 30; index += 1) {
      expect(requireAdmin(makeReq(`Bearer ${token}`)).ok).toBe(true);
    }

    const limited = requireAdmin(makeReq(`Bearer ${token}`));
    expect(limited.ok).toBe(false);
    if (!limited.ok) expect(limited.reason).toBe("rate-limited");
  });

  it("rate-limits a successfully authenticated admin token across distinct IPs", () => {
    const token = createBypassToken("admin", "token-hash-limit");
    for (let index = 0; index < 100; index += 1) {
      const result = requireAdmin(
        makeReq(`Bearer ${token}`, undefined, `198.51.100.${index}`),
      );
      expect(result.ok).toBe(true);
    }

    const limited = requireAdmin(
      makeReq(`Bearer ${token}`, undefined, "198.51.100.200"),
    );
    expect(limited.ok).toBe(false);
    if (!limited.ok) expect(limited.reason).toBe("rate-limited");
  });
});
