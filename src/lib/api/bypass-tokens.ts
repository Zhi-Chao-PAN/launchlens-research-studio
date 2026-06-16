// Rate-limit bypass token store.
// Reads valid tokens from the storage backend (bypass-tokens.json).
// Tokens are SHA-256 hashed in storage so a leaked storage file doesn't
// expose usable tokens. The plaintext token is what clients provide via
// Authorization: Bearer <token>.
//
// Tokens can be provisioned by setting LAUNCHLENS_BYPASS_TOKENS to a
// comma-separated list of plaintext tokens at startup, or by editing
// the storage file directly.

import { createHash, randomBytes } from "node:crypto";
import { getBackend } from "@/lib/storage/storage";

const STORAGE_KEY = "bypassTokens";
const ENV_TOKENS = process.env.LAUNCHLENS_BYPASS_TOKENS || "";

export interface BypassTokenInfo {
  hash: string;
  label?: string;
  createdAt: number;
  lastUsedAt?: number;
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
  if (!envTokensLoaded && ENV_TOKENS) {
    const tokens = ENV_TOKENS.split(",").map((t) => t.trim()).filter(Boolean);
    const now = Date.now();
    for (const tok of tokens) {
      const h = hashToken(tok);
      if (!stored[h]) {
        stored[h] = { hash: h, label: "env", createdAt: now, usageCount: 0 };
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

export function isBypassToken(token: string): boolean {
  if (!token) return false;
  const h = hashToken(token);
  const tokens = load();
  const entry = tokens[h];
  if (!entry) return false;

  // Record usage
  entry.lastUsedAt = Date.now();
  entry.usageCount++;
  cached = { ...tokens, [h]: entry };
  persist(cached);

  return true;
}

export function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader) return null;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

export function createBypassToken(label?: string): string {
  // Generate a random 32-byte token (base64url encoded for readability)
  const token = randomBytes(32).toString("base64url");
  const h = hashToken(token);
  const now = Date.now();
  const tokens = load();
  tokens[h] = { hash: h, label, createdAt: now, usageCount: 0 };
  cached = tokens;
  persist(tokens);
  return token;
}

export function listBypassTokens(): BypassTokenInfo[] {
  const tokens = load();
  return Object.values(tokens).sort((a, b) => b.createdAt - a.createdAt);
}

export function revokeBypassToken(tokenHash: string): boolean {
  const tokens = load();
  if (!tokens[tokenHash]) return false;
  delete tokens[tokenHash];
  cached = tokens;
  persist(tokens);
  return true;
}

export function clearBypassTokens(): void {
  cached = {};
  persist({});
  envTokensLoaded = false; // allow re-loading from env on next call
}
