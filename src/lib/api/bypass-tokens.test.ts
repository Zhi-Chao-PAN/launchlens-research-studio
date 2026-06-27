/// <reference types="vitest/globals" />
import {
  isBypassToken,
  isAdminToken,
  extractBearerToken,
  createBypassToken,
  listBypassTokens,
  revokeBypassToken,
  clearBypassTokens,
  getTokenInfo,
  checkAdminRateLimit,
} from "@/lib/api/bypass-tokens";

// Note: hasTokenScope may or may not exist yet - let's test what we have.
// Actually it doesn't exist in the new version; we use isAdminToken instead.

describe("bypass-tokens", () => {
  beforeEach(() => {
    clearBypassTokens();
  });

  describe("createBypassToken + scopes", () => {
    it("creates a bypass-scoped token by default", () => {
      const tok = createBypassToken(undefined, "test");
      const info = getTokenInfo(tok);
      expect(info).not.toBeNull();
      expect(info?.scope).toBe("bypass");
      expect(info?.label).toBe("test");
    });

    it("creates an admin-scoped token", () => {
      const tok = createBypassToken("admin", "admin-test");
      const info = getTokenInfo(tok);
      expect(info?.scope).toBe("admin");
    });

    it("bypass token validates as bypass but not admin", () => {
      const tok = createBypassToken("bypass", "bypass-only");
      expect(isBypassToken(tok)).toBe(true);
      expect(isAdminToken(tok)).toBe(false);
    });

    it("admin token validates as both bypass and admin", () => {
      const tok = createBypassToken("admin", "admin-only");
      expect(isBypassToken(tok)).toBe(true);
      expect(isAdminToken(tok)).toBe(true);
    });

    it("returns false for invalid tokens", () => {
      expect(isBypassToken("random-string")).toBe(false);
      expect(isAdminToken("random-string")).toBe(false);
      expect(isBypassToken("")).toBe(false);
      expect(getTokenInfo("")).toBeNull();
    });
  });

  describe("extractBearerToken", () => {
    it("extracts token from Bearer header", () => {
      expect(extractBearerToken("Bearer abc123")).toBe("abc123");
      expect(extractBearerToken("bearer  xyz  ")).toBe("xyz");
    });

    it("returns null for missing/malformed headers", () => {
      expect(extractBearerToken(null)).toBeNull();
      expect(extractBearerToken("Basic abc")).toBeNull();
      expect(extractBearerToken("Bearer")).toBeNull();
      expect(extractBearerToken("")).toBeNull();
    });
  });

  describe("listBypassTokens", () => {
    it("lists all tokens with labels", () => {
      createBypassToken("bypass", "first");
      createBypassToken("admin", "second");
      const list = listBypassTokens();
      expect(list).toHaveLength(2);
      const labels = list.map((t) => t.label).sort();
      expect(labels).toEqual(["first", "second"]);
    });
  });

  describe("revokeBypassToken", () => {
    it("revokes by hash", () => {
      const tok = createBypassToken("bypass", "to-revoke");
      const listBefore = listBypassTokens();
      expect(listBefore).toHaveLength(1);

      const hash = listBefore[0].hash;
      const ok = revokeBypassToken(hash);
      expect(ok).toBe(true);
      expect(listBypassTokens()).toHaveLength(0);
      expect(isBypassToken(tok)).toBe(false);
    });

    it("returns false for unknown hash", () => {
      expect(revokeBypassToken("nonexistent")).toBe(false);
    });
  });

  describe("usage tracking", () => {
    it("increments usageCount and sets lastUsedAt", () => {
      const tok = createBypassToken("bypass", "usage-test");
      const before = listBypassTokens()[0];
      expect(before.usageCount).toBe(0);
      expect(before.lastUsedAt).toBeUndefined();

      isBypassToken(tok);
      const after = listBypassTokens()[0];
      expect(after.usageCount).toBe(1);
      expect(after.lastUsedAt).toBeDefined();
      expect(after.lastUsedAt).toBeGreaterThan(0);
    });

    it("records lastIp when provided", () => {
      const tok = createBypassToken("bypass", "ip-test");
      isBypassToken(tok, "1.2.3.4");
      const after = listBypassTokens()[0];
      expect(after.lastIp).toBe("1.2.3.4");
    });
  });

  describe("checkAdminRateLimit", () => {
    it("returns a rate limit result for an IP", () => {
      const result = checkAdminRateLimit("test-ip-123");
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBeGreaterThan(0);
      expect(typeof result.resetMs).toBe("number");
    });

    it("also limits by token hash when provided", () => {
      const resultWithHash = checkAdminRateLimit("test-ip-456", "some-token-hash");
      const resultWithoutHash = checkAdminRateLimit("test-ip-456");
      // Both should work; the one with hash should consume from the token bucket
      expect(resultWithHash.allowed).toBe(true);
      expect(resultWithoutHash.allowed).toBe(true);
    });
  });

  describe("TTL + auto-expiry (R227)", () => {
    beforeEach(() => {
      clearBypassTokens();
      delete process.env.LAUNCHLENS_TOKEN_DEFAULT_TTL_MS;
    });

    it("creates a token with no expiry when ttlMs is omitted and no env default", () => {
      const tok = createBypassToken("bypass", "no-ttl");
      const info = getTokenInfo(tok);
      expect(info?.expiresAt).toBeUndefined();
      expect(isBypassToken(tok)).toBe(true);
    });

    it("sets expiresAt from an explicit ttlMs", () => {
      const tok = createBypassToken("bypass", "ttl-1h", 3600_000);
      const info = getTokenInfo(tok);
      expect(info?.expiresAt).toBeDefined();
      expect(typeof info?.expiresAt).toBe("number");
      // expiresAt should be ~now + 1h
      expect(info!.expiresAt!).toBeGreaterThan(Date.now());
    });

    it("rejects an expired token via isBypassToken", async () => {
      // Create a token with a 1ms TTL, then wait for it to expire.
      const tok = createBypassToken("bypass", "expired", 1);
      expect(isBypassToken(tok)).toBe(true); // still valid immediately
      await new Promise((r) => setTimeout(r, 10));
      // After the TTL elapses, the token is rejected and pruned.
      expect(isBypassToken(tok)).toBe(false);
    });

    it("evicts expired tokens from listBypassTokens", async () => {
      createBypassToken("bypass", "alive");
      createBypassToken("bypass", "dead", 1);
      await new Promise((r) => setTimeout(r, 10));
      const list = listBypassTokens();
      // The expired one is pruned, only the alive token remains.
      expect(list).toHaveLength(1);
      expect(list[0].label).toBe("alive");
    });

    it("applies LAUNCHLENS_TOKEN_DEFAULT_TTL_MS when no explicit ttlMs", () => {
      process.env.LAUNCHLENS_TOKEN_DEFAULT_TTL_MS = "7200000"; // 2h
      const tok = createBypassToken("bypass", "env-ttl");
      const info = getTokenInfo(tok);
      expect(info?.expiresAt).toBeDefined();
      expect(info!.expiresAt!).toBeGreaterThan(Date.now() + 3_600_000);
    });

    it("explicit ttlMs=0 forces no-expiry even with an env default", () => {
      process.env.LAUNCHLENS_TOKEN_DEFAULT_TTL_MS = "7200000";
      const tok = createBypassToken("bypass", "force-never", 0);
      const info = getTokenInfo(tok);
      expect(info?.expiresAt).toBeUndefined();
      expect(isBypassToken(tok)).toBe(true);
    });

    it("a non-expired TTL token still validates", () => {
      const tok = createBypassToken("bypass", "valid-ttl", 3600_000);
      expect(isBypassToken(tok)).toBe(true);
      expect(isAdminToken(tok)).toBe(false);
    });
  });
});
