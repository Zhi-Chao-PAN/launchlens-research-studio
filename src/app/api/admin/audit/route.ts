import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isAdminToken, extractBearerToken, getTokenInfo } from "@/lib/api/bypass-tokens";
import { snapshotAuthAudit, recordAuthAudit } from "@/lib/api/auth-audit";
import { checkCors, handleOptions } from "@/lib/api/cors";

// Auth audit log endpoint.
// Requires an admin-scoped token.
//   GET /api/admin/audit       — returns recent audit events (default 50)
//   GET /api/admin/audit?limit=N — returns up to N events (max 100)

function getIp(request: NextRequest): string {
  return (request.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "anonymous";
}

function authAdmin(request: NextRequest): { ok: boolean; error?: string; tokenHash?: string } {
  const auth = request.headers.get("authorization");
  const tok = extractBearerToken(auth);
  if (!tok) return { ok: false, error: "missing-auth" };

  const info = getTokenInfo(tok);
  if (!info) return { ok: false, error: "invalid-token" };
  if (info.scope !== "admin") return { ok: false, error: "insufficient-scope" };

  isAdminToken(tok, getIp(request));
  return { ok: true, tokenHash: info.hash };
}

function escapeCsv(value: unknown): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function eventsToCsv(events: ReturnType<typeof snapshotAuthAudit>): string {
  const headers = ["id", "type", "timestamp", "ipHash", "tokenHash", "scope", "detail", "userAgent"];
  const rows = [headers.join(",")];
  for (const e of events) {
    rows.push([
      e.id,
      e.type,
      new Date(e.timestamp).toISOString(),
      escapeCsv(e.ipHash),
      escapeCsv(e.tokenHash),
      escapeCsv(e.scope),
      escapeCsv(e.detail),
      escapeCsv(e.userAgent),
    ].join(","));
  }
  return rows.join("\n");
}

export async function GET(request: NextRequest) {
  const cors = checkCors(request);
  if (!cors.allowed && cors.response) return cors.response;
  const auth = authAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ error: "Unauthorized: " + auth.error }, { status: 401 });
  }

  const url = new URL(request.url);
  const limitParam = url.searchParams.get("limit");
  const format = url.searchParams.get("format") || "json";
  const typeFilter = url.searchParams.get("type");
  const scopeFilter = url.searchParams.get("scope");
  const limit = Math.min(100, Math.max(1, parseInt(limitParam || "50", 10) || 50));

  let events = snapshotAuthAudit(limit);

  // Apply type filter
  if (typeFilter) {
    const types = typeFilter.split(",").map((t) => t.trim()).filter(Boolean);
    if (types.length > 0) {
      events = events.filter((e) => types.includes(e.type));
    }
  }

  // Apply scope filter
  if (scopeFilter) {
    events = events.filter((e) => e.scope === scopeFilter);
  }

  // Log the export action
  if (format !== "json") {
    recordAuthAudit("admin_action", {
      ipHash: getIp(request),
      tokenHash: auth.tokenHash,
      detail: `audit_export:${format}`,
    });
  }

  if (format === "csv") {
    const csv = eventsToCsv(events);
    const filename = `launchlens-audit-${new Date().toISOString().slice(0, 10)}.csv`;
    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        ...cors.headers,
      },
    });
  }

  if (format === "jsonl") {
    const lines = events.map((e) => JSON.stringify({
      id: e.id,
      type: e.type,
      timestamp: new Date(e.timestamp).toISOString(),
      ipHash: e.ipHash,
      tokenHash: e.tokenHash,
      scope: e.scope,
      detail: e.detail,
      userAgent: e.userAgent,
    })).join("\n");
    const filename = `launchlens-audit-${new Date().toISOString().slice(0, 10)}.jsonl`;
    return new Response(lines, {
      status: 200,
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        ...cors.headers,
      },
    });
  }

  // Default: JSON (same as before)
  return NextResponse.json({
    events,
    count: events.length,
    limit,
  }, { headers: cors.headers });
}

export const runtime = "nodejs";

export async function OPTIONS(request: NextRequest) {
  return handleOptions(request) || new Response(null, { status: 204 });
}
