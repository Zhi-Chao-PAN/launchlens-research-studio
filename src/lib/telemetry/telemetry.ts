// Lightweight in-memory telemetry buffer.
// Records the last N research requests with timing and provider id so
// operators can sanity-check live behavior. This is process-local; a
// future round can swap in a real metrics sink.

export interface TelemetryRecord {
  ts: number;
  agentId: string;
  providerId: string;
  durationMs: number;
  ok: boolean;
  error?: string;
}

const RING_CAPACITY = 200;
const ring: TelemetryRecord[] = [];

export function recordTelemetry(rec: TelemetryRecord): void {
  ring.push(rec);
  if (ring.length > RING_CAPACITY) ring.splice(0, ring.length - RING_CAPACITY);
}

export function getRecentTelemetry(limit: number = 50): TelemetryRecord[] {
  return ring.slice(-limit).reverse();
}

export function clearTelemetry(): void {
  ring.length = 0;
}

export function summarizeTelemetry(): {
  total: number;
  successRate: number;
  averageMs: number;
  byProvider: Record<string, { count: number; ok: number }>;
  byAgent: Record<string, { count: number; ok: number }>;
} {
  const total = ring.length;
  if (total === 0) {
    return { total: 0, successRate: 1, averageMs: 0, byProvider: {}, byAgent: {} };
  }
  const okCount = ring.filter((r) => r.ok).length;
  const totalMs = ring.reduce((acc, r) => acc + r.durationMs, 0);
  const byProvider: Record<string, { count: number; ok: number }> = {};
  const byAgent: Record<string, { count: number; ok: number }> = {};
  for (const r of ring) {
    byProvider[r.providerId] = byProvider[r.providerId] || { count: 0, ok: 0 };
    byProvider[r.providerId].count++;
    if (r.ok) byProvider[r.providerId].ok++;
    byAgent[r.agentId] = byAgent[r.agentId] || { count: 0, ok: 0 };
    byAgent[r.agentId].count++;
    if (r.ok) byAgent[r.agentId].ok++;
  }
  return {
    total,
    successRate: okCount / total,
    averageMs: Math.round(totalMs / total),
    byProvider,
    byAgent,
  };
}
