/**
 * Server-side share token management.
 * Generates short-lived public tokens for sharing research results
 * without requiring admin authentication.
 * Persisted to disk if LAUNCHLENS_STORAGE_DIR is set.
 */

import crypto from "crypto";
import { getResearchRun, type ResearchRun } from "./storage";

export interface ShareToken {
  token: string;
  runId: string;
  createdAt: number;
  expiresAt: number | null;
  views: number;
  maxViews: number | null;
  revoked: boolean;
  name?: string;
  description?: string;
}

const shareTokens = new Map<string, ShareToken>();

let shareStoragePath: string | null = null;

// Lazy-loaded fs/path for server-side disk persistence
let fsModule: typeof import("fs") | null = null;
let pathModule: typeof import("path") | null = null;

function getFs(): typeof import("fs") | null {
  if (typeof window !== "undefined") return null;
  if (fsModule) return fsModule;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    fsModule = require("fs");
    return fsModule;
  } catch {
    return null;
  }
}

function getPath(): typeof import("path") | null {
  if (typeof window !== "undefined") return null;
  if (pathModule) return pathModule;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    pathModule = require("path");
    return pathModule;
  } catch {
    return null;
  }
}

// Initialize disk persistence if storage dir configured
if (typeof window === "undefined" && process.env.LAUNCHLENS_STORAGE_DIR) {
  const fs = getFs();
  const path = getPath();
  if (fs && path) {
    const dir = process.env.LAUNCHLENS_STORAGE_DIR;
    try {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    } catch {
      // ignore
    }
    shareStoragePath = path.join(dir, "share-tokens.json");
    if (fs.existsSync(shareStoragePath)) {
      try {
        const data = JSON.parse(fs.readFileSync(shareStoragePath, "utf8"));
        for (const token of data) {
          shareTokens.set(token.token, token);
        }
      } catch {
        // Corrupted file, start fresh
      }
    }
  }
}

function persistShares() {
  if (!shareStoragePath || typeof window !== "undefined") return;
  const fs = getFs();
  if (!fs) return;
  try {
    const all = Array.from(shareTokens.values());
    fs.writeFileSync(shareStoragePath, JSON.stringify(all, null, 2));
  } catch {
    // Best effort
  }
}

export function createShareToken(
  runId: string,
  options: { expiresInMs?: number; maxViews?: number } = {},
): ShareToken {
  const token = crypto.randomBytes(12).toString("base64url");
  const now = Date.now();
  
  const share: ShareToken = {
    token,
    runId,
    createdAt: now,
    expiresAt: options.expiresInMs ? now + options.expiresInMs : null,
    views: 0,
    maxViews: options.maxViews || null,
    revoked: false,
  };

  shareTokens.set(token, share);
  persistShares();
  
  return share;
}

export function getShareToken(token: string): ShareToken | null {
  const share = shareTokens.get(token);
  if (!share) return null;
  if (share.revoked) return null;
  if (share.expiresAt && Date.now() > share.expiresAt) return null;
  if (share.maxViews && share.views >= share.maxViews) return null;
  return share;
}

export function getSharedRun(token: string): { run: ResearchRun; share: ShareToken } | null {
  const share = getShareToken(token);
  if (!share) return null;

  const run = getResearchRun(share.runId);
  if (!run) return null;

  share.views++;
  shareTokens.set(token, share);
  persistShares();

  return { run, share };
}

export function revokeShareToken(token: string): boolean {
  const share = shareTokens.get(token);
  if (!share) return false;
  
  share.revoked = true;
  shareTokens.set(token, share);
  persistShares();
  
  return true;
}

export function getSharesForRun(runId: string): ShareToken[] {
  return Array.from(shareTokens.values())
    .filter((s) => s.runId === runId)
    .sort((a, b) => b.createdAt - a.createdAt);
}

export function getShareStats(): { total: number; active: number; totalViews: number } {
  const all = Array.from(shareTokens.values());
  const active = all.filter((s) => !s.revoked && (!s.expiresAt || Date.now() < s.expiresAt));
  const totalViews = all.reduce((sum, s) => sum + s.views, 0);
  
  return {
    total: all.length,
    active: active.length,
    totalViews,
  };
}


// ============================================================
// Folder-level sharing
// ============================================================

export interface FolderShareToken extends ShareToken {
  type: "folder";
  folderId: string;
  includeNotes?: boolean;
}

function isFolderShare(share: ShareToken): share is FolderShareToken {
  return (share as FolderShareToken).type === "folder";
}

export function createFolderShareToken(
  folderId: string,
  options: {
    expiresInMs?: number;
    maxViews?: number;
    includeNotes?: boolean;
    name?: string;
    description?: string;
  } = {},
): FolderShareToken {
  const token = crypto.randomBytes(12).toString("base64url");
  const now = Date.now();

  const share: FolderShareToken = {
    token,
    runId: "", // unused for folder shares, kept for interface compat
    type: "folder",
    folderId,
    includeNotes: options.includeNotes ?? true,
    createdAt: now,
    expiresAt: options.expiresInMs ? now + options.expiresInMs : null,
    views: 0,
    maxViews: options.maxViews || null,
    revoked: false,
  };

  share.name = options.name || "";
  share.description = options.description || "";

  shareTokens.set(token, share as ShareToken);
  persistShares();

  return share;
}

export function getFolderShareToken(token: string): FolderShareToken | null {
  const share = getShareToken(token);
  if (!share) return null;
  if (!isFolderShare(share)) return null;
  return share;
}

export function getSharesForFolder(folderId: string): ShareToken[] {
  return Array.from(shareTokens.values())
    .filter((s) => isFolderShare(s) && (s as FolderShareToken).folderId === folderId)
    .sort((a, b) => b.createdAt - a.createdAt);
}

export function revokeSharesForFolder(folderId: string): number {
  let count = 0;
  for (const [token, share] of shareTokens) {
    if (isFolderShare(share) && (share as FolderShareToken).folderId === folderId && !share.revoked) {
      share.revoked = true;
      shareTokens.set(token, share);
      count++;
    }
  }
  if (count > 0) persistShares();
  return count;
}

// ============================================================
// Password-protected shares
// ============================================================

/**
 * Hash a share password using SHA-256.
 * Returns hex string for storage.
 */
export function hashSharePassword(password: string): string {
  return crypto.createHash("sha256").update(password).digest("hex");
}

export interface PasswordProtectedShareToken extends ShareToken {
  passwordHash: string;
}

function isPasswordProtected(share: ShareToken): share is PasswordProtectedShareToken {
  return !!(share as PasswordProtectedShareToken).passwordHash;
}

/**
 * Create a password-protected share for a run.
 * Password is hashed with SHA-256 before storage.
 */
export function createPasswordShareToken(
  runId: string,
  password: string,
  options: { expiresInMs?: number; maxViews?: number } = {},
): ShareToken {
  const share = createShareToken(runId, options);
  (share as PasswordProtectedShareToken).passwordHash = hashSharePassword(password);
  shareTokens.set(share.token, share);
  persistShares();
  return share;
}

/**
 * Verify password for a password-protected share.
 * Returns the share if valid, null otherwise.
 */
export function verifyPasswordShare(token: string, password: string): ShareToken | null {
  const share = shareTokens.get(token);
  if (!share || share.revoked) return null;
  if (share.expiresAt && Date.now() > share.expiresAt) return null;
  if (share.maxViews && share.views >= share.maxViews) return null;

  if (!isPasswordProtected(share)) {
    // Not password-protected — return as-is
    return share;
  }

  const hash = hashSharePassword(password);
  if (hash !== share.passwordHash) return null;

  return share;
}

/**
 * Access a password-protected shared run.
 * Increments view count on success.
 */
export function getPasswordProtectedRun(
  token: string,
  password: string,
): { run: ResearchRun; share: ShareToken } | null {
  const share = verifyPasswordShare(token, password);
  if (!share) return null;

  const run = getResearchRun(share.runId);
  if (!run) return null;

  share.views++;
  shareTokens.set(token, share);
  persistShares();

  return { run, share };
}

// ============================================================
// Share metadata (name + description)
// ============================================================

export function updateShareMetadata(
  token: string,
  metadata: { name?: string; description?: string },
): ShareToken | null {
  const share = shareTokens.get(token);
  if (!share || share.revoked) return null;

  if (metadata.name !== undefined) {
    share.name = metadata.name;
  }
  if (metadata.description !== undefined) {
    share.description = metadata.description;
  }

  shareTokens.set(token, share);
  persistShares();
  return share;
}

export function getShareMetadata(share: ShareToken): { name: string; description: string } {
  return {
    name: share.name || "",
    description: share.description || "",
  };
}

// ============================================================
// Bulk operations
// ============================================================

export interface BulkRevokeResult {
  revoked: number;
  total: number;
}

/**
 * Bulk revoke all shares for a run.
 */
export function revokeSharesForRun(runId: string): number {
  let count = 0;
  for (const [token, share] of shareTokens) {
    if (share.runId === runId && !share.revoked) {
      share.revoked = true;
      shareTokens.set(token, share);
      count++;
    }
  }
  if (count > 0) persistShares();
  return count;
}

/**
 * Bulk revoke all expired shares.
 * Returns count of revoked tokens.
 */
export function revokeExpiredShares(): number {
  let count = 0;
  const now = Date.now();
  for (const [token, share] of shareTokens) {
    if (!share.revoked && share.expiresAt && now > share.expiresAt) {
      share.revoked = true;
      shareTokens.set(token, share);
      count++;
    }
  }
  if (count > 0) persistShares();
  return count;
}

/**
 * Revoke all shares (nuclear option).
 */
export function revokeAllShares(): number {
  let count = 0;
  for (const [token, share] of shareTokens) {
    if (!share.revoked) {
      share.revoked = true;
      shareTokens.set(token, share);
      count++;
    }
  }
  if (count > 0) persistShares();
  return count;
}

// ============================================================
// Extended share stats
// ============================================================

export interface DetailedShareStats {
  total: number;
  active: number;
  revoked: number;
  expired: number;
  totalViews: number;
  runShares: number;
  folderShares: number;
  passwordProtected: number;
}

export function getDetailedShareStats(): DetailedShareStats {
  const all = Array.from(shareTokens.values());
  const now = Date.now();

  let active = 0;
  let revoked = 0;
  let expired = 0;
  let runShares = 0;
  let folderShares = 0;
  let passwordProtected = 0;
  let totalViews = 0;

  for (const s of all) {
    totalViews += s.views;

    if (s.revoked) {
      revoked++;
    } else if (s.expiresAt && now > s.expiresAt) {
      expired++;
    } else if (s.maxViews && s.views >= s.maxViews) {
      // max-views exhausted counts as expired
      expired++;
    } else {
      active++;
    }

    if (isFolderShare(s)) {
      folderShares++;
    } else {
      runShares++;
    }

    if (isPasswordProtected(s)) {
      passwordProtected++;
    }
  }

  return {
    total: all.length,
    active,
    revoked,
    expired,
    totalViews,
    runShares,
    folderShares,
    passwordProtected,
  };
}
/**
 * Clear all share tokens from memory.
 * For testing / cleanup purposes only.
 */
export function _resetShareTokens(): void {
  shareTokens.clear();
  persistShares();
}

/* ------------------------------------------------------------------ */
/*  Pure share helpers (round 158) — side-effect free                 */
/* ------------------------------------------------------------------ */

export type ShareHealth = "active" | "expired" | "maxed" | "revoked";

export interface ShareSummary {
  token: string;
  runId: string;
  type: "run" | "folder" | "password";
  health: ShareHealth;
  viewsRemaining: number | null;
  msRemaining: number | null;
  ageMs: number;
  hasPassword: boolean;
  name: string;
}

export function getShareType(share: ShareToken): "run" | "folder" | "password" {
  if (isFolderShare(share)) return "folder";
  if (isPasswordProtected(share)) return "password";
  return "run";
}

/** Pure check of health, does NOT mutate the in-memory store. */
export function getShareHealth(share: ShareToken, nowMs: number = Date.now()): ShareHealth {
  if (share.revoked) return "revoked";
  if (share.expiresAt && nowMs > share.expiresAt) return "expired";
  if (share.maxViews != null && share.views >= share.maxViews) return "maxed";
  return "active";
}

export function shareRemainingMs(share: ShareToken, nowMs: number = Date.now()): number | null {
  if (share.revoked || !share.expiresAt) return null;
  return Math.max(0, share.expiresAt - nowMs);
}

export function shareViewsRemaining(share: ShareToken): number | null {
  if (share.maxViews == null) return null;
  return Math.max(0, share.maxViews - share.views);
}

export function summarizeShareToken(
  share: ShareToken,
  nowMs: number = Date.now(),
): ShareSummary {
  return {
    token: share.token,
    runId: share.runId,
    type: getShareType(share),
    health: getShareHealth(share, nowMs),
    viewsRemaining: shareViewsRemaining(share),
    msRemaining: shareRemainingMs(share, nowMs),
    ageMs: Math.max(0, nowMs - share.createdAt),
    hasPassword: isPasswordProtected(share),
    name: share.name || "",
  };
}

export interface ShareBatchSummary {
  total: number;
  active: number;
  expired: number;
  maxed: number;
  revoked: number;
  totalViews: number;
  folderShares: number;
  passwordShares: number;
  runShares: number;
}

export function summarizeShares(shares: ShareToken[], nowMs: number = Date.now()): ShareBatchSummary {
  const out: ShareBatchSummary = { total: shares.length, active: 0, expired: 0, maxed: 0, revoked: 0, totalViews: 0, folderShares: 0, passwordShares: 0, runShares: 0 };
  for (const s of shares) {
    out.totalViews += s.views;
    const t = getShareType(s);
    if (t === "folder") out.folderShares++;
    else if (t === "password") out.passwordShares++;
    else out.runShares++;
    out[getShareHealth(s, nowMs)]++;
  }
  return out;
}

/** Validate create options without writing state. Throws on invalid input. */
export function validateShareOptions(opts: { expiresInMs?: number; maxViews?: number; name?: string } = {}): { expiresInMs?: number; maxViews?: number; name?: string } {
  const o: { expiresInMs?: number; maxViews?: number; name?: string } = { ...opts };
  if (o.expiresInMs !== undefined) {
    if (typeof o.expiresInMs !== "number" || !Number.isFinite(o.expiresInMs) || o.expiresInMs <= 0) {
      throw new Error("expiresInMs must be a positive number");
    }
    o.expiresInMs = Math.max(60_000, Math.min(o.expiresInMs, 365 * 24 * 60 * 60 * 1000));
  }
  if (o.maxViews !== undefined) {
    if (!Number.isInteger(o.maxViews) || o.maxViews < 1) throw new Error("maxViews must be a positive integer");
    o.maxViews = Math.max(1, Math.min(o.maxViews, 100_000));
  }
  if (o.name !== undefined) o.name = String(o.name).trim().slice(0, 120);
  return o;
}

/** CSV export of shares. */
export function sharesToCsv(shares: ShareToken[], nowMs: number = Date.now()): string {
  const header = "token,runId,type,health,views,maxViews,viewsRemaining,msRemaining,createdAt,expiresAt,revoked,name";
  const rows = shares.map((s) => {
    const sum = summarizeShareToken(s, nowMs);
    return [
      s.token, s.runId, sum.type, sum.health, s.views, s.maxViews ?? "",
      sum.viewsRemaining ?? "", sum.msRemaining ?? "", s.createdAt, s.expiresAt ?? "",
      s.revoked ? 1 : 0, JSON.stringify(sum.name),
    ].join(",");
  });
  return [header, ...rows].join("\n");
}

/** Deep structural equality for shares (ignores in-memory identity). */
export function sharesEqual(a: ShareToken, b: ShareToken): boolean {
  if (a.token !== b.token || a.runId !== b.runId) return false;
  if (a.createdAt !== b.createdAt || a.expiresAt !== b.expiresAt) return false;
  if (a.views !== b.views || a.maxViews !== b.maxViews) return false;
  if (a.revoked !== b.revoked) return false;
  if ((a.name || "") !== (b.name || "")) return false;
  if ((a.description || "") !== (b.description || "")) return false;
  if (isFolderShare(a) !== isFolderShare(b)) return false;
  if (isFolderShare(a) && isFolderShare(b)) {
    if (a.folderId !== b.folderId) return false;
    if (a.includeNotes !== b.includeNotes) return false;
  }
  if (isPasswordProtected(a) !== isPasswordProtected(b)) return false;
  if (isPasswordProtected(a) && isPasswordProtected(b)) {
    if (a.passwordHash !== b.passwordHash) return false;
  }
  return true;
}

/** Find shares whose token/runId/name matches a term. */
export function searchShares(shares: ShareToken[], term: string): ShareToken[] {
  const q = term.trim().toLowerCase();
  if (!q) return shares.slice();
  return shares.filter((s) =>
    s.token.toLowerCase().includes(q) ||
    s.runId.toLowerCase().includes(q) ||
    (s.name || "").toLowerCase().includes(q)
  );
}

/**
 * Redacted representation for management/list endpoints.
 *
 * A share token is a bearer credential, so even an authenticated collection
 * response must not echo it. `shareId` is a one-way identifier suitable for
 * correlation in logs or future management APIs without granting access to
 * the shared report.
 */
export interface ShareListView {
  shareId: string;
  runId: string;
  createdAt: number;
  expiresAt: number | null;
  views: number;
  maxViews: number | null;
  revoked: boolean;
  type: "run" | "folder" | "password";
  hasPassword: boolean;
  name?: string;
  description?: string;
}

export function toPublicShareView(share: ShareToken): ShareListView {
  return {
    shareId: crypto.createHash("sha256").update(share.token).digest("hex"),
    runId: share.runId,
    createdAt: share.createdAt,
    expiresAt: share.expiresAt,
    views: share.views,
    maxViews: share.maxViews,
    revoked: share.revoked,
    type: getShareType(share),
    hasPassword: isPasswordProtected(share),
    ...(share.name ? { name: share.name } : {}),
    ...(share.description ? { description: share.description } : {}),
  };
}

