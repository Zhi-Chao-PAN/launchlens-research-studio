import { describe, beforeEach, it, expect } from "vitest";
import {
  createShareToken,
  getShareToken,
  getSharedRun,
  revokeShareToken,
  getSharesForRun,
  getShareStats,
} from "@/lib/research/share-tokens";
import { saveResearchRun } from "@/lib/research/storage";

describe("share tokens", () => {
  beforeEach(() => {
    // Create test runs
    saveResearchRun({
      id: "share-test-1",
      query: "test research",
      keywords: ["test"],
      result: '{"execSummary": "test"}',
      provider: "mock",
      model: "test",
      createdAt: 1000,
      durationMs: 500,
      status: "completed",
    });
  });

  it("creates a share token", () => {
    const share = createShareToken("share-test-1");
    expect(share.token).toBeTruthy();
    expect(share.runId).toBe("share-test-1");
    expect(share.views).toBe(0);
    expect(share.revoked).toBe(false);
    expect(share.expiresAt).toBeNull();
  });

  it("creates share with expiration", () => {
    const share = createShareToken("share-test-1", { expiresInMs: 3600000 });
    expect(share.expiresAt).toBeGreaterThan(Date.now());
    expect(share.expiresAt).toBeLessThan(Date.now() + 7200000);
  });

  it("creates share with max views", () => {
    const share = createShareToken("share-test-1", { maxViews: 3 });
    expect(share.maxViews).toBe(3);
  });

  it("retrieves share by token", () => {
    const created = createShareToken("share-test-1");
    const retrieved = getShareToken(created.token);
    expect(retrieved).not.toBeNull();
    expect(retrieved?.runId).toBe("share-test-1");
  });

  it("returns null for non-existent token", () => {
    expect(getShareToken("nonexistent")).toBeNull();
  });

  it("revokes a share token", () => {
    const share = createShareToken("share-test-1");
    expect(revokeShareToken(share.token)).toBe(true);
    expect(getShareToken(share.token)).toBeNull();
  });

  it("returns false for revoking non-existent token", () => {
    expect(revokeShareToken("nonexistent")).toBe(false);
  });

  it("gets shared run and increments views", () => {
    const share = createShareToken("share-test-1");
    const result = getSharedRun(share.token);
    expect(result).not.toBeNull();
    expect(result?.run.id).toBe("share-test-1");
    expect(result?.share.views).toBe(1);

    // Check view count incremented
    const retrieved = getShareToken(share.token);
    expect(retrieved?.views).toBe(1);
  });

  it("gets shares for a run", () => {
    createShareToken("share-test-1");
    createShareToken("share-test-1");
    const shares = getSharesForRun("share-test-1");
    expect(shares.length).toBeGreaterThanOrEqual(2);
    expect(shares.every((s) => s.runId === "share-test-1")).toBe(true);
  });

  it("returns empty array for run with no shares", () => {
    expect(getSharesForRun("no-shares")).toEqual([]);
  });

  it("gets share stats", () => {
    const stats = getShareStats();
    expect(typeof stats.total).toBe("number");
    expect(typeof stats.active).toBe("number");
    expect(typeof stats.totalViews).toBe("number");
  });

  it("enforces max views limit", () => {
    const share = createShareToken("share-test-1", { maxViews: 2 });
    
    getSharedRun(share.token); // view 1
    getSharedRun(share.token); // view 2
    const third = getSharedRun(share.token); // view 3 - should fail
    expect(third).toBeNull();
  });

  it("expired share returns null", () => {
    const share = createShareToken("share-test-1", { expiresInMs: -1000 }); // already expired
    expect(getShareToken(share.token)).toBeNull();
  });
});