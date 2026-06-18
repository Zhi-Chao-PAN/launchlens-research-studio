import { NextResponse } from "next/server";
import { verifyCsrf } from "@/lib/api/csrf-guard";
import { createShareToken, getSharesForRun, revokeShareToken } from "@/lib/research/share-tokens";
import { checkRateLimitForIp } from "@/lib/api/rate-limit";
import { getResearchRun } from "@/lib/research/storage";

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
    const run = getResearchRun(runId);
    if (!run) {
      return NextResponse.json({ error: "Run not found" }, { status: 404 });
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

    return NextResponse.json({
      token: share.token,
      expiresAt: share.expiresAt,
      maxViews: share.maxViews,
      createdAt: share.createdAt,
    });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}

// List shares for a run
export async function GET(request: Request) {
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

  const shares = getSharesForRun(runId);
  return NextResponse.json({ shares });
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
  return NextResponse.json({ revoked });
}
