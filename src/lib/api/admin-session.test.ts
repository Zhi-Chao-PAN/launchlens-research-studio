/// <reference types="vitest/globals" />
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  AdminSessionConfigurationError,
  createAdminSession,
  verifyAdminSession,
} from "@/lib/api/admin-session";
import {
  clearBypassTokens,
  createBypassToken,
  listBypassTokens,
  revokeBypassToken,
} from "@/lib/api/bypass-tokens";

const SECRET = "session-test-secret-with-at-least-32-characters";
const originalSecret = process.env.LAUNCHLENS_ADMIN_SESSION_SECRET;

describe("signed admin sessions", () => {
  beforeEach(() => {
    clearBypassTokens();
    process.env.LAUNCHLENS_ADMIN_SESSION_SECRET = SECRET;
  });

  afterEach(() => {
    if (originalSecret === undefined) delete process.env.LAUNCHLENS_ADMIN_SESSION_SECRET;
    else process.env.LAUNCHLENS_ADMIN_SESSION_SECRET = originalSecret;
    clearBypassTokens();
  });

  it("creates a signed session without embedding the plaintext admin token", () => {
    const plaintext = createBypassToken("admin", "browser-admin");
    const [{ hash }] = listBypassTokens();
    const session = createAdminSession(hash, { now: 1_000 });

    expect(session.value).not.toContain(plaintext);
    expect(verifyAdminSession(session.value, { now: 2_000 })).toMatchObject({
      v: 1,
      tokenHash: hash,
    });
  });

  it("rejects tampering, expiry, revocation, and non-admin scope", () => {
    createBypassToken("admin", "temporary-admin");
    const [{ hash }] = listBypassTokens();
    const session = createAdminSession(hash, { now: 1_000 });

    expect(verifyAdminSession(`${session.value}x`, { now: 2_000 })).toBeNull();
    expect(verifyAdminSession(session.value, { now: session.expiresAt })).toBeNull();
    revokeBypassToken(hash);
    expect(verifyAdminSession(session.value, { now: 2_000 })).toBeNull();

    createBypassToken("bypass", "not-an-admin");
    const bypass = listBypassTokens().find((token) => token.scope === "bypass");
    expect(bypass).toBeDefined();
    const bypassSession = createAdminSession(bypass!.hash, { now: 1_000 });
    expect(verifyAdminSession(bypassSession.value, { now: 2_000 })).toBeNull();
  });

  it("fails closed when the signing secret is missing or too short", () => {
    createBypassToken("admin", "admin");
    const [{ hash }] = listBypassTokens();
    delete process.env.LAUNCHLENS_ADMIN_SESSION_SECRET;
    expect(() => createAdminSession(hash)).toThrow(AdminSessionConfigurationError);
    process.env.LAUNCHLENS_ADMIN_SESSION_SECRET = "too-short";
    expect(() => createAdminSession(hash)).toThrow(AdminSessionConfigurationError);
  });
});
