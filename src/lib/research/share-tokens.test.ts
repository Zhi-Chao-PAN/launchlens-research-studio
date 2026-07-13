import { describe, it, expect, beforeEach } from "vitest";
import {
  _resetShareTokens,
  createShareToken,
  createFolderShareToken,
  createPasswordShareToken,
  hashSharePassword,
  getShareType,
  getShareHealth,
  shareRemainingMs,
  shareViewsRemaining,
  summarizeShareToken,
  summarizeShares,
  validateShareOptions,
  sharesToCsv,
  sharesEqual,
  searchShares,
  toPublicShareView,
} from "@/lib/research/share-tokens";

const NOW = 1_700_000_000_000;
beforeEach(() => {
  _resetShareTokens();
});

describe("share-tokens pure helpers (round 158)", () => {
  const mk = (overrides: any = {}): any => ({
    token: "t1", runId: "r1", createdAt: NOW, expiresAt: null,
    views: 0, maxViews: null, revoked: false, ...overrides,
  });

  it("getShareType classifies run/folder/password", () => {
    expect(getShareType(mk())).toBe("run");
    expect(getShareType(mk({ type: "folder", folderId: "f1" }))).toBe("folder");
    expect(getShareType(mk({ passwordHash: "abc" }))).toBe("password");
  });

  it("getShareHealth returns active/expired/maxed/revoked", () => {
    expect(getShareHealth(mk(), NOW)).toBe("active");
    expect(getShareHealth(mk({ expiresAt: NOW - 1 }), NOW)).toBe("expired");
    expect(getShareHealth(mk({ maxViews: 5, views: 5 }), NOW)).toBe("maxed");
    expect(getShareHealth(mk({ revoked: true }), NOW)).toBe("revoked");
  });

  it("shareRemainingMs / shareViewsRemaining compute remaining values", () => {
    expect(shareRemainingMs(mk({ expiresAt: NOW + 5000 }), NOW)).toBe(5000);
    expect(shareRemainingMs(mk(), NOW)).toBeNull();
    expect(shareRemainingMs(mk({ revoked: true, expiresAt: NOW + 5000 }), NOW)).toBeNull();
    expect(shareViewsRemaining(mk({ maxViews: 5, views: 2 }))).toBe(3);
    expect(shareViewsRemaining(mk())).toBeNull();
  });

  it("summarizeShareToken assembles full summary", () => {
    const s = summarizeShareToken(mk({ createdAt: NOW - 1000, maxViews: 10, views: 3, name: "my share" }), NOW);
    expect(s.health).toBe("active");
    expect(s.viewsRemaining).toBe(7);
    expect(s.ageMs).toBe(1000);
    expect(s.name).toBe("my share");
    expect(s.type).toBe("run");
    expect(s.hasPassword).toBe(false);
  });

  it("summarizeShares aggregates across tokens", () => {
    const tokens = [
      mk(),
      mk({ token: "t2", revoked: true }),
      mk({ token: "t3", expiresAt: NOW - 1, views: 2 }),
      mk({ token: "t4", maxViews: 5, views: 5 }),
      mk({ token: "t5", type: "folder", folderId: "f" }),
      mk({ token: "t6", passwordHash: "x" }),
    ];
    const sum = summarizeShares(tokens, NOW);
    expect(sum.total).toBe(6);
    expect(sum.active).toBe(3);
    expect(sum.revoked).toBe(1);
    expect(sum.expired).toBe(1);
    expect(sum.maxed).toBe(1);
    expect(sum.totalViews).toBe(7);
    expect(sum.folderShares).toBe(1);
    expect(sum.passwordShares).toBe(1);
    expect(sum.runShares).toBe(4);
  });

  it("validateShareOptions clamps bounds and rejects bad input", () => {
    expect(validateShareOptions({ expiresInMs: 1000 }).expiresInMs).toBe(60_000);
    expect(validateShareOptions({ expiresInMs: 1e12 }).expiresInMs).toBe(365 * 24 * 60 * 60 * 1000);
    expect(validateShareOptions({ maxViews: 10 }).maxViews).toBe(10);
    expect(() => validateShareOptions({ expiresInMs: -1 })).toThrow();
    expect(() => validateShareOptions({ maxViews: 0 })).toThrow();
    expect(validateShareOptions({ name: "  hi  " }).name).toBe("hi");
  });

  it("sharesToCsv includes header and rows", () => {
    const csv = sharesToCsv([mk({ name: "ok" })], NOW);
    const [header, row] = csv.split("\n");
    expect(header).toContain("token,runId,type");
    expect(row).toContain("t1,r1");
  });

  it("sharesEqual deep compares fields and discriminates variants", () => {
    const a = mk({ name: "x" });
    expect(sharesEqual(a, { ...a })).toBe(true);
    expect(sharesEqual(a, { ...a, views: 1 })).toBe(false);
    expect(sharesEqual(a, { ...a, name: "y" })).toBe(false);
    expect(sharesEqual(a, { ...a, type: "folder", folderId: "f1" })).toBe(false);
    expect(sharesEqual(a, { ...a, passwordHash: "x" })).toBe(false);
  });

  it("searchShares matches token/runId/name", () => {
    const tokens = [mk(), mk({ token: "abc123", runId: "rX", name: "mine" })];
    expect(searchShares(tokens, "abc").length).toBe(1);
    expect(searchShares(tokens, "mine").length).toBe(1);
    expect(searchShares(tokens, "rX").length).toBe(1);
    expect(searchShares(tokens, "  ").length).toBe(2);
  });

  it("toPublicShareView strips all bearer and password credentials", () => {
    const s = mk({
      token: "full-bearer-token",
      passwordHash: hashSharePassword("pw"),
      name: "secret",
    });
    const pub: any = toPublicShareView(s);
    expect(pub.token).toBeUndefined();
    expect(pub.passwordHash).toBeUndefined();
    expect(pub.shareId).toMatch(/^[a-f0-9]{64}$/);
    expect(pub.shareId).not.toContain("full-bearer-token");
    expect(pub.hasPassword).toBe(true);
    expect(pub.type).toBe("password");
    expect(pub.name).toBe("secret");
  });

  it("live tokens created via factories are classified correctly", () => {
    const r = createShareToken("run1", { expiresInMs: 60_000 });
    const f = createFolderShareToken("f1");
    const p = createPasswordShareToken("run2", "pw");
    expect(getShareType(r)).toBe("run");
    expect(getShareType(f)).toBe("folder");
    expect(getShareType(p)).toBe("password");
    expect(getShareHealth(r)).toBe("active");
  });
});
