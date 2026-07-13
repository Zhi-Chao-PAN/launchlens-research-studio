"use client";
import { fetchWithCsrf, formatApiError } from "@/lib/api/csrf-client";

import { SiteHeader } from "@/components/layout/SiteHeader";
import { useConfirm } from "@/components/ui/useConfirm";
import { useToast } from "@/components/toast/ToastContext";
/* eslint-disable react-hooks/set-state-in-effect */

import { useState, useEffect } from "react";
import Link from "next/link";

interface AdminToken {
  hash: string;
  label: string;
  scope: "admin" | "bypass";
  createdAt: number;
  lastUsed?: number;
  expiresAt?: number;
}

interface AuditEvent {
  id: number;
  type: string;
  timestamp: number;
  ipHash?: string;
  tokenHash?: string;
  scope?: string;
  detail?: string;
}

interface AlertEvent {
  id: string;
  type: string;
  severity: "info" | "warning" | "critical";
  message: string;
  count: number;
  ts: number;
}

function formatTime(ts: number): string {
  return new Date(ts).toISOString().replace("T", " ").slice(0, 19);
}

function severityClass(severity: string): string {
  switch (severity) {
    case "critical": return "severity-critical";
    case "warning": return "severity-warning";
    default: return "severity-info";
  }
}

export default function AdminPage() {
  const { showToast } = useToast();
  const { askConfirm, dialog: confirmDialog } = useConfirm();
  const [token, setToken] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem("admin_token") || "";
  });
  const [tokenInput, setTokenInput] = useState<string>("");
  const [tokens, setTokens] = useState<AdminToken[]>([]);
  const [audit, setAudit] = useState<AuditEvent[]>([]);
  const [alerts, setAlerts] = useState<AlertEvent[]>([]);
  const [researchRuns, setResearchRuns] = useState<{ id: string; query: string; keywords: string[]; status: string; provider: string; model: string; createdAt: number; durationMs: number; hasSources: boolean }[]>([]);
  const [researchLoading, setResearchLoading] = useState(true);
  const [researchError, setResearchError] = useState<string | null>(null);
  const [stats, setStats] = useState<{
    research?: { total: number; completed: number; failed: number; running: number; avgDurationMs: number; today: number; thisWeek: number; successRate: number };
    shares?: { total: number; active: number; totalViews: number };
    alerts?: { active: number; critical: number; warning: number };
    topKeywords?: Array<{ keyword: string; count: number }>;
    hourlyActivity?: { labels: string[]; values: number[] };
    storage?: unknown;
  } | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [researchSearch, setResearchSearch] = useState("");
  const [researchStatusFilter, setResearchStatusFilter] = useState("");
  const [researchTotal, setResearchTotal] = useState(0);

  const [activeTab, setActiveTab] = useState<"dashboard" | "tokens" | "audit" | "alerts" | "system" | "research">("dashboard");
  const [auditTypeFilter, setAuditTypeFilter] = useState<string>("");
  const [webhookStats, setWebhookStats] = useState<{ pending: number; maxRetries: number; initialDelayMs: number; maxQueueSize: number } | null>(null);
  // R226: operational telemetry surfaced in the System tab. Fetched lazily
  // when the tab is first opened, then refreshed on a 10s interval while it
  // stays active (slower than the 5s admin poll to avoid hammering telemetry).
  const [telemetry, setTelemetry] = useState<{
    summary: { total: number; successRate: number; averageMs: number; byProvider: Record<string, { count: number; ok: number }>; byAgent: Record<string, { count: number; ok: number }> };
    breakers: Record<string, { failures: number; open: boolean; openedAt: number | null }>;
    rateLimit: { capacity: number; refillIntervalMs: number };
    storage: { enabled: boolean; inMemoryCount: number; maxMemoryRuns: number };
    dashboard: { totalRuns: number; recentRuns: number; totalDurationMs: number; byStatus: { completed: number; failed: number; cancelled: number } };
  } | null>(null);
  const [newLabel, setNewLabel] = useState("");
  const [newScope, setNewScope] = useState<"admin" | "bypass">("bypass");
  // R227: optional TTL in hours for newly created tokens. Empty = never expire
  // (or use LAUNCHLENS_TOKEN_DEFAULT_TTL_MS server default).
  const [newTtlHours, setNewTtlHours] = useState<string>("");
  const [newToken, setNewToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setTokens([]);
      setAudit([]);
      setAlerts([]);
      return;
    }
    loadAll();
    const interval = setInterval(loadAll, 5000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadAll closes over filter state; polling on token change only
  }, [token]);

  // Research tab
  useEffect(() => {
    if (activeTab === "research") {
      loadResearchRuns();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadResearchRuns closes over filters; re-run on filter change only
  }, [activeTab, researchSearch, researchStatusFilter]);

  // R226: load operational telemetry when the System tab is opened, and
  // refresh on a 10s interval while it stays active. Telemetry is admin-only
  // and heavier than the list endpoints, so it gets its own slower cadence.
  useEffect(() => {
    if (activeTab !== "system" || !token) return;
    let cancelled = false;
    const load = async () => {
      try {
        const res = await apiCall("/api/telemetry?limit=50");
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setTelemetry(data);
      } catch {
        // Telemetry is best-effort; leave the previous snapshot in place.
      }
    };
    void load();
    const interval = setInterval(load, 10_000);
    return () => { cancelled = true; clearInterval(interval); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, token]);

  async function loadResearchRuns() {
    try {
      setResearchLoading(true);
      const params = new URLSearchParams();
      params.set("limit", "20");
      if (researchSearch) params.set("q", researchSearch);
      if (researchStatusFilter) params.set("status", researchStatusFilter);

      // Admin's own research tab can see the full store (including any future
      // per-run private fields). Use apiCall so the Bearer token is attached,
      // matching the surrounding admin endpoints. List-only reads from
      // /history /page are same-origin CSRF-protected without a token.
      const res = await apiCall(`/api/research/runs?${params.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setResearchRuns(data.runs || []);
      setResearchTotal(data.total || 0);
      setResearchError(null);
    } catch (e: unknown) {
      setResearchError(formatApiError(e, { prefix: "Load failed:" }));
    } finally {
      setResearchLoading(false);
    }
  }

  async function deleteRun(id: string) {
    askConfirm("Delete research run?", "This cannot be undone.", async () => {
      try {
        const res = await apiCall(`/api/research/runs?ids=${id}`, { method: "DELETE" });
        if (!res.ok) throw new Error("Delete failed");
        setResearchRuns((prev) => prev.filter((r) => r.id !== id));
        setResearchTotal((prev) => Math.max(0, prev - 1));
        showToast("Research run deleted", "success");
      } catch (e: unknown) {
        showToast(formatApiError(e, { prefix: "Delete failed:" }), "error");
      }
    });
  }


  async function apiCall(path: string, options: RequestInit = {}): Promise<Response> {
    return fetchWithCsrf(path, {
      ...options,
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
        ...options.headers,
      },
    });
  }

  async function exportResearchRuns(format: "json" | "csv") {
    try {
      const response = await apiCall(`/api/research/runs?format=${format}`);
      if (!response.ok) throw new Error(`Export failed with HTTP ${response.status}`);

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `launchlens-research-runs.${format}`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      showToast(`Research runs exported as ${format.toUpperCase()}`, "success");
    } catch (error) {
      showToast(formatApiError(error, { prefix: "Export failed:" }), "error");
    }
  }

  async function loadAll() {
    try {
      const [tRes, aRes, alRes, sRes] = await Promise.all([
        apiCall("/api/admin/tokens"),
        apiCall(`/api/admin/audit?limit=20${auditTypeFilter ? "&type=" + encodeURIComponent(auditTypeFilter) : ""}`),
        apiCall("/api/admin/alerts?limit=20"),
        apiCall("/api/admin/alerts?stats=1"),
      ]);
      if (tRes.ok) {
        const data = await tRes.json();
        setTokens(data.tokens || []);
      }
      if (aRes.ok) {
        const data = await aRes.json();
        setAudit(data.events || []);
      }
      if (alRes.ok) {
        const data = await alRes.json();
        setAlerts(data.alerts || []);
      }
      if (sRes.ok) {
        const data = await sRes.json();
        setWebhookStats(data.webhook || null);
      }
      // Dashboard stats (research/shares/alerts aggregates) come from a
      // dedicated endpoint so they can be cached independently of the list polls.
      const statsRes = await apiCall("/api/admin/stats");
      if (statsRes.ok) {
        const data = await statsRes.json();
        setStats(data || null);
      }
      setStatsLoading(false);
      setError(null);
    } catch (e: unknown) {
      setError(formatApiError(e, { prefix: "Load failed:" }));
    }
  }

  function handleLogin() {
    localStorage.setItem("admin_token", tokenInput);
    setToken(tokenInput);
    setError(null);
  }

  function handleLogout() {
    localStorage.removeItem("admin_token");
    setToken("");
    setTokenInput("");
    setTokens([]);
    setAudit([]);
    setAlerts([]);
  }

  async function handleCreateToken() {
    try {
      // R227: convert hours to ms; empty/0 means "no explicit TTL" (server
      // applies its env default or never-expire).
      const hours = parseFloat(newTtlHours);
      const ttlMs = Number.isFinite(hours) && hours > 0 ? Math.round(hours * 3600_000) : 0;
      const res = await apiCall("/api/admin/tokens", {
        method: "POST",
        body: JSON.stringify({
          label: newLabel || "unnamed",
          scope: newScope,
          ...(ttlMs > 0 ? { ttlMs } : {}),
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setNewToken(data.token);
        setNewLabel("");
        setNewTtlHours("");
        loadAll();
      } else {
        setError(`Failed to create token: ${res.status}`);
      }
    } catch (e: unknown) {
      setError(formatApiError(e, { prefix: "Create failed:" }));
    }
  }

  async function handleRevoke(hash: string) {
    askConfirm("Revoke this token?", "The token will stop working immediately.", async () => {
      try {
        const res = await apiCall(`/api/admin/tokens/${encodeURIComponent(hash)}`, {
          method: "DELETE",
        });
        if (res.ok) {
          loadAll();
          showToast("Token revoked", "success");
        } else {
          setError(`Failed to revoke: ${res.status}`);
        }
      } catch (e: unknown) {
        setError(formatApiError(e, { prefix: "Revoke failed:" }));
      }
    });
  }

  async function handleClearAlerts() {
    askConfirm("Clear all alerts?", "This will remove every recorded alert.", async () => {
      try {
        const res = await apiCall("/api/admin/alerts", { method: "DELETE" });
        if (res.ok) {
          loadAll();
          showToast("Alerts cleared", "success");
        }
      } catch (e: unknown) {
        setError(formatApiError(e, { prefix: "Clear failed:" }));
      }
    });
  }

  if (!token) {
    return (
      <div className="admin-login">
        <div className="admin-login-card">
          <h1>Admin Console</h1>
          <p className="admin-login-sub">Enter an admin-scoped token to continue.</p>
          <input
            type="password"
            value={tokenInput}
            onChange={(e) => setTokenInput(e.target.value)}
            placeholder="admin token..."
            className="admin-token-input"
            onKeyDown={(e) => e.key === "Enter" && handleLogin()}
          />
          <button onClick={handleLogin} className="admin-login-btn">
            Sign in
          </button>
          {error && <p className="admin-error">{error}</p>}
          <p className="admin-login-foot">
            <Link href="/">? Back to studio</Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-page">
      <header className="admin-header">
        <div className="admin-header-inner">
          <h1>Admin Console</h1>
          <div className="admin-header-actions">
            <Link href="/" className="admin-link">Studio</Link>
            <Link href="/diagnostics" className="admin-link">Diagnostics</Link>
            <button onClick={handleLogout} className="admin-logout-btn">Sign out</button>
          </div>
        </div>
      </header>

      {error && <div className="admin-error-banner">{error}</div>}

      <nav className="admin-tabs">
        <button
          className={activeTab === "dashboard" ? "admin-tab active" : "admin-tab"}
          onClick={() => setActiveTab("dashboard")}
        >
          📊 Dashboard
        </button>
        <button
          className={activeTab === "tokens" ? "admin-tab active" : "admin-tab"}
          onClick={() => setActiveTab("tokens")}
        >
          Tokens ({tokens.length})
        </button>
        <button
          className={activeTab === "audit" ? "admin-tab active" : "admin-tab"}
          onClick={() => setActiveTab("audit")}
        >
          Audit Log
        </button>
        <button
          className={activeTab === "alerts" ? "admin-tab active" : "admin-tab"}
          onClick={() => setActiveTab("alerts")}
        >
          Alerts ({alerts.length})
        </button>
        <button
          className={activeTab === "system" ? "admin-tab active" : "admin-tab"}
          onClick={() => setActiveTab("system")}
        >
          System
        </button>
        <button
          className={activeTab === "research" ? "admin-tab active" : "admin-tab"}
          onClick={() => setActiveTab("research")}
        >
          Research
        </button>
      </nav>

      <SiteHeader />
      <main className="admin-main">
        {activeTab === "dashboard" && (
        <div className="admin-section">
          <h2 className="admin-section-title">System Overview</h2>

          {statsLoading ? (
            <p className="admin-loading">Loading...</p>
          ) : stats ? (
            <>
              {/* Stats grid */}
              <div className="admin-stats-grid">
                <div className="admin-stat-card">
                  <div className="admin-stat-label">Total Research</div>
                  <div className="admin-stat-value">{stats.research?.total ?? 0}</div>
                  <div className="admin-stat-sub">
                    Today {stats.research?.today ?? 0} · This week {stats.research?.thisWeek ?? 0}
                  </div>
                </div>
                <div className="admin-stat-card admin-stat-success">
                  <div className="admin-stat-label">Completed</div>
                  <div className="admin-stat-value">{stats.research?.completed ?? 0}</div>
                  <div className="admin-stat-sub">Success rate {stats.research?.successRate ?? 0}%</div>
                </div>
                <div className="admin-stat-card admin-stat-danger">
                  <div className="admin-stat-label">Failed</div>
                  <div className="admin-stat-value">{stats.research?.failed ?? 0}</div>
                  <div className="admin-stat-sub">Running {stats.research?.running ?? 0}</div>
                </div>
                <div className="admin-stat-card admin-stat-info">
                  <div className="admin-stat-label">Share Links</div>
                  <div className="admin-stat-value">{stats.shares?.total ?? 0}</div>
                  <div className="admin-stat-sub">
                    Active {stats.shares?.active ?? 0} · {stats.shares?.totalViews ?? 0} views
                  </div>
                </div>
                <div className="admin-stat-card admin-stat-warning">
                  <div className="admin-stat-label">Active Alerts</div>
                  <div className="admin-stat-value">{stats.alerts?.active ?? 0}</div>
                  <div className="admin-stat-sub">
                    Critical {stats.alerts?.critical ?? 0} · Warning {stats.alerts?.warning ?? 0}
                  </div>
                </div>
                <div className="admin-stat-card">
                  <div className="admin-stat-label">Avg Duration</div>
                  <div className="admin-stat-value">
                    {stats.research?.avgDurationMs
                      ? (stats.research.avgDurationMs / 1000).toFixed(1) + "s"
                      : "—"}
                  </div>
                  <div className="admin-stat-sub">Across completed runs</div>
                </div>
              </div>

              {/* Hourly activity chart (bar chart) */}
              <div className="admin-chart-section">
                <h3 className="admin-chart-title">24-Hour Activity Trend</h3>
                <div className="admin-bar-chart">
                  {stats.hourlyActivity?.values?.map((val: number, i: number) => (
                    <div key={i} className="admin-bar-item">
                      <div className="admin-bar-label">{stats.hourlyActivity?.labels?.[i]}</div>
                      <div className="admin-bar-track">
                        <div
                          className="admin-bar-fill"
                          style={{
                            height: `${Math.max(4, (val / Math.max(1, ...(stats.hourlyActivity?.values || []))) * 100)}%`,
                          }}
                          title={`${val} runs`}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Top keywords */}
              <div className="admin-keywords-section">
                <h3 className="admin-chart-title">Top Keywords (Top 10)</h3>
                <div className="admin-keyword-cloud">
                  {stats.topKeywords?.map((kw: { keyword: string; count: number }) => (
                    <span key={kw.keyword} className="admin-keyword-tag" title={`${kw.count} occurrences`}>
                      {kw.keyword}
                      <span className="admin-keyword-count">{kw.count}</span>
                    </span>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <p className="admin-empty">No data available</p>
          )}
        </div>
      )}

            {activeTab === "tokens" && (
          <section className="admin-section">
            <h2>Create token</h2>
            <div className="admin-token-create">
              <input
                type="text"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="label..."
                className="admin-input"
              />
              <select
                value={newScope}
                onChange={(e) => setNewScope(e.target.value as "admin" | "bypass")}
                className="admin-select"
              >
                <option value="bypass">bypass</option>
                <option value="admin">admin</option>
              </select>
              <input
                type="number"
                min={0}
                step={1}
                value={newTtlHours}
                onChange={(e) => setNewTtlHours(e.target.value)}
                placeholder="TTL (hours, blank=never)"
                className="admin-input"
                title="Token lifetime in hours. Leave blank for no expiry (or server default)."
              />
              <button onClick={handleCreateToken} className="admin-btn primary">
                Create
              </button>
            </div>
            {newToken && (
              <div className="admin-new-token">
                <p><strong>New token created ? save this, it won&apos;t be shown again:</strong></p>
                <code className="admin-token-display">{newToken}</code>
                <button onClick={() => setNewToken(null)} className="admin-btn small">
                  Dismiss
                </button>
              </div>
            )}

            <h2>Active tokens</h2>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Label</th>
                    <th>Scope</th>
                    <th>Hash</th>
                    <th>Created</th>
                    <th>Expires</th>
                    <th>Last used</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {tokens.map((t) => (
                    <tr key={t.hash}>
                      <td>{t.label}</td>
                      <td><span className={`admin-scope admin-scope-${t.scope}`}>{t.scope}</span></td>
                      <td><code className="admin-hash">{t.hash.slice(0, 16)}…</code></td>
                      <td>{formatTime(t.createdAt)}</td>
                      <td>{t.expiresAt ? formatTime(t.expiresAt) : "Never"}</td>
                      <td>{t.lastUsed ? formatTime(t.lastUsed) : "—"}</td>
                      <td>
                        <button
                          onClick={() => handleRevoke(t.hash)}
                          className="admin-btn danger small"
                        >
                          Revoke
                        </button>
                      </td>
                    </tr>
                  ))}
                  {tokens.length === 0 && (
                    <tr><td colSpan={7} className="admin-empty">No tokens</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {activeTab === "audit" && (
          <section className="admin-section">
            <div className="admin-section-header">
              <h2>Audit log</h2>
              <div className="admin-section-actions">
                <select
                  value={auditTypeFilter}
                  onChange={(e) => {
                    setAuditTypeFilter(e.target.value);
                    setTimeout(loadAll, 0);
                  }}
                  className="admin-select"
                  style={{ marginRight: "12px" }}
                >
                  <option value="">All types</option>
                  <option value="auth_failed">auth_failed</option>
                  <option value="auth_success">auth_success</option>
                  <option value="token_created">token_created</option>
                  <option value="token_revoked">token_revoked</option>
                  <option value="rate_limited">rate_limited</option>
                  <option value="csrf_failed">csrf_failed</option>
                  <option value="admin_action">admin_action</option>
                </select>
                <a href="/api/admin/audit?format=csv" className="admin-link">Export CSV</a>
                <a href="/api/admin/audit?format=jsonl" className="admin-link">Export JSONL</a>
              </div>
            </div>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Type</th>
                    <th>Time</th>
                    <th>IP hash</th>
                    <th>Token hash</th>
                    <th>Scope</th>
                    <th>Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {audit.map((e) => (
                    <tr key={e.id} className={`admin-audit-${e.type}`}>
                      <td>{e.id}</td>
                      <td><span className="admin-audit-type">{e.type}</span></td>
                      <td>{formatTime(e.timestamp)}</td>
                      <td>{e.ipHash ? <code className="admin-hash">{e.ipHash.slice(0, 12)}?</code> : "?"}</td>
                      <td>{e.tokenHash ? <code className="admin-hash">{e.tokenHash.slice(0, 12)}?</code> : "?"}</td>
                      <td>{e.scope || "?"}</td>
                      <td className="admin-detail">{e.detail || "?"}</td>
                    </tr>
                  ))}
                  {audit.length === 0 && (
                    <tr><td colSpan={7} className="admin-empty">No events</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {activeTab === "alerts" && (
          <section className="admin-section">
            <div className="admin-section-header">
              <h2>Security alerts</h2>
              <button onClick={handleClearAlerts} className="admin-btn danger small">
                Clear all
              </button>
            </div>
            <div className="admin-alerts">
              {alerts.map((a) => (
                <div key={a.id} className={`admin-alert ${severityClass(a.severity)}`}>
                  <div className="admin-alert-header">
                    <span className="admin-alert-type">{a.type}</span>
                    <span className="admin-alert-severity">{a.severity}</span>
                    <span className="admin-alert-time">{formatTime(a.ts)}</span>
                  </div>
                  <p className="admin-alert-message">{a.message}</p>
                  {a.count > 1 && (
                    <p className="admin-alert-count">{a.count} events in window</p>
                  )}
                </div>
              ))}
              {alerts.length === 0 && (
                <p className="admin-empty">No alerts ? all clear.</p>
              )}
            </div>
          </section>
        )}

        {activeTab === "system" && (
          <section className="admin-section">
            <h2>Webhook status</h2>
            <div className="admin-status-card">
              <div className="admin-status-row">
                <span className="admin-status-label">Pending deliveries</span>
                <span className="admin-status-value">
                  {webhookStats ? webhookStats.pending : "—"}
                </span>
              </div>
              <div className="admin-status-row">
                <span className="admin-status-label">Max retries</span>
                <span className="admin-status-value">
                  {webhookStats ? webhookStats.maxRetries : "—"}
                </span>
              </div>
              <div className="admin-status-row">
                <span className="admin-status-label">Initial retry delay</span>
                <span className="admin-status-value">
                  {webhookStats ? webhookStats.initialDelayMs + "ms" : "—"}
                </span>
              </div>
              <div className="admin-status-row">
                <span className="admin-status-label">Max queue size</span>
                <span className="admin-status-value">
                  {webhookStats ? webhookStats.maxQueueSize : "—"}
                </span>
              </div>
            </div>

            <h2>Trusted IP ranges</h2>
            <p className="admin-section-desc">
              IP addresses and CIDR ranges that bypass rate limiting.
              Configure via <code>LAUNCHLENS_TRUSTED_IPS</code> environment variable.
            </p>
            <div className="admin-info-note">
              Trusted IP list is server-side only and not exposed via the API for security reasons.
              Check your deployment environment to see the configured list.
            </div>

            {/* R226: operational telemetry — rate-limit config, request summary,
                circuit breakers, and storage/dashboard stats from /api/telemetry. */}
            <h2>Rate limit</h2>
            <div className="admin-status-card">
              <div className="admin-status-row">
                <span className="admin-status-label">Capacity (requests / window)</span>
                <span className="admin-status-value">
                  {telemetry ? telemetry.rateLimit.capacity : "—"}
                </span>
              </div>
              <div className="admin-status-row">
                <span className="admin-status-label">Refill window</span>
                <span className="admin-status-value">
                  {telemetry ? (telemetry.rateLimit.refillIntervalMs / 1000) + "s" : "—"}
                </span>
              </div>
            </div>
            <p className="admin-section-desc">
              Tunable via <code>LAUNCHLENS_RATE_LIMIT_CAPACITY</code> and{" "}
              <code>LAUNCHLENS_RATE_LIMIT_REFILL_MS</code>.
            </p>

            <h2>Request telemetry</h2>
            <div className="admin-status-card">
              <div className="admin-status-row">
                <span className="admin-status-label">Tracked requests</span>
                <span className="admin-status-value">
                  {telemetry ? telemetry.summary.total : "—"}
                </span>
              </div>
              <div className="admin-status-row">
                <span className="admin-status-label">Success rate</span>
                <span className="admin-status-value">
                  {telemetry ? Math.round(telemetry.summary.successRate * 100) + "%" : "—"}
                </span>
              </div>
              <div className="admin-status-row">
                <span className="admin-status-label">Avg duration</span>
                <span className="admin-status-value">
                  {telemetry ? Math.round(telemetry.summary.averageMs) + "ms" : "—"}
                </span>
              </div>
            </div>

            <h2>Circuit breakers</h2>
            {telemetry && Object.keys(telemetry.breakers).length > 0 ? (
              <div className="admin-status-card">
                {Object.entries(telemetry.breakers).map(([key, b]) => (
                  <div className="admin-status-row" key={key}>
                    <span className="admin-status-label">{key}</span>
                    <span className="admin-status-value">
                      {b.open ? "🔴 Open" : "🟢 Closed"} ({b.failures} failures)
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="admin-section-desc">
                {telemetry ? "No circuit breakers tripped." : "Loading…"}
              </p>
            )}

            <h2>Storage &amp; runs</h2>
            <div className="admin-status-card">
              <div className="admin-status-row">
                <span className="admin-status-label">Disk persistence</span>
                <span className="admin-status-value">
                  {telemetry ? (telemetry.storage.enabled ? "Enabled" : "In-memory only") : "—"}
                </span>
              </div>
              <div className="admin-status-row">
                <span className="admin-status-label">Runs in memory</span>
                <span className="admin-status-value">
                  {telemetry ? `${telemetry.storage.inMemoryCount} / ${telemetry.storage.maxMemoryRuns}` : "—"}
                </span>
              </div>
              <div className="admin-status-row">
                <span className="admin-status-label">Total runs</span>
                <span className="admin-status-value">
                  {telemetry ? telemetry.dashboard.totalRuns : "—"}
                </span>
              </div>
              <div className="admin-status-row">
                <span className="admin-status-label">This week</span>
                <span className="admin-status-value">
                  {telemetry ? telemetry.dashboard.recentRuns : "—"}
                </span>
              </div>
              <div className="admin-status-row">
                <span className="admin-status-label">Status breakdown</span>
                <span className="admin-status-value">
                  {telemetry
                    ? `✓ ${telemetry.dashboard.byStatus.completed} · ✗ ${telemetry.dashboard.byStatus.failed} · ⊘ ${telemetry.dashboard.byStatus.cancelled}`
                    : "—"}
                </span>
              </div>
            </div>
          </section>
        )}


        {activeTab === "research" && (
          <section className="admin-section">
            <h2>Research runs</h2>
            <p className="admin-section-desc">
              Browse, search, and manage research runs.
            </p>

            <div className="admin-research-controls">
              <input
                type="text"
                placeholder="Search runs..."
                value={researchSearch}
                onChange={(e) => setResearchSearch(e.target.value)}
                className="admin-search-input"
              />
              <select
                value={researchStatusFilter}
                onChange={(e) => setResearchStatusFilter(e.target.value)}
                className="admin-filter-select"
              >
                <option value="">All statuses</option>
                <option value="completed">Completed</option>
                <option value="failed">Failed</option>
              </select>
              <button
                onClick={loadResearchRuns}
                className="admin-refresh-btn"
              >
                Refresh
              </button>
              <button
                type="button"
                onClick={() => exportResearchRuns("json")}
                className="admin-export-link"
              >
                Export JSON
              </button>
              <button
                type="button"
                onClick={() => exportResearchRuns("csv")}
                className="admin-export-link"
              >
                Export CSV
              </button>
            </div>

            {researchLoading && <p className="admin-loading">Loading...</p>}

            {researchError && (
              <div className="admin-error-banner">{researchError}</div>
            )}

            {!researchLoading && researchRuns.length > 0 && (
              <p className="admin-research-count">
                Showing {researchRuns.length} of {researchTotal} runs
              </p>
            )}

            <div className="admin-research-list">
              {researchRuns.map((run) => (
                <div key={run.id} className="admin-research-item">
                  <div className="admin-research-item-header">
                  <span className={`admin-research-status admin-research-status-${run.status}`}>
                    {run.status}
                  </span>
                  <span className="admin-research-provider">
                    {run.provider} / {run.model}
                  </span>
                  <span className="admin-research-time">
                    {new Date(run.createdAt).toLocaleString()}
                  </span>
                </div>
                <a href={`/research/${run.id}`} className="admin-research-query">
                  {run.query}
                </a>
                {run.keywords.length > 0 && (
                  <div className="admin-research-keywords">
                    {run.keywords.slice(0, 4).map((kw: string) => (
                      <span key={kw} className="admin-research-keyword">{kw}</span>
                    ))}
                    {run.keywords.length > 4 && (
                      <span className="admin-research-keyword-more">+{run.keywords.length - 4}</span>
                    )}
                  </div>
                )}
                <div className="admin-research-actions">
                  <a href={`/research/${run.id}`} className="admin-research-action">
                    View
                  </a>
                  <button
                    onClick={() => deleteRun(run.id)}
                    className="admin-research-action admin-research-delete"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
            </div>

            {!researchLoading && researchRuns.length === 0 && !researchError && (
              <p className="admin-empty">
                {researchSearch || researchStatusFilter
                  ? "No matching research runs."
                  : "No research runs yet."}
              </p>
            )}
          </section>
        )}

      </main>
      {confirmDialog}
    </div>
  );
}
