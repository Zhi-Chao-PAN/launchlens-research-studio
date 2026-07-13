import { NextResponse, type NextRequest } from "next/server";
import { verifyCsrf } from "@/lib/api/csrf-guard";
import { rotateCsrf } from "@/lib/api/csrf-rotate";
import {
  createShareToken,
  getSharesForRun,
  revokeShareToken,
  toPublicShareView,
} from "@/lib/research/share-tokens";
import { checkRateLimitForIp } from "@/lib/api/rate-limit";
import { requireAdmin } from "@/lib/api/require-admin";
import { resolveResearchRun } from "@/lib/research/resolve-run";

// Create a share token for a run
export async function POST(request: Request) {
  const csrfRejection = verifyCsrf(request);
  if (csrfRejection) return csrfRejection;
  const ip = (request.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "anonymous";
  const rl = checkRateLimitForIp(ip, { capacity: 30, refillIntervalMs: 60_000 });
  if (!rl.allowed) {
    return NextResponse.json({ error: "rate_limited", retryAfterMs: rl.resetMs }, { status: 429, headers: { "Retry-After": String(Math.ceil(rl.resetMs / 1000)) } });
  }

  try {
    const body = await request.json();
    const { runId, expiresInMs, maxViews } = body;

    if (!runId) {
      return NextResponse.json({ error: "runId is required" }, { status: 400 });
    }

    // Verify run exists
    const run = await resolveResearchRun(runId);
    if (!run) {
      return NextResponse.json({ error: "Run not found" }, { status: 404 });
    }
    if (run.status !== "completed") {
      return NextResponse.json(
        {
          error: "Only completed research reports can be shared.",
          runId,
          status: run.status,
        },
        { status: 409 },
      );
    }

    let expiresMs: number | undefined;
    let maxViewsN: number | undefined;
    if (expiresInMs !== undefined && expiresInMs !== null && expiresInMs !== "") {
      const n = Number(expiresInMs);
      if (!Number.isFinite(n) || n < 60_000 || n > 365 * 24 * 60 * 60 * 1000) {
        return NextResponse.json({ error: "expiresInMs must be a number between 60000 and 31536000000" }, { status: 400 });
      }
      expiresMs = Math.floor(n);
    }
    if (maxViews !== undefined && maxViews !== null && maxViews !== "") {
      const n = Number(maxViews);
      if (!Number.isInteger(n) || n < 1 || n > 100_000) {
        return NextResponse.json({ error: "maxViews must be an integer between 1 and 100000" }, { status: 400 });
      }
      maxViewsN = n;
    }

    const share = createShareToken(runId, { expiresInMs: expiresMs, maxViews: maxViewsN });

    return rotateCsrf(
      NextResponse.json({
        token: share.token,
        expiresAt: share.expiresAt,
        maxViews: share.maxViews,
        createdAt: share.createdAt,
      }),
    );
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}

// List shares for a run. The collection is admin-only and its records are
// redacted so neither bearer tokens nor password hashes can escape through a
// management/list endpoint.
export async function GET(request: NextRequest) {
  const auth = requireAdmin(request);
  if (!auth.ok) return auth.response;

  const ip = (request.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "anonymous";
  const rl = checkRateLimitForIp(ip, { capacity: 60, refillIntervalMs: 60_000 });
  if (!rl.allowed) {
    return NextResponse.json({ error: "rate_limited", retryAfterMs: rl.resetMs }, { status: 429, headers: { "Retry-After": String(Math.ceil(rl.resetMs / 1000)) } });
  }
  const url = new URL(request.url);
  const runId = url.searchParams.get("runId");

  if (!runId) {
    return NextResponse.json({ error: "runId is required" }, { status: 400 });
  }

  const shares = getSharesForRun(runId).map(toPublicShareView);
  return NextResponse.json(
    { shares },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

// Revoke a share token
export async function DELETE(request: Request) {
  const csrfRejection = verifyCsrf(request);
  if (csrfRejection) return csrfRejection;
  const ip = (request.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "anonymous";
  const rl = checkRateLimitForIp(ip, { capacity: 60, refillIntervalMs: 60_000 });
  if (!rl.allowed) {
    return NextResponse.json({ error: "rate_limited", retryAfterMs: rl.resetMs }, { status: 429, headers: { "Retry-After": String(Math.ceil(rl.resetMs / 1000)) } });
  }

  const url = new URL(request.url);
  const token = url.searchParams.get("token");

  if (!token) {
    return NextResponse.json({ error: "token is required" }, { status: 400 });
  }

  const revoked = revokeShareToken(token);
  return rotateCsrf(NextResponse.json({ revoked }));
}
