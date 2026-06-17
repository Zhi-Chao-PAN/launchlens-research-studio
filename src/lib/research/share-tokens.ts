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
