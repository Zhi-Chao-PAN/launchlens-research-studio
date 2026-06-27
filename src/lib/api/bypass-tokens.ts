// Rate-limit bypass token store with scopes.
// Reads valid tokens from the storage backend (bypass-tokens.json).
// Tokens are SHA-256 hashed in storage so a leaked storage file doesn't
// expose usable tokens. The plaintext token is what clients provide via
// Authorization: Bearer <token>.
//
// Scopes:
//   - "bypass"  — skips rate limits on /api/research
//   - "admin"   — full access to /api/admin/* endpoints + bypass
//
// Tokens can be provisioned by setting LAUNCHLENS_BYPASS_TOKENS to a
// comma-separated list of plaintext tokens at startup, or by editing
// the storage file directly. Env tokens get "bypass" scope by default;
// use LAUNCHLENS_ADMIN_TOKENS for admin-scoped env tokens.

import { createHash, randomBytes } from "node:crypto";
import { getBackend } from "@/lib/storage/storage";
import { checkRateLimit } from "@/lib/api/rate-limit";
import { recordAuthAudit } from "@/lib/api/auth-audit";

const STORAGE_KEY = "bypassTokens";
const ENV_BYPASS_TOKENS = process.env.LAUNCHLENS_BYPASS_TOKENS || "";
const ENV_ADMIN_TOKENS = process.env.LAUNCHLENS_ADMIN_TOKENS || "";

export type TokenScope = "bypass" | "admin";

export interface BypassTokenInfo {
  hash: string;
  scope: TokenScope;
  label?: string;
  createdAt: number;
  lastUsedAt?: number;
  lastIp?: string;
  usageCount: number;
  /** R227: wall-clock time (ms epoch) at which the token expires. Undefined =
   *  never expires (the pre-R227 default, and what env-provisioned tokens get).
   *  Set at creation via the ttlMs parameter / LAUNCHLENS_TOKEN_DEFAULT_TTL_MS. */
  expiresAt?: number;
}

let cached: Record<string, BypassTokenInfo> | null = null;
let envTokensLoaded = false;

/**
 * R227: default TTL applied to newly created tokens when no explicit ttlMs is
 * passed. Set LAUNCHLENS_TOKEN_DEFAULT_TTL_MS (ms) to give every API-created
 * token a finite lifetime; 0 / unset means tokens never expire by default
 * (preserving the pre-R227 behavior for env-provisioned and existing tokens).
 * Reads at call time so tests/env changes take effect without a restart.
 */
function getDefaultTtlMs(): number {
  const raw = process.env.LAUNCHLENS_TOKEN_DEFAULT_TTL_MS;
  if (!raw) return 0;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function load(): Record<string, BypassTokenInfo> {
  if (cached) return cached;

  let stored: Record<string, BypassTokenInfo> = {};
  try {
    const raw = getBackend().read<Record<string, BypassTokenInfo>>(STORAGE_KEY);
    if (raw && typeof raw === "object") {
      stored = raw;
    }
  } catch {
    // best effort
  }

  // Load env tokens on first call
  if (!envTokensLoaded) {
    const now = Date.now();
    const bypassTokens = ENV_BYPASS_TOKENS.split(",").map((t) => t.trim()).filter(Boolean);
    for (const tok of bypassTokens) {
      const h = hashToken(tok);
      if (!stored[h]) {
        stored[h] = { hash: h, scope: "bypass", label: "env-bypass", createdAt: now, usageCount: 0 };
      }
    }
    const adminTokens = ENV_ADMIN_TOKENS.split(",").map((t) => t.trim()).filter(Boolean);
    for (const tok of adminTokens) {
      const h = hashToken(tok);
      if (!stored[h]) {
        stored[h] = { hash: h, scope: "admin", label: "env-admin", createdAt: now, usageCount: 0 };
      }
    }
    persist(stored);
  }
  envTokensLoaded = true;

  cached = stored;
  return stored;
}

function persist(tokens: Record<string, BypassTokenInfo>): void {
  try {
    getBackend().write(STORAGE_KEY, tokens);
  } catch {
    // best effort
  }
}

/**
 * R227: has the token expired? True only when expiresAt is set and in the past.
 */
function isExpired(entry: BypassTokenInfo, now: number = Date.now()): boolean {
  return typeof entry.expiresAt === "number" && now >= entry.expiresAt;
}

/**
 * R227: lazily evict expired tokens from the store. Called on read paths so
 * expired tokens self-clean without a cron. Returns the (possibly pruned) map.
 */
function pruneExpired(tokens: Record<string, BypassTokenInfo>, now: number = Date.now()): Record<string, BypassTokenInfo> {
  let changed = false;
  for (const h of Object.keys(tokens)) {
    if (isExpired(tokens[h], now)) {
      delete tokens[h];
      changed = true;
    }
  }
  if (changed) {
    cached = tokens;
    persist(tokens);
  }
  return tokens;
}

/**
 * Get full token info (without recording usage).
 * Returns null if the token is invalid or expired (R227). Expired tokens are
 * evicted lazily on read.
 */
export function getTokenInfo(token: string): BypassTokenInfo | null {
  if (!token) return null;
  const h = hashToken(token);
  const tokens = pruneExpired(load());
  const entry = tokens[h];
  return entry || null;
}

/**
 * Check if a token is valid (any scope) and record usage.
 * Use this for rate-limit bypass — any valid token counts.
 */
export function isBypassToken(token: string, ip?: string): boolean {
  if (!token) return false;
  const h = hashToken(token);
  const tokens = pruneExpired(load());
  const entry = tokens[h];
  if (!entry) {
    if (token && ip) {
      recordAuthAudit("auth_failed", { ipHash: ip, detail: "invalid token" });
    }
    return false;
  }
  // R227: an expired token is treated as invalid (it was already pruned from
  // the store by pruneExpired, but guard defensively in case of clock skew).
  if (isExpired(entry)) {
    delete tokens[h];
    cached = tokens;
    persist(tokens);
    if (ip) {
      recordAuthAudit("auth_failed", { ipHash: ip, tokenHash: h, detail: "expired token" });
    }
    return false;
  }

  // Record usage and audit
  recordAuthAudit("auth_success", {
    ipHash: ip,
    tokenHash: h,
    scope: entry.scope,
    detail: "bypass token",
  });

  const updated: BypassTokenInfo = {
    ...entry,
    lastUsedAt: Date.now(),
    usageCount: entry.usageCount + 1,
  };
  if (ip) updated.lastIp = ip;
  tokens[h] = updated;
  cached = tokens;
  persist(tokens);
  return true;
}

/**
 * Check if a token has admin scope. Records usage.
 * Use this for /api/admin/* endpoints.
 */
export function isAdminToken(token: string, ip?: string): boolean {
  const info = getTokenInfo(token);
  if (!info || info.scope !== "admin") return false;
  // Record usage
  return isBypassToken(token, ip);
}

/**
 * Extract a bearer token from an Authorization header.
 */
export function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader) return null;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

/**
 * Create a new token with the given scope and label.
 * Returns the plaintext token (only shown once).
 *
 * R227: an optional ttlMs (milliseconds) sets an expiry. When omitted, the
 * LAUNCHLENS_TOKEN_DEFAULT_TTL_MS env var supplies a default; if that is also
 * unset the token never expires (pre-R227 behavior). ttlMs <= 0 forces
 * no-expiry even when a default TTL is configured.
 */
export function createBypassToken(
  scope: TokenScope = "bypass",
  label?: string,
  ttlMs?: number,
): string {
  const token = randomBytes(32).toString("base64url");
  const h = hashToken(token);
  const now = Date.now();
  // Resolve the effective TTL: explicit arg > env default > never.
  const effectiveTtl = typeof ttlMs === "number" ? ttlMs : getDefaultTtlMs();
  const expiresAt = effectiveTtl > 0 ? now + effectiveTtl : undefined;
  const tokens = load();
  tokens[h] = { hash: h, scope, label, createdAt: now, usageCount: 0, ...(expiresAt !== undefined ? { expiresAt } : {}) };
  cached = tokens;
  persist(tokens);
  recordAuthAudit("token_created", {
    tokenHash: h,
    scope,
    detail: label ? `label: ${label}` : undefined,
  });
  return token;
}

/**
 * List all tokens (hashes only, no plaintext). R227: expired tokens are
 * pruned first so the admin list reflects only currently-valid tokens.
 */
export function listBypassTokens(): BypassTokenInfo[] {
  const tokens = pruneExpired(load());
  return Object.values(tokens).sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * Revoke a token by its hash.
 */
export function revokeBypassToken(tokenHash: string): boolean {
  const tokens = load();
  if (!tokens[tokenHash]) return false;
  recordAuthAudit("token_revoked", {
    tokenHash,
    scope: tokens[tokenHash].scope,
    detail: `label: ${tokens[tokenHash].label || "none"}`,
  });
  delete tokens[tokenHash];
  cached = tokens;
  persist(tokens);
  return true;
}

/**
 * Rate-limit check for admin endpoints.
 * Admin endpoints need their own rate limiting because a leaked admin
 * token could otherwise be used to create unlimited bypass tokens.
 * Uses the same token-bucket as /api/research but with a separate key.
 */
export function checkAdminRateLimit(ip: string, tokenHash?: string) {
  // Rate limit by IP AND by token hash (the stricter one wins)
  const ipLimit = checkRateLimit("admin:ip:" + ip, {
    capacity: 30,
    refillIntervalMs: 60_000,
  });
  if (tokenHash) {
    const tokenLimit = checkRateLimit("admin:token:" + tokenHash, {
      capacity: 100,
      refillIntervalMs: 60_000,
    });
    return tokenLimit.remaining < ipLimit.remaining ? tokenLimit : ipLimit;
  }
  return ipLimit;
}

/**
 * Clear all tokens — used for testing.
 */
export function clearBypassTokens(): void {
  cached = {};
  persist({});
  envTokensLoaded = false; // allow re-loading from env on next call
}
