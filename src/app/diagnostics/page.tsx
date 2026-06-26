const NOW = Date.now();
import { summarizeTelemetry, getRecentTelemetry } from "@/lib/telemetry/telemetry";
import { snapshotBreakers } from "@/lib/utils/circuit-breaker";
import { snapshotFlips } from "@/lib/utils/flip-history";
import { getRecentRequests } from "@/lib/telemetry/request-log";
import { selectProvider } from "@/lib/providers/provider-registry";
import { getSchedulerStats, listSchedules } from "@/lib/research/scheduler";
import packageJson from "../../../package.json";

function pct(x: number): string {
  if (!Number.isFinite(x)) return "0%";
  return Math.max(0, Math.min(100, Math.round(x * 100))) + "%";
}

function formatMs(ms: number): string {
  if (!Number.isFinite(ms)) return "0ms";
  if (ms < 1000) return Math.round(ms) + "ms";
  return (ms / 1000).toFixed(2) + "s";
}

function readProvider() {
  return selectProvider();
}

function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  return d.toISOString().replace("T", " ").replace("Z", " UTC");
}

function flipTypeLabel(type: string): string {
  switch (type) {
    case "breaker_open": return "Breaker opened";
    case "breaker_close": return "Breaker closed";
    case "provider_flip": return "Provider flip";
    default: return type;
  }
}

function flipTypeColor(type: string): string {
  switch (type) {
    case "breaker_open": return "text-rose-700";
    case "breaker_close": return "text-emerald-700";
    case "provider_flip": return "text-amber-700";
    default: return "text-slate-700";
  }
}

export const dynamic = "force-dynamic";

export default function DiagnosticsPage() {
  const summary = summarizeTelemetry();
  const breakers = snapshotBreakers();
  const recentTelemetry = getRecentTelemetry(20);
  const recentRequests = getRecentRequests(20);
  const flips = snapshotFlips(20);
  const provider = readProvider();
  const buildInfo = {
    name: packageJson.name,
    version: packageJson.version,
    renderedAt: formatTimestamp(NOW),
  };
  const schedulerStats = getSchedulerStats();
  const schedules = listSchedules().slice(0, 5);

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <header className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <h1 className="text-2xl font-bold text-slate-800 mb-1">Diagnostics</h1>
          <p className="text-sm text-slate-500">
            Runtime observability for {buildInfo.name} (v{buildInfo.version}).{" "}
            Data is process-local; set LAUNCHLENS_STORAGE_DIR to persist across restarts.
          </p>
        </header>

        <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <p className="text-xs uppercase tracking-wide text-slate-500">Provider</p>
            <p className="text-lg font-semibold text-slate-800 mt-1">{provider.displayName}</p>
            <p className="text-xs text-slate-500 mt-1">
              {provider.isMock ? "Mock" : "Real LLM"} | {provider.supportsStreaming ? "streaming" : "non-streaming"} | id={provider.id}
            </p>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <p className="text-xs uppercase tracking-wide text-slate-500">Telemetry</p>
            <p className="text-lg font-semibold text-slate-800 mt-1">{summary.total} generations</p>
            <p className="text-xs text-slate-500 mt-1">
              {pct(summary.successRate)} success, {formatMs(summary.averageMs)} avg
            </p>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <p className="text-xs uppercase tracking-wide text-slate-500">State transitions</p>
            <p className="text-lg font-semibold text-slate-800 mt-1">{flips.length} events</p>
            <p className="text-xs text-slate-500 mt-1">
              breaker open/close + provider flips (last 20)
            </p>
          </div>
        </section>

        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <p className="text-xs uppercase tracking-wide text-slate-500">Schedules</p>
            <p className="text-lg font-semibold text-slate-800 mt-1">{schedulerStats.total} defined</p>
            <p className="text-xs text-slate-500 mt-1">
              {schedulerStats.active} active, {schedulerStats.paused} paused, {schedulerStats.totalRuns} total runs
            </p>
            {schedulerStats.nextRunAt ? (
              <p className="text-xs text-slate-500 mt-1">next run: {formatTimestamp(schedulerStats.nextRunAt)}</p>
            ) : null}
        </section>

        {schedules.length > 0 ? (
          <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <h2 className="text-lg font-semibold text-slate-800 mb-3">Upcoming schedules</h2>
            <ul className="divide-y divide-slate-100 text-sm">
              {schedules.map((sch) => (
                <li key={sch.id} className="py-2 flex items-center justify-between">
                  <span className="font-medium text-slate-700">{sch.name}</span>
                  <span className="text-slate-500 text-xs">
                    {sch.status} | {sch.totalRuns} runs
                    {sch.nextRunAt ? " | next " + formatTimestamp(sch.nextRunAt) : ""}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <h2 className="text-lg font-semibold text-slate-800 mb-3">Provider breakdown</h2>
          {Object.keys(summary.byProvider).length === 0 ? (
            <p className="text-sm text-slate-500">No agent generations recorded yet.</p>
          ) : (
            <div className="space-y-2">
              {Object.entries(summary.byProvider).map(([id, v]) => {
                const ratio = v.count ? v.ok / v.count : 0;
                return (
                  <div key={id}>
                    <div className="flex items-center justify-between text-xs text-slate-600">
                      <span className="font-medium">{id}</span>
                      <span>{v.ok} / {v.count} ok</span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden mt-1">
                      <div
                        className={ratio >= 0.9 ? "h-full bg-emerald-500" : ratio >= 0.5 ? "h-full bg-amber-500" : "h-full bg-rose-500"}
                        style={{ width: pct(ratio) }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <h2 className="text-lg font-semibold text-slate-800 mb-3">State transition history</h2>
          {flips.length === 0 ? (
            <p className="text-sm text-slate-500">No state transitions recorded yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-slate-500">
                  <th className="py-1 pr-2">When</th>
                  <th className="py-1 pr-2">Type</th>
                  <th className="py-1 pr-2">Key</th>
                  <th className="py-1 pr-2">Detail</th>
                </tr>
              </thead>
              <tbody>
                {flips.slice().reverse().map((f) => (
                  <tr key={f.id} className="border-t border-slate-100">
                    <td className="py-1 pr-2 text-xs text-slate-500">{formatTimestamp(f.timestamp)}</td>
                    <td className={"py-1 pr-2 font-medium " + flipTypeColor(f.type)}>{flipTypeLabel(f.type)}</td>
                    <td className="py-1 pr-2 font-mono text-xs">{f.key}</td>
                    <td className="py-1 pr-2 text-xs text-slate-600">
                      {f.from && f.to ? (f.from + " → " + f.to) : (f.detail || "—")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <h2 className="text-lg font-semibold text-slate-800 mb-3">Circuit breakers</h2>
          {Object.keys(breakers).length === 0 ? (
            <p className="text-sm text-slate-500">No breakers tripped.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-slate-500">
                  <th className="py-1 pr-2">Key</th>
                  <th className="py-1 pr-2">Failures</th>
                  <th className="py-1 pr-2">Open</th>
                  <th className="py-1 pr-2">Opened</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(breakers).map(([k, v]) => (
                  <tr key={k} className="border-t border-slate-100">
                    <td className="py-1 pr-2 font-mono text-xs">{k}</td>
                    <td className="py-1 pr-2">{v.failures}</td>
                    <td className="py-1 pr-2">{v.open ? "yes" : "no"}</td>
                    <td className="py-1 pr-2 text-xs text-slate-500">
                      {v.openedAt ? formatTimestamp(v.openedAt) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <h2 className="text-lg font-semibold text-slate-800 mb-3">Recent requests</h2>
          {recentRequests.length === 0 ? (
            <p className="text-sm text-slate-500">No requests yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-slate-500">
                  <th className="py-1 pr-2">When</th>
                  <th className="py-1 pr-2">Route</th>
                  <th className="py-1 pr-2">Status</th>
                  <th className="py-1 pr-2">Latency</th>
                  <th className="py-1 pr-2">IP-hash</th>
                </tr>
              </thead>
              <tbody>
                {recentRequests.map((r, i) => (
                  <tr key={i} className="border-t border-slate-100">
                    <td className="py-1 pr-2 text-xs text-slate-500">{formatTimestamp(r.ts)}</td>
                    <td className="py-1 pr-2 font-mono text-xs">{r.method} {r.route}</td>
                    <td className={"py-1 pr-2 font-medium " + (r.status >= 200 && r.status < 300 ? "text-emerald-700" : r.status >= 400 ? "text-rose-700" : "text-slate-700")}>{r.status}</td>
                    <td className="py-1 pr-2">{formatMs(r.durationMs)}</td>
                    <td className="py-1 pr-2 font-mono text-xs">{r.ipHash}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <h2 className="text-lg font-semibold text-slate-800 mb-3">Recent agent generations</h2>
          {recentTelemetry.length === 0 ? (
            <p className="text-sm text-slate-500">No telemetry yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-slate-500">
                  <th className="py-1 pr-2">When</th>
                  <th className="py-1 pr-2">Agent</th>
                  <th className="py-1 pr-2">Provider</th>
                  <th className="py-1 pr-2">Latency</th>
                  <th className="py-1 pr-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {recentTelemetry.map((r, i) => (
                  <tr key={i} className="border-t border-slate-100">
                    <td className="py-1 pr-2 text-xs text-slate-500">{formatTimestamp(r.ts)}</td>
                    <td className="py-1 pr-2 font-mono text-xs">{r.agentId}</td>
                    <td className="py-1 pr-2 font-mono text-xs">{r.providerId}</td>
                    <td className="py-1 pr-2">{formatMs(r.durationMs)}</td>
                    <td className={"py-1 pr-2 font-medium " + (r.ok ? "text-emerald-700" : "text-rose-700")}>
                      {r.ok ? "ok" : ("error: " + (r.error || "unknown"))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </div>
  );
}
