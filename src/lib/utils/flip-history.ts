// Ring buffer of provider/breaker state transitions.
// Records when breakers open or close, and when the active provider
// flips. Used by /api/health and /diagnostics so operators can see
// whether the resilience layer is actually doing work.
//
// Server-only. Stores in-memory; persisted through the storage backend
// when available so history survives restarts.

import { getBackend } from "@/lib/storage/storage";

export type FlipEventType = "breaker_open" | "breaker_close" | "provider_flip";

export interface FlipEvent {
  id: number;
  type: FlipEventType;
  key: string;
  from?: string;
  to?: string;
  timestamp: number;
  detail?: string;
}

const MAX_EVENTS = 50;

let events: FlipEvent[] = [];
let nextId = 1;
let hydrated = false;

function hydrate(): void {
  if (hydrated) return;
  hydrated = true;
  try {
    const stored = getBackend().read<{ events: FlipEvent[]; nextId: number }>("flipHistory");
    if (stored && Array.isArray(stored.events)) {
      events = stored.events.slice(-MAX_EVENTS);
      nextId = stored.nextId || (events.length > 0 ? Math.max(...events.map((e) => e.id)) + 1 : 1);
    }
  } catch {
    // best effort
  }
}

function persist(): void {
  try {
    getBackend().write("flipHistory", { events, nextId });
  } catch {
    // best effort
  }
}

export function recordFlip(
  type: FlipEventType,
  key: string,
  meta: { from?: string; to?: string; detail?: string } = {},
): FlipEvent {
  hydrate();
  const event: FlipEvent = {
    id: nextId++,
    type,
    key,
    from: meta.from,
    to: meta.to,
    timestamp: Date.now(),
    detail: meta.detail,
  };
  events.push(event);
  if (events.length > MAX_EVENTS) {
    events = events.slice(-MAX_EVENTS);
  }
  persist();
  return event;
}

export function snapshotFlips(limit: number = MAX_EVENTS): FlipEvent[] {
  hydrate();
  return events.slice(-limit);
}

export function clearFlips(): void {
  events = [];
  nextId = 1;
  hydrated = true;
  try { getBackend().remove("flipHistory"); } catch {}
}
