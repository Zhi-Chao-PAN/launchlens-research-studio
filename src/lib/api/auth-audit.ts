// Authentication audit log.
// Ring buffer of security-relevant auth events: token creation, token
// revocation, authentication failures, CSRF violations, admin actions.
// Stored via the storage backend so it survives restarts when
// LAUNCHLENS_STORAGE_DIR is set. Designed for security observability,
// not for compliance-grade forensics.

import { getBackend } from "@/lib/storage/storage";

export type AuthAuditEventType =
  | "token_created"
  | "token_revoked"
  | "auth_success"
  | "auth_failed"
  | "csrf_failed"
  | "rate_limited"
  | "admin_action";

export interface AuthAuditEvent {
  id: number;
  type: AuthAuditEventType;
  timestamp: number;
  ipHash?: string;
  tokenHash?: string;
  scope?: string;
  detail?: string;
  userAgent?: string;
}

const MAX_EVENTS = 100;
type AuditListener = (event: AuthAuditEvent) => void;
const listeners: AuditListener[] = [];

/**
 * Register a listener called on every auth audit event.
 * Returns an unsubscribe function.
 */
export function onAuthAuditEvent(listener: AuditListener): () => void {
  listeners.push(listener);
  return () => {
    const idx = listeners.indexOf(listener);
    if (idx >= 0) listeners.splice(idx, 1);
  };
}
const STORAGE_KEY = "authAudit";

let events: AuthAuditEvent[] = [];
let nextId = 1;
let hydrated = false;

function hydrate(): void {
  if (hydrated) return;
  hydrated = true;
  try {
    const stored = getBackend().read<{ events: AuthAuditEvent[]; nextId: number }>(STORAGE_KEY);
    if (stored && Array.isArray(stored.events)) {
      events = stored.events.slice(-MAX_EVENTS);
      const maxId = events.length > 0 ? Math.max(...events.map((e) => e.id)) : 0;
      nextId = stored.nextId || maxId + 1;
    }
  } catch {
    // best effort
  }
}

function persist(): void {
  try {
    getBackend().write(STORAGE_KEY, { events, nextId });
  } catch {
    // best effort
  }
}

export function recordAuthAudit(
  type: AuthAuditEventType,
  meta: { ipHash?: string; tokenHash?: string; scope?: string; detail?: string; userAgent?: string } = {},
): AuthAuditEvent {
  hydrate();
  const event: AuthAuditEvent = {
    id: nextId++,
    type,
    timestamp: Date.now(),
    ipHash: meta.ipHash,
    tokenHash: meta.tokenHash,
    scope: meta.scope,
    detail: meta.detail,
    userAgent: meta.userAgent,
  };
  events.push(event);

  // Notify all listeners (best-effort, errors are swallowed)
  for (const listener of listeners) {
    try {
      listener(event);
    } catch {
      // Listener errors must not break audit logging
    }
  }

  if (events.length > MAX_EVENTS) {
    events = events.slice(-MAX_EVENTS);
  }
  persist();
  return event;
}

export function snapshotAuthAudit(limit: number = MAX_EVENTS): AuthAuditEvent[] {
  hydrate();
  return events.slice(-limit);
}

export function clearAuthAudit(): void {
  events = [];
  nextId = 1;
  hydrated = true;
  try {
    getBackend().remove(STORAGE_KEY);
  } catch {
    // best effort
  }
}
