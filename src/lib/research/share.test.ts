/// <reference types="vitest/globals" />
﻿import { describe, beforeEach, it, expect } from "vitest";
import {
  createShareToken,
  getShareToken,
  getSharedRun,
  revokeShareToken,
  getSharesForRun,
  getShareStats,
  createFolderShareToken,
  getFolderShareToken,
  getSharesForFolder,
  revokeSharesForFolder,
  createPasswordShareToken,
  verifyPasswordShare,
  getPasswordProtectedRun,
  hashSharePassword,
  updateShareMetadata,
  getShareMetadata,
  revokeSharesForRun,
  revokeExpiredShares,
  revokeAllShares,
  getDetailedShareStats,
  _resetShareTokens,
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

describe("folder share tokens", () => {
  beforeEach(() => {
    _resetShareTokens();
  });

  it("creates a folder share token", () => {
    const share = createFolderShareToken("folder-123");
    expect(share.token).toBeTruthy();
    expect(share.type).toBe("folder");
    expect(share.folderId).toBe("folder-123");
    expect(share.includeNotes).toBe(true);
    expect(share.revoked).toBe(false);
  });

  it("creates folder share with options", () => {
    const share = createFolderShareToken("folder-123", {
      expiresInMs: 3600000,
      maxViews: 10,
      includeNotes: false,
      name: "My Shared Folder",
      description: "Research results",
    });
    expect(share.expiresAt).toBeGreaterThan(Date.now());
    expect(share.maxViews).toBe(10);
    expect(share.includeNotes).toBe(false);
  });

  it("retrieves folder share by token", () => {
    const created = createFolderShareToken("f1");
    const retrieved = getFolderShareToken(created.token);
    expect(retrieved).not.toBeNull();
    expect(retrieved?.folderId).toBe("f1");
    expect(retrieved?.type).toBe("folder");
  });

  it("returns null for regular run share via getFolderShareToken", () => {
    const runShare = createShareToken("run-1");
    expect(getFolderShareToken(runShare.token)).toBeNull();
  });

  it("gets all shares for a folder", () => {
    createFolderShareToken("f1");
    createFolderShareToken("f1");
    createFolderShareToken("f2");
    const shares = getSharesForFolder("f1");
    expect(shares.length).toBe(2);
    expect(shares.every((s) => (s as unknown as { folderId: string }).folderId === "f1")).toBe(true);
  });

  it("revokes all shares for a folder", () => {
    createFolderShareToken("f1");
    createFolderShareToken("f1");
    createFolderShareToken("f2");

    const revoked = revokeSharesForFolder("f1");
    expect(revoked).toBe(2);

    const remaining = getSharesForFolder("f1");
    expect(remaining.every((s) => s.revoked)).toBe(true);

    const f2Shares = getSharesForFolder("f2");
    expect(f2Shares.every((s) => !s.revoked)).toBe(true);
  });
});

describe("password-protected shares", () => {
  beforeEach(() => {
    _resetShareTokens();
    saveResearchRun({
      id: "pw-share-run",
      query: "password test",
      keywords: ["test"],
      result: "secret result",
      provider: "mock",
      model: "test",
      createdAt: 1000,
      durationMs: 500,
      status: "completed",
    });
  });

  it("hashes passwords consistently", () => {
    const h1 = hashSharePassword("mysecret");
    const h2 = hashSharePassword("mysecret");
    expect(h1).toBe(h2);
    expect(h1.length).toBe(64);
  });

  it("different passwords have different hashes", () => {
    expect(hashSharePassword("pass1")).not.toBe(hashSharePassword("pass2"));
  });

  it("creates a password-protected share", () => {
    const share = createPasswordShareToken("pw-share-run", "secret123");
    expect(share.token).toBeTruthy();
    expect((share as any).passwordHash).toBeTruthy();
    expect((share as any).passwordHash).toBe(hashSharePassword("secret123"));
  });

  it("verifies correct password", () => {
    const share = createPasswordShareToken("pw-share-run", "mypassword");
    const verified = verifyPasswordShare(share.token, "mypassword");
    expect(verified).not.toBeNull();
    expect(verified?.token).toBe(share.token);
  });

  it("rejects wrong password", () => {
    const share = createPasswordShareToken("pw-share-run", "correct");
    expect(verifyPasswordShare(share.token, "wrong")).toBeNull();
  });

  it("non-password share passes verification with any password", () => {
    const share = createShareToken("pw-share-run");
    const verified = verifyPasswordShare(share.token, "anything");
    expect(verified).not.toBeNull();
  });

  it("gets shared run with correct password and increments views", () => {
    const share = createPasswordShareToken("pw-share-run", "letmein");
    const result = getPasswordProtectedRun(share.token, "letmein");
    expect(result).not.toBeNull();
    expect(result?.run.id).toBe("pw-share-run");
    expect(result?.share.views).toBe(1);
  });

  it("rejects shared run with wrong password", () => {
    const share = createPasswordShareToken("pw-share-run", "letmein");
    const result = getPasswordProtectedRun(share.token, "wrongpass");
    expect(result).toBeNull();
  });
});

describe("share metadata", () => {
  beforeEach(() => {
    _resetShareTokens();
  });

  it("updates share name and description", () => {
    const share = createShareToken("run-1");
    const updated = updateShareMetadata(share.token, {
      name: "Q3 Market Analysis",
      description: "Full research report on Q3 trends",
    });
    expect(updated).not.toBeNull();

    const meta = getShareMetadata(updated!);
    expect(meta.name).toBe("Q3 Market Analysis");
    expect(meta.description).toBe("Full research report on Q3 trends");
  });

  it("returns empty strings for shares without metadata", () => {
    const share = createShareToken("run-1");
    const meta = getShareMetadata(share);
    expect(meta.name).toBe("");
    expect(meta.description).toBe("");
  });

  it("returns null for updating non-existent share", () => {
    expect(updateShareMetadata("nonexistent", { name: "x" })).toBeNull();
  });
});

describe("bulk operations", () => {
  beforeEach(() => {
    _resetShareTokens();
  });

  it("revokes all shares for a run", () => {
    createShareToken("run-a");
    createShareToken("run-a");
    createShareToken("run-b");

    const revoked = revokeSharesForRun("run-a");
    expect(revoked).toBe(2);
  });

  it("revokes expired shares only", () => {
    createShareToken("run-1", { expiresInMs: 3600000 });
    createShareToken("run-2", { expiresInMs: -1000 });

    const revoked = revokeExpiredShares();
    expect(revoked).toBe(1);
  });

  it("revokes all shares", () => {
    createShareToken("r1");
    createShareToken("r2");
    createFolderShareToken("f1");

    const revoked = revokeAllShares();
    expect(revoked).toBe(3);
  });
});

describe("detailed share stats", () => {
  beforeEach(() => {
    _resetShareTokens();
  });

  it("returns zeroed stats when no shares exist", () => {
    const stats = getDetailedShareStats();
    expect(stats.total).toBe(0);
    expect(stats.active).toBe(0);
    expect(stats.revoked).toBe(0);
    expect(stats.expired).toBe(0);
    expect(stats.runShares).toBe(0);
    expect(stats.folderShares).toBe(0);
    expect(stats.passwordProtected).toBe(0);
  });

  it("counts different share types correctly", () => {
    createShareToken("run-1");
    createShareToken("run-2");
    createFolderShareToken("f1");

    const stats = getDetailedShareStats();
    expect(stats.total).toBe(3);
    expect(stats.active).toBe(3);
    expect(stats.runShares).toBe(2);
    expect(stats.folderShares).toBe(1);
    expect(stats.passwordProtected).toBe(0);
  });

  it("counts revoked and expired shares", () => {
    createShareToken("run-1");
    createShareToken("run-2", { expiresInMs: -1000 });
    createShareToken("run-3");
    revokeSharesForRun("run-3");

    const stats = getDetailedShareStats();
    expect(stats.total).toBe(3);
    expect(stats.active).toBe(1);
    expect(stats.expired).toBe(1);
    expect(stats.revoked).toBe(1);
  });

  it("counts password-protected shares", () => {
    createPasswordShareToken("run-1", "pass1");
    createShareToken("run-2");

    const stats = getDetailedShareStats();
    expect(stats.passwordProtected).toBe(1);
    expect(stats.runShares).toBe(2);
  });
});

import {
  inspectShareUrl,
  buildSocialShareLinks,
  buildEmbedSnippet,
  createShareEvent,
  summarizeShares,
  encodeShareToken,
  decodeShareToken,
  isShareTokenExpired,
  isValidShareUrl,
  extractSessionsFromUrls,
} from '@/lib/research/share';

describe('share url helpers (round 147)', () => {
  it('inspects a valid https share url and returns session info', () => {
    const info = inspectShareUrl('https://example.com/app#share:sess_abc123');
    expect(info).not.toBeNull();
    expect(info!.sessionId).toBe('sess_abc123');
    expect(info!.isSecure).toBe(true);
    expect(info!.hash).toBe('#share:sess_abc123');
    expect(info!.url).toContain('https://example.com/app');
  });

  it('returns null from inspectShareUrl for urls without share hash', () => {
    expect(inspectShareUrl('https://example.com/app#other')).toBeNull();
    expect(inspectShareUrl('https://example.com/app')).toBeNull();
  });

  it('returns null for malformed url strings', () => {
    expect(inspectShareUrl('not a url')).toBeNull();
    expect(inspectShareUrl('')).toBeNull();
  });

  it('rejects share hashes with invalid characters', () => {
    expect(inspectShareUrl('https://x.com/#share:bad id!')).toBeNull();
  });

  it('builds social share links with encoded url and default title', () => {
    const links = buildSocialShareLinks('https://example.com/r?s=1');
    expect(links.twitter).toContain('twitter.com/intent/tweet');
    expect(links.twitter).toContain(encodeURIComponent('https://example.com/r?s=1'));
    expect(links.linkedin).toContain('linkedin.com');
    expect(links.email).toMatch(/^mailto:/);
    expect(links.reddit).toContain('reddit.com');
    expect(links.twitter).toContain(encodeURIComponent('LaunchLens research'));
  });

  it('uses custom title when provided', () => {
    const links = buildSocialShareLinks('https://x.com/', 'My Report');
    expect(links.twitter).toContain(encodeURIComponent('My Report'));
    expect(links.email).toContain(encodeURIComponent('My Report'));
  });

  it('builds fixed-size iframe embed snippet', () => {
    const snip = buildEmbedSnippet('sid-1', 'https://app.example.com', { width: 640, height: 480 });
    expect(snip).toContain('<iframe');
    expect(snip).toContain('src="https://app.example.com/embed/sid-1"');
    expect(snip).toContain('width="640"');
    expect(snip).toContain('height="480"');
    expect(snip).toContain('loading="lazy"');
    expect(snip).not.toContain('padding-top');
  });

  it('normalizes trailing slash on the base url in the embed snippet', () => {
    const snip = buildEmbedSnippet('sid-2', 'https://app.example.com/');
    expect(snip).toContain('src="https://app.example.com/embed/sid-2"');
  });

  it('builds a responsive embed snippet when asked', () => {
    const snip = buildEmbedSnippet('sid-3', 'https://app.example.com', { responsive: true });
    expect(snip).toContain('padding-top:56.25%');
    expect(snip).toContain('position:absolute');
    expect(snip).not.toContain('width="800"');
  });

  it('creates share events with unique ids and millisecond timestamps', () => {
    const before = Date.now();
    const a = createShareEvent('sess-x', 'twitter');
    const b = createShareEvent('sess-x', 'copy', { via: 'button' });
    const after = Date.now();
    expect(a.id).toMatch(/^evt-/);
    expect(b.id).not.toBe(a.id);
    expect(a.channel).toBe('twitter');
    expect(b.metadata).toEqual({ via: 'button' });
    expect(a.timestamp).toBeGreaterThanOrEqual(before);
    expect(a.timestamp).toBeLessThanOrEqual(after);
  });

  it('summarizes share events by channel with first/last timestamps', () => {
    const evts = [
      { id: '1', sessionId: 's', channel: 'twitter' as const, timestamp: 100 },
      { id: '2', sessionId: 's', channel: 'copy' as const,    timestamp: 200 },
      { id: '3', sessionId: 's', channel: 'twitter' as const, timestamp: 300 },
    ];
    const s = summarizeShares(evts);
    expect(s.totalShares).toBe(3);
    expect(s.byChannel).toEqual({ twitter: 2, copy: 1 });
    expect(s.firstSharedAt).toBe(100);
    expect(s.lastSharedAt).toBe(300);
  });

  it('returns zeroed summary for empty event list', () => {
    const s = summarizeShares([]);
    expect(s.totalShares).toBe(0);
    expect(s.byChannel).toEqual({});
    expect(s.firstSharedAt).toBeUndefined();
    expect(s.lastSharedAt).toBeUndefined();
  });

  it('round-trips a share token through encode/decode', () => {
    const payload = { sessionId: 'ses-9', createdAt: 1234567890 };
    const token = encodeShareToken(payload);
    expect(typeof token).toBe('string');
    expect(token.length).toBeGreaterThan(0);
    const decoded = decodeShareToken(token);
    expect(decoded).toEqual(payload);
  });

  it('decodes tokens with unicode content safely', () => {
    const payload = { sessionId: 'ses-u', createdAt: 1, note: 'note with symbols <>&' };
    const token = encodeShareToken(payload);
    const decoded = decodeShareToken(token);
    expect(decoded!.sessionId).toBe('ses-u');
    expect((decoded! as typeof decoded & { note: string }).note).toBe('note with symbols <>&');
  });

  it('returns null for invalid tokens', () => {
    expect(decodeShareToken('!!!not-base64!!!')).toBeNull();
    expect(decodeShareToken('')).toBeNull();
  });

  it('considers tokens expired based on explicit expiresAt', () => {
    expect(isShareTokenExpired({ sessionId: 's', createdAt: 0, expiresAt: 100 }, 200)).toBe(true);
    expect(isShareTokenExpired({ sessionId: 's', createdAt: 0, expiresAt: 500 }, 200)).toBe(false);
  });

  it('considers tokens expired based on ttlDays when no expiresAt', () => {
    const day = 86400000;
    expect(isShareTokenExpired({ sessionId: 's', createdAt: 0, ttlDays: 1 }, 2 * day)).toBe(true);
    expect(isShareTokenExpired({ sessionId: 's', createdAt: 0, ttlDays: 7 }, 2 * day)).toBe(false);
  });

  it('returns not expired when no expiration info is present', () => {
    expect(isShareTokenExpired({ sessionId: 's', createdAt: 0 }, Date.now())).toBe(false);
  });

  it('validates share urls and returns false for plain urls', () => {
    expect(isValidShareUrl('https://example.com/app#share:abc123')).toBe(true);
    expect(isValidShareUrl('https://example.com/app')).toBe(false);
    expect(isValidShareUrl('garbage')).toBe(false);
  });

  it('extracts unique session ids from urls in order, skipping invalid and duplicates', () => {
    const urls = [
      'https://a.com/#share:alpha',
      'https://b.com/#share:beta',
      'https://c.com/no-share',
      'https://d.com/#share:alpha',
      'broken',
      'https://e.com/#share:gamma',
    ];
    expect(extractSessionsFromUrls(urls)).toEqual(['alpha', 'beta', 'gamma']);
  });

  it('returns empty array for empty or invalid input list', () => {
    expect(extractSessionsFromUrls([])).toEqual([]);
    expect(extractSessionsFromUrls(['not a url', 'https://plain.site/'])).toEqual([]);
  });
});
