import {
  isBypassToken,
  extractBearerToken,
  createBypassToken,
  listBypassTokens,
  revokeBypassToken,
  clearBypassTokens,
} from "@/lib/api/bypass-tokens";

describe("bypass-tokens", () => {
  beforeEach(() => {
    clearBypassTokens();
  });

  describe("createBypassToken", () => {
    it("creates a token that validates", () => {
      const tok = createBypassToken("test-token");
      expect(tok).toBeTruthy();
      expect(tok.length).toBeGreaterThan(20);
      expect(isBypassToken(tok)).toBe(true);
    });

    it("returns false for invalid tokens", () => {
      expect(isBypassToken("random-string")).toBe(false);
      expect(isBypassToken("")).toBe(false);
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
      createBypassToken("first");
      createBypassToken("second");
      const list = listBypassTokens();
      expect(list).toHaveLength(2);
      const labels = list.map((t) => t.label).sort();
      expect(labels).toEqual(["first", "second"]);
    });
  });

  describe("revokeBypassToken", () => {
    it("revokes by hash", () => {
      const tok = createBypassToken("to-revoke");
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
      const tok = createBypassToken("usage-test");
      const before = listBypassTokens()[0];
      expect(before.usageCount).toBe(0);
      expect(before.lastUsedAt).toBeUndefined();

      isBypassToken(tok);
      const after = listBypassTokens()[0];
      expect(after.usageCount).toBe(1);
      expect(after.lastUsedAt).toBeDefined();
      expect(after.lastUsedAt).toBeGreaterThan(0);
    });
  });
});
