import { getBackend } from "@/lib/storage/storage";
// Per-key circuit breaker.
// After N consecutive failures the breaker opens and short-circuits
// further calls for cooldown ms. A single success closes it again.
// Used to flip a provider into mock-only mode after sustained failures
// so the studio doesn't keep paying for misconfigured upstreams.

export interface BreakerState {
  failures: number;
  openedAt: number | null;
}

export interface BreakerConfig {
  threshold: number;
  cooldownMs: number;
}

const DEFAULT_CONFIG: BreakerConfig = {
  threshold: 5,
  cooldownMs: 60_000,
};

const breakers = new Map<string, BreakerState>();
let hydrated = false;

function hydrate(): void {
  if (hydrated) return;
  hydrated = true;
  try {
    const stored = getBackend().read<Record<string, BreakerState>>("breakers");
    if (stored && typeof stored === "object") {
      for (const [k, v] of Object.entries(stored)) {
        breakers.set(k, v);
      }
    }
  } catch {
    // best effort; storage failures should never block runtime
  }
}

function persist(): void {
  try {
    const obj: Record<string, BreakerState> = {};
    for (const [k, v] of breakers.entries()) obj[k] = v;
    getBackend().write("breakers", obj);
  } catch {
    // best effort
  }
}

function getOrCreate(key: string): BreakerState {
  let state = breakers.get(key);
  if (!state) {
    state = { failures: 0, openedAt: null };
    breakers.set(key, state);
  }
  return state;
}

export function isOpen(
  key: string,
  config: Partial<BreakerConfig> = {},
  now: number = Date.now(),
): boolean {
  hydrate();
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const state = breakers.get(key);
  if (!state || state.openedAt === null) return false;
  if (now - state.openedAt >= cfg.cooldownMs) {
    // Half-open: allow one trial. The next success closes; failure re-opens.
    state.openedAt = null;
    state.failures = cfg.threshold - 1;
    return false;
  }
  return true;
}

export function recordSuccess(key: string): void {
  hydrate();
  const state = getOrCreate(key);
  state.failures = 0;
  state.openedAt = null;
  persist();
}

export function recordFailure(
  key: string,
  config: Partial<BreakerConfig> = {},
  now: number = Date.now(),
): boolean {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  hydrate();
  const state = getOrCreate(key);
  state.failures++;
  if (state.failures >= cfg.threshold) {
    state.openedAt = now;
    persist();
    return true;
  }
  persist();
  return false;
}

export function snapshotBreakers(): Record<string, { failures: number; open: boolean; openedAt: number | null }> {
  hydrate();
  const out: Record<string, { failures: number; open: boolean; openedAt: number | null }> = {};
  for (const [k, v] of breakers.entries()) {
    out[k] = { failures: v.failures, open: v.openedAt !== null, openedAt: v.openedAt };
  }
  return out;
}

export function clearBreakers(): void {
  breakers.clear();
  hydrated = true;
  try { getBackend().remove("breakers"); } catch {}
}
