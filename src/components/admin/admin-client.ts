import { fetchWithCsrf, parseRateLimit } from "@/lib/api/csrf-client";

export interface AdminToken {
  hash: string;
  label: string;
  scope: "admin" | "bypass";
  createdAt: number;
  lastUsedAt?: number;
  expiresAt?: number;
}

export interface AuditEvent {
  id: number;
  type: string;
  timestamp: number;
  ipHash?: string;
  tokenHash?: string;
  scope?: string;
  detail?: string;
}

export interface AlertEvent {
  id: string;
  type: string;
  severity: "info" | "warning" | "critical";
  message: string;
  count: number;
  ts: number;
}

export interface ResearchRun {
  id: string;
  query: string;
  keywords: string[];
  status: "completed" | "failed" | "cancelled" | string;
  provider: string;
  model: string;
  createdAt: number;
  durationMs: number;
  hasSources: boolean;
}

export interface AdminStats {
  research?: {
    total: number;
    completed: number;
    failed: number;
    running: number;
    avgDurationMs: number;
    today: number;
    thisWeek: number;
    successRate: number;
  };
  shares?: { total: number; active: number; totalViews: number };
  alerts?: { active: number; critical: number; warning: number };
  topKeywords?: Array<{ keyword: string; count: number }>;
  hourlyActivity?: { labels: string[]; values: number[] };
  storage?: unknown;
}

export interface WebhookStats {
  pending: number;
  maxRetries: number;
  initialDelayMs: number;
  maxQueueSize: number;
}

export interface AdminTelemetry {
  summary: {
    total: number;
    successRate: number;
    averageMs: number;
    byProvider: Record<string, { count: number; ok: number }>;
    byAgent: Record<string, { count: number; ok: number }>;
  };
  breakers: Record<
    string,
    { failures: number; open: boolean; openedAt: number | null }
  >;
  rateLimit: { capacity: number; refillIntervalMs: number };
  storage: {
    enabled: boolean;
    inMemoryCount: number;
    maxMemoryRuns: number;
  };
  dashboard: {
    totalRuns: number;
    recentRuns: number;
    totalDurationMs: number;
    byStatus: { completed: number; failed: number; cancelled: number };
  };
}

export type ProviderName = "openai" | "anthropic";
export type ProviderSlot = 1 | 2 | 3;
export type ProviderHealthStatus =
  | "unknown"
  | "healthy"
  | "degraded"
  | "cooldown";

export interface ProviderCredentialHealth {
  status: ProviderHealthStatus;
  consecutiveFailures: number;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastFailureReason:
    | "auth"
    | "rate_limit"
    | "network"
    | "server"
    | "unknown"
    | null;
  cooldownUntil: string | null;
}

export interface ProviderCredentialSlot {
  slot: ProviderSlot;
  isConfigured: boolean;
  provider: ProviderName | null;
  enabled: boolean;
  credentialId: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  health: ProviderCredentialHealth;
}

export interface ProviderCredentialsSnapshot {
  version: 1;
  revision: number;
  /** Non-sensitive provider selected by the server runtime configuration. */
  runtimeProvider: ProviderName | null;
  slots: ProviderCredentialSlot[];
}

interface ProviderCredentialsApiResponse {
  data: Omit<ProviderCredentialsSnapshot, "runtimeProvider">;
  runtimeProvider?: ProviderName | null;
}

interface ErrorPayload {
  error?:
    | string
    | {
        code?: string;
        message?: string;
        currentRevision?: number;
      };
  message?: string;
}

export class AdminApiError extends Error {
  readonly status: number;
  readonly code: string | null;
  readonly retryAfterMs: number | null;
  readonly currentRevision: number | null;

  constructor(
    message: string,
    options: {
      status: number;
      code?: string | null;
      retryAfterMs?: number | null;
      currentRevision?: number | null;
    },
  ) {
    super(message);
    this.name = "AdminApiError";
    this.status = options.status;
    this.code = options.code ?? null;
    this.retryAfterMs = options.retryAfterMs ?? null;
    this.currentRevision = options.currentRevision ?? null;
  }
}

async function parseError(response: Response): Promise<AdminApiError> {
  const rateLimit = parseRateLimit(response);
  let payload: ErrorPayload | null = null;
  try {
    payload = (await response.clone().json()) as ErrorPayload;
  } catch {
    payload = null;
  }
  const objectError =
    payload?.error && typeof payload.error === "object"
      ? payload.error
      : null;
  const message =
    objectError?.message ??
    (typeof payload?.error === "string" ? payload.error : null) ??
    payload?.message ??
    `Request failed with HTTP ${response.status}`;
  return new AdminApiError(message, {
    status: response.status,
    code: objectError?.code ?? null,
    retryAfterMs: rateLimit.retryAfterMs,
    currentRevision: objectError?.currentRevision ?? null,
  });
}

async function adminFetch(
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(options.headers);
  if (!headers.has("Accept")) headers.set("Accept", "application/json");
  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const response = await fetchWithCsrf(path, {
    ...options,
    credentials: "same-origin",
    cache: "no-store",
    headers,
  });
  if (!response.ok) throw await parseError(response);
  return response;
}

async function adminJson<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await adminFetch(path, options);
  return (await response.json()) as T;
}

export async function checkAdminSession(): Promise<boolean> {
  try {
    await adminFetch("/api/admin/session");
    return true;
  } catch (error) {
    if (error instanceof AdminApiError && error.status === 401) return false;
    throw error;
  }
}

export async function createAdminSession(adminToken: string): Promise<void> {
  const token = adminToken.trim();
  if (!token) {
    throw new AdminApiError("Admin token is required.", { status: 400 });
  }
  await adminFetch("/api/admin/session", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function deleteAdminSession(): Promise<void> {
  await adminFetch("/api/admin/session", { method: "DELETE" });
}

export async function getAdminStats(): Promise<AdminStats> {
  return adminJson<AdminStats>("/api/admin/stats");
}

export async function getResearchRuns(input: {
  query?: string;
  status?: string;
  limit?: number;
} = {}): Promise<{ runs: ResearchRun[]; total: number }> {
  const params = new URLSearchParams({
    limit: String(input.limit ?? 20),
  });
  if (input.query) params.set("q", input.query);
  if (input.status) params.set("status", input.status);
  return adminJson<{ runs: ResearchRun[]; total: number }>(
    `/api/research/runs?${params.toString()}`,
  );
}

export async function deleteResearchRun(id: string): Promise<void> {
  await adminFetch(`/api/research/runs?ids=${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export async function getAdminTokens(): Promise<AdminToken[]> {
  const data = await adminJson<{ tokens: AdminToken[] }>("/api/admin/tokens");
  return data.tokens ?? [];
}

export async function createAdminToken(input: {
  label: string;
  scope: "admin" | "bypass";
  ttlMs?: number;
}): Promise<string> {
  const data = await adminJson<{ token: string }>("/api/admin/tokens", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return data.token;
}

export async function revokeAdminToken(hash: string): Promise<void> {
  await adminFetch(`/api/admin/tokens/${encodeURIComponent(hash)}`, {
    method: "DELETE",
  });
}

export async function getAuditEvents(type = ""): Promise<AuditEvent[]> {
  const params = new URLSearchParams({ limit: "50" });
  if (type) params.set("type", type);
  const data = await adminJson<{ events: AuditEvent[] }>(
    `/api/admin/audit?${params.toString()}`,
  );
  return data.events ?? [];
}

export async function getAdminAlerts(): Promise<AlertEvent[]> {
  const data = await adminJson<{ alerts: AlertEvent[] }>(
    "/api/admin/alerts?limit=50",
  );
  return data.alerts ?? [];
}

export async function clearAdminAlerts(): Promise<void> {
  await adminFetch("/api/admin/alerts", { method: "DELETE" });
}

export async function getSystemStatus(): Promise<{
  webhook: WebhookStats | null;
  telemetry: AdminTelemetry;
}> {
  const [webhookData, telemetry] = await Promise.all([
    adminJson<{ webhook: WebhookStats | null }>(
      "/api/admin/alerts?stats=1",
    ),
    adminJson<AdminTelemetry>("/api/telemetry?limit=50"),
  ]);
  return { webhook: webhookData.webhook ?? null, telemetry };
}

export async function getProviderCredentials(): Promise<ProviderCredentialsSnapshot> {
  const payload = await adminJson<ProviderCredentialsApiResponse>(
    "/api/admin/provider-credentials",
  );
  return toProviderCredentialsSnapshot(payload);
}

export async function saveProviderCredential(input: {
  provider: ProviderName;
  slot: ProviderSlot;
  expectedRevision: number;
  apiKey?: string;
  enabled?: boolean;
}): Promise<ProviderCredentialsSnapshot> {
  const payload = await adminJson<ProviderCredentialsApiResponse>(
    "/api/admin/provider-credentials",
    { method: "PUT", body: JSON.stringify(input) },
  );
  return toProviderCredentialsSnapshot(payload);
}

export async function removeProviderCredential(input: {
  provider: ProviderName;
  slot: ProviderSlot;
  expectedRevision: number;
}): Promise<ProviderCredentialsSnapshot> {
  const payload = await adminJson<ProviderCredentialsApiResponse>(
    "/api/admin/provider-credentials",
    { method: "DELETE", body: JSON.stringify(input) },
  );
  return toProviderCredentialsSnapshot(payload);
}

function toProviderCredentialsSnapshot(
  payload: ProviderCredentialsApiResponse,
): ProviderCredentialsSnapshot {
  return {
    ...payload.data,
    runtimeProvider: payload.runtimeProvider ?? null,
  };
}

export async function downloadAdminExport(
  path: string,
  fallbackName: string,
): Promise<void> {
  const response = await adminFetch(path, {
    headers: { Accept: "*/*" },
  });
  const blob = await response.blob();
  const disposition = response.headers.get("content-disposition") ?? "";
  const matched = disposition.match(/filename="?([^";]+)"?/iu);
  const filename = matched?.[1] ?? fallbackName;
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function isUnauthorized(error: unknown): boolean {
  return error instanceof AdminApiError && error.status === 401;
}

export function isRateLimited(error: unknown): error is AdminApiError {
  return error instanceof AdminApiError && error.status === 429;
}
