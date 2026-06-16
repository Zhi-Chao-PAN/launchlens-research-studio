// Structured request log used to surface POST /api/research traffic
// in /api/telemetry. Hash IPs to keep the log privacy-conscious while
// still letting operators see distinct sources.

import { getBackend } from "@/lib/storage/storage";

export interface RequestLogEntry {
  ts: number;
  route: string;
  method: string;
  status: number;
  durationMs: number;
  ipHash: string;
  uaSnippet: string;
  ok: boolean;
}

const RING_CAPACITY = 100;
const ring: RequestLogEntry[] = [];
let hydrated = false;

function hydrate(): void {
  if (hydrated) return;
  hydrated = true;
  try {
    const stored = getBackend().read<RequestLogEntry[]>("request-log-ring");
    if (Array.isArray(stored)) {
      for (const r of stored) ring.push(r);
    }
  } catch {
    // ignore
  }
}

function persist(): void {
  try {
    getBackend().write("request-log-ring", ring);
  } catch {
    // ignore
  }
}

// Stable, non-cryptographic hash to keep IPs out of logs while still
// allowing operators to see distinct sources. Equivalent to FNV-1a 32-bit.
export function hashIp(ip: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < ip.length; i++) {
    h ^= ip.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

export function recordRequest(entry: RequestLogEntry): void {
  hydrate();
  ring.push(entry);
  if (ring.length > RING_CAPACITY) ring.splice(0, ring.length - RING_CAPACITY);
  persist();
}

export function getRecentRequests(limit: number = 50): RequestLogEntry[] {
  hydrate();
  return ring.slice(-limit).reverse();
}

export function clearRequestLog(): void {
  ring.length = 0;
  hydrated = true;
  try { getBackend().remove("request-log-ring"); } catch {}
}
