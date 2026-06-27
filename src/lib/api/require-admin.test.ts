/// <reference types="vitest/globals" />
import { describe, it, expect, beforeEach } from "vitest";
import { requireAdmin } from "@/lib/api/require-admin";
import { createBypassToken, listBypassTokens, revokeBypassToken } from "@/lib/api/bypass-tokens";
import { NextRequest } from "next/server";

function makeReq(authHeader?: string): NextRequest {
  const headers = new Headers();
  if (authHeader) headers.set("authorization", authHeader);
  headers.set("x-forwarded-for", "203.0.113.1");
  return new NextRequest("http://localhost/api/admin/tokens", { method: "GET", headers });
}

describe("requireAdmin (round 202)", () => {
  beforeEach(() => {
    // Wipe tokens between tests so the storage backend doesn't accumulate.
    for (const t of listBypassTokens()) {
      revokeBypassToken(t.hash);
    }
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
});
