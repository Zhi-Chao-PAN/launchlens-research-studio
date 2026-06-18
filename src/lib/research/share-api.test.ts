import { describe, it, expect } from "vitest";
import {
  buildShareUrl,
  buildShareUrlForBase,
  formatExpiryLabel,
  getShareStatus,
  summarizeShareInfo,
  validateShareCreateOptions,
  shareInfoToCsv,
  shareInfoEqual,
  filterShareInfo,
} from "@/lib/research/share-api";

const NOW = 1_700_000_000_000;
const mk = (o: any = {}): any => ({
  token: "tk1", runId: "r1", createdAt: NOW - 1000, expiresAt: null, views: 0, maxViews: null, revoked: false, ...o,
});

describe("share-api pure helpers (round 161)", () => {
  it("buildShareUrl / buildShareUrlForBase produce correct URLs", () => {
    expect(buildShareUrlForBase("abc", "https://example.com")).toBe("https://example.com/share/abc");
    expect(buildShareUrlForBase("abc", "https://example.com/")).toBe("https://example.com/share/abc");
    // SSR path falls through to relative
    expect(buildShareUrl("abc")).toBe("/share/abc");
  });

  it("formatExpiryLabel renders human labels", () => {
    expect(formatExpiryLabel(null, NOW)).toBe("永不过期");
    expect(formatExpiryLabel(NOW - 1, NOW)).toBe("已过期");
    expect(formatExpiryLabel(NOW + 30_000, NOW)).toBe("0 分钟后过期");
    expect(formatExpiryLabel(NOW + 2 * 60 * 60 * 1000, NOW)).toBe("2 小时后过期");
    expect(formatExpiryLabel(NOW + 3 * 24 * 60 * 60 * 1000, NOW)).toBe("3 天后过期");
    expect(formatExpiryLabel(NOW + 60 * 24 * 60 * 60 * 1000, NOW)).toBe("2 个月后过期");
  });

  it("getShareStatus classifies active/expired/maxed/revoked", () => {
    expect(getShareStatus(mk(), NOW)).toBe("active");
    expect(getShareStatus(mk({ expiresAt: NOW - 1 }), NOW)).toBe("expired");
    expect(getShareStatus(mk({ maxViews: 5, views: 5 }), NOW)).toBe("maxed");
    expect(getShareStatus(mk({ revoked: true }), NOW)).toBe("revoked");
  });

  it("summarizeShareInfo aggregates counts", () => {
    const list = [
      mk(), mk({ token: "t2", revoked: true }), mk({ token: "t3", expiresAt: NOW - 1, views: 3 }), mk({ token: "t4", maxViews: 2, views: 2 }),
    ];
    const s = summarizeShareInfo(list, NOW);
    expect(s.total).toBe(4);
    expect(s.active).toBe(1);
    expect(s.revoked).toBe(1);
    expect(s.expired).toBe(1);
    expect(s.maxed).toBe(1);
    expect(s.totalViews).toBe(5);
  });

  it("validateShareCreateOptions clamps and throws", () => {
    expect(validateShareCreateOptions({ expiresInMs: 1000 }).expiresInMs).toBe(60_000);
    expect(validateShareCreateOptions({ expiresInMs: 1e12 }).expiresInMs).toBe(365 * 24 * 60 * 60 * 1000);
    expect(() => validateShareCreateOptions({ runId: "  " })).toThrow();
    expect(() => validateShareCreateOptions({ maxViews: 0 })).toThrow();
    expect(validateShareCreateOptions({ runId: "r1", maxViews: 5 }).maxViews).toBe(5);
  });

  it("shareInfoToCsv emits header and status", () => {
    const csv = shareInfoToCsv([mk()], NOW);
    const [header, row] = csv.split("\n");
    expect(header).toContain("token,runId,status");
    expect(row).toContain("active");
  });

  it("shareInfoEqual compares fields", () => {
    expect(shareInfoEqual(mk(), mk())).toBe(true);
    expect(shareInfoEqual(mk(), mk({ views: 1 }))).toBe(false);
    expect(shareInfoEqual(mk(), mk({ token: "x" }))).toBe(false);
  });

  it("filterShareInfo filters by status/runId/token", () => {
    const list = [mk(), mk({ token: "t2", revoked: true }), mk({ token: "zzz", runId: "other" })];
    expect(filterShareInfo(list, { status: "revoked" }, NOW).length).toBe(1);
    expect(filterShareInfo(list, { runId: "other" }).length).toBe(1);
    expect(filterShareInfo(list, { token: "zz" }).length).toBe(1);
    expect(filterShareInfo(list).length).toBe(3);
  });
});
