import { headers } from "next/headers";
import { summarizeTelemetry, getRecentTelemetry } from "@/lib/telemetry/telemetry";
import { snapshotBreakers } from "@/lib/utils/circuit-breaker";
import { getRecentRequests } from "@/lib/telemetry/request-log";
import { selectProvider } from "@/lib/providers/provider-registry";
import { createServerI18n } from "@/lib/i18n/server-i18n";
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

export const dynamic = "force-dynamic";

const REQUIRED_TOKEN = process.env.LAUNCHLENS_DIAGNOSTICS_TOKEN || "";

async function isAuthorized(searchParams: Record<string, string | string[] | undefined>): Promise<boolean> {
  if (!REQUIRED_TOKEN) return true;
  const queryToken = searchParams.token;
  if (queryToken && typeof queryToken === "string" && queryToken === REQUIRED_TOKEN) return true;
  try {
    const hdr = await headers();
    const headerToken = hdr.get("x-diagnostics-token");
    if (headerToken && headerToken === REQUIRED_TOKEN) return true;
  } catch {
  }
  return false;
}

export default async function DiagnosticsPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const i18n = createServerI18n(await headers());
  const { t, fmt } = i18n;

  if (!(await isAuthorized(searchParams))) {
    return (
      <div className="min-h-screen bg-slate-50 px-4 py-8 flex items-center justify-center">
        <div className="max-w-md w-full bg-white rounded-2xl border border-slate-200 shadow-sm p-8 text-center">
          <h1 className="text-2xl font-bold text-slate-800 mb-2">401 {t("error.unauthorized", "Unauthorized")}</h1>
          <p className="text-sm text-slate-500 mb-6">
            {t("diagnostics.authHint", "Diagnostics access is restricted. Provide a valid token.")}
          </p>
        </div>
      </div>
    );
  }
  const summary = summarizeTelemetry();
  const breakers = snapshotBreakers();
  const recentTelemetry = getRecentTelemetry(20);
  const recentRequests = getRecentRequests(20);
  const provider = readProvider();
  const buildInfo = {
    name: packageJson.name,
    version: packageJson.version,
    renderedAt: formatTimestamp(Date.now()),
  };

  const okRequests = recentRequests.filter((r) => r.ok).length;
  const badRequests = recentRequests.filter((r) => !r.ok).length;

  const diagHeadings = {
    title: t("diagnostics.title", "Diagnostics"),
    provider: t("diagnostics.provider", "Provider"),
    telemetry: t("diagnostics.telemetry", "Telemetry"),
    requests: t("diagnostics.requests", "Requests"),
    generations: t("diagnostics.generations", "generations"),
    success: t("diagnostics.success", "success"),
    avg: t("diagnostics.avg", "avg"),
    recent: t("diagnostics.recent", "recent"),
    breakdown: t("diagnostics.breakdown", "Provider breakdown"),
    noGenerations: t("diagnostics.noGenerations", "No agent generations recorded yet."),
    breakers: t("diagnostics.breakers", "Circuit breakers"),
    noBreakers: t("diagnostics.noBreakers", "No breakers tripped."),
    recentRequests: t("diagnostics.recentRequests", "Recent requests"),
    noRequests: t("diagnostics.noRequests", "No requests yet."),
    recentGen: t("diagnostics.recentGen", "Recent agent generations"),
    noTelemetry: t("diagnostics.noTelemetry", "No telemetry yet."),
    colKey: t("diagnostics.col.key", "Key"),
    colFailures: t("diagnostics.col.failures", "Failures"),
    colOpen: t("diagnostics.col.open", "Open"),
    colOpened: t("diagnostics.col.opened", "Opened"),
    colWhen: t("diagnostics.col.when", "When"),
    colRoute: t("diagnostics.col.route", "Route"),
    colStatus: t("diagnostics.col.status", "Status"),
    colLatency: t("diagnostics.col.latency", "Latency"),
    colIp: "IP-hash",
    colAgent: t("diagnostics.col.agent", "Agent"),
    colProvider: t("diagnostics.col.provider", "Provider"),
    yes: t("common.yes", "yes"),
    no: t("common.no", "no"),
    ok: t("common.ok", "ok"),
    unknown: t("common.unknown", "unknown"),
    mock: t("diagnostics.mock", "Mock"),
    realLlm: t("diagnostics.realLlm", "Real LLM"),
    streaming: t("diagnostics.streaming", "streaming"),
    nonStreaming: t("diagnostics.nonStreaming", "non-streaming"),
  };

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <header className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <h1 className="text-2xl font-bold text-slate-800 mb-1">{diagHeadings.title}</h1>
          <p className="text-sm text-slate-500">{fmt("diagnostics.intro", { name: buildInfo.name, version: buildInfo.version }, "Runtime observability for " + buildInfo.name + " (v" + buildInfo.version + ").")}</p>
        </header>

        <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <p className="text-xs uppercase tracking-wide text-slate-500">{diagHeadings.provider}</p>
            <p className="text-lg font-semibold text-slate-800 mt-1">{provider.displayName}</p>
            <p className="text-xs text-slate-500 mt-1">
              {provider.isMock ? diagHeadings.mock : diagHeadings.realLlm} | {provider.supportsStreaming ? diagHeadings.streaming : diagHeadings.nonStreaming} | id={provider.id}
            </p>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <p className="text-xs uppercase tracking-wide text-slate-500">{diagHeadings.telemetry}</p>
            <p className="text-lg font-semibold text-slate-800 mt-1">{summary.total} {diagHeadings.generations}</p>
            <p className="text-xs text-slate-500 mt-1">
              {summary.ok} {t("diagnostics.succeeded", "succeeded")}
              {summary.cancelled > 0 ? <> · {summary.cancelled} {t("diagnostics.cancelled", "cancelled")}</> : null}
              {" · "}{pct(summary.successRate)} {diagHeadings.success}, {formatMs(summary.averageMs)} {diagHeadings.avg}
            </p>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <p className="text-xs uppercase tracking-wide text-slate-500">{diagHeadings.requests}</p>
            <p className="text-lg font-semibold text-slate-800 mt-1">{recentRequests.length} {diagHeadings.recent}</p>
            <p className="text-xs text-slate-500 mt-1">
              {okRequests} {diagHeadings.ok}, {badRequests} non-2xx
            </p>
          </div>
        </section>

        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <h2 className="text-lg font-semibold text-slate-800 mb-3">{diagHeadings.breakdown}</h2>
          {Object.keys(summary.byProvider).length === 0 ? (
            <p className="text-sm text-slate-500">{diagHeadings.noGenerations}</p>
          ) : (
            <div className="space-y-2">
              {Object.entries(summary.byProvider).map(([id, v]) => {
                // successRate excludes cancellations (matches telemetry.summarize)
                const denom = Math.max(0, v.count - (v.cancelled || 0));
                const ratio = denom ? v.ok / denom : v.cancelled ? 1 : 0;
                const failed = v.count - v.ok - (v.cancelled || 0);
                return (
                  <div key={id}>
                    <div className="flex items-center justify-between text-xs text-slate-600 gap-3">
                      <span className="font-medium truncate">{id}</span>
                      <span className="font-mono whitespace-nowrap">
                        <span className="text-emerald-700">{v.ok} {diagHeadings.ok}</span>
                        {(v.cancelled || 0) > 0 && <span className="text-slate-400"> · {v.cancelled} {t("diagnostics.cancelled", "cancelled")}</span>}
                        {failed > 0 && <span className="text-rose-700"> · {failed} {t("diagnostics.failures", "failed")}</span>}
                        <span className="text-slate-400"> · {v.count} {t("diagnostics.col.total", "total")}</span>
                      </span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden mt-1 flex">
                      <div
                        className={ratio >= 0.9 ? "bg-emerald-500" : ratio >= 0.5 ? "bg-amber-500" : "bg-rose-500"}
                        style={{ width: denom ? pct(ratio) : "0%" }}
                      />
                      {(v.cancelled || 0) > 0 && (
                        <div className="bg-slate-300" style={{ width: v.count ? pct((v.cancelled || 0) / v.count) : "0%" }} />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <h2 className="text-lg font-semibold text-slate-800 mb-3">{diagHeadings.breakers}</h2>
          {Object.keys(breakers).length === 0 ? (
            <p className="text-sm text-slate-500">{diagHeadings.noBreakers}</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-slate-500">
                  <th className="py-1 pr-2">{diagHeadings.colKey}</th>
                  <th className="py-1 pr-2">{diagHeadings.colFailures}</th>
                  <th className="py-1 pr-2">{diagHeadings.colOpen}</th>
                  <th className="py-1 pr-2">{diagHeadings.colOpened}</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(breakers).map(([k, v]) => (
                  <tr key={k} className="border-t border-slate-100">
                    <td className="py-1 pr-2 font-mono text-xs">{k}</td>
                    <td className="py-1 pr-2">{v.failures}</td>
                    <td className="py-1 pr-2">{v.open ? diagHeadings.yes : diagHeadings.no}</td>
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
          <h2 className="text-lg font-semibold text-slate-800 mb-3">{diagHeadings.recentRequests}</h2>
          {recentRequests.length === 0 ? (
            <p className="text-sm text-slate-500">{diagHeadings.noRequests}</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-slate-500">
                  <th className="py-1 pr-2">{diagHeadings.colWhen}</th>
                  <th className="py-1 pr-2">{diagHeadings.colRoute}</th>
                  <th className="py-1 pr-2">{diagHeadings.colStatus}</th>
                  <th className="py-1 pr-2">{diagHeadings.colLatency}</th>
                  <th className="py-1 pr-2">{diagHeadings.colIp}</th>
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
          <h2 className="text-lg font-semibold text-slate-800 mb-3">{diagHeadings.recentGen}</h2>
          {recentTelemetry.length === 0 ? (
            <p className="text-sm text-slate-500">{diagHeadings.noTelemetry}</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-slate-500">
                  <th className="py-1 pr-2">{diagHeadings.colWhen}</th>
                  <th className="py-1 pr-2">{diagHeadings.colAgent}</th>
                  <th className="py-1 pr-2">{diagHeadings.colProvider}</th>
                  <th className="py-1 pr-2">{diagHeadings.colLatency}</th>
                  <th className="py-1 pr-2">{diagHeadings.colStatus}</th>
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
                      {r.ok ? diagHeadings.ok : (diagHeadings.colStatus.toLowerCase().includes("error") ? "error" : "error") + ": " + (r.error || diagHeadings.unknown)}
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
