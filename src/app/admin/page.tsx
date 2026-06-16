"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { useState, useEffect } from "react";
import Link from "next/link";

interface AdminToken {
  hash: string;
  label: string;
  scope: "admin" | "bypass";
  createdAt: number;
  lastUsed?: number;
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
  const [token, setToken] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem("admin_token") || "";
  });
  const [tokenInput, setTokenInput] = useState<string>("");
  const [tokens, setTokens] = useState<AdminToken[]>([]);
  const [audit, setAudit] = useState<AuditEvent[]>([]);
  const [alerts, setAlerts] = useState<AlertEvent[]>([]);
  const [activeTab, setActiveTab] = useState<"tokens" | "audit" | "alerts">("tokens");
  const [newLabel, setNewLabel] = useState("");
  const [newScope, setNewScope] = useState<"admin" | "bypass">("bypass");
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
  }, [token]);

  async function apiCall(path: string, options: RequestInit = {}): Promise<Response> {
    return fetch(path, {
      ...options,
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
        ...options.headers,
      },
    });
  }

  async function loadAll() {
    try {
      const [tRes, aRes, alRes] = await Promise.all([
        apiCall("/api/admin/tokens"),
        apiCall("/api/admin/audit?limit=20"),
        apiCall("/api/admin/alerts?limit=20"),
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
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load");
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
      const res = await apiCall("/api/admin/tokens", {
        method: "POST",
        body: JSON.stringify({ label: newLabel || "unnamed", scope: newScope }),
      });
      if (res.ok) {
        const data = await res.json();
        setNewToken(data.token);
        setNewLabel("");
        loadAll();
      } else {
        setError(`Failed to create token: ${res.status}`);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to create");
    }
  }

  async function handleRevoke(hash: string) {
    if (!confirm("Revoke this token?")) return;
    try {
      const res = await apiCall(`/api/admin/tokens/${encodeURIComponent(hash)}`, {
        method: "DELETE",
      });
      if (res.ok) {
        loadAll();
      } else {
        setError(`Failed to revoke: ${res.status}`);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to revoke");
    }
  }

  async function handleClearAlerts() {
    if (!confirm("Clear all alerts?")) return;
    try {
      const res = await apiCall("/api/admin/alerts", { method: "DELETE" });
      if (res.ok) {
        loadAll();
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to clear");
    }
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
      </nav>

      <main className="admin-main">
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
                    <th>Last used</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {tokens.map((t) => (
                    <tr key={t.hash}>
                      <td>{t.label}</td>
                      <td><span className={`admin-scope admin-scope-${t.scope}`}>{t.scope}</span></td>
                      <td><code className="admin-hash">{t.hash.slice(0, 16)}?</code></td>
                      <td>{formatTime(t.createdAt)}</td>
                      <td>{t.lastUsed ? formatTime(t.lastUsed) : "?"}</td>
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
                    <tr><td colSpan={6} className="admin-empty">No tokens</td></tr>
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
      </main>
    </div>
  );
}
