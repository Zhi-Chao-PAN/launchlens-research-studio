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
}

let cached: Record<string, BypassTokenInfo> | null = null;
let envTokensLoaded = false;

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
 * Get full token info (without recording usage).
 * Returns null if the token is invalid.
 */
export function getTokenInfo(token: string): BypassTokenInfo | null {
  if (!token) return null;
  const h = hashToken(token);
  const tokens = load();
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
  const tokens = load();
  const entry = tokens[h];
  if (!entry) return false;

  // Record usage
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
 */
export function createBypassToken(
  scope: TokenScope = "bypass",
  label?: string,
): string {
  const token = randomBytes(32).toString("base64url");
  const h = hashToken(token);
  const now = Date.now();
  const tokens = load();
  tokens[h] = { hash: h, scope, label, createdAt: now, usageCount: 0 };
  cached = tokens;
  persist(tokens);
  return token;
}

/**
 * List all tokens (hashes only, no plaintext).
 */
export function listBypassTokens(): BypassTokenInfo[] {
  const tokens = load();
  return Object.values(tokens).sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * Revoke a token by its hash.
 */
export function revokeBypassToken(tokenHash: string): boolean {
  const tokens = load();
  if (!tokens[tokenHash]) return false;
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
