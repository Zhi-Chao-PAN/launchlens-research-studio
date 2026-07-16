import { NextResponse, type NextRequest } from "next/server";
import { verifyCsrf } from "@/lib/api/csrf-guard";
import { rotateCsrf } from "@/lib/api/csrf-rotate";
import { checkRateLimitForIp } from "@/lib/api/rate-limit";
import { requireAdmin } from "@/lib/api/require-admin";
import { resolveResearchRun } from "@/lib/research/resolve-run";
import {
  buildPublicShareProjection,
  createShareManifest,
  ShareManifestValidationError,
  ShareProjectionError,
} from "@/lib/research/share-manifest";
import { getShareRepository } from "@/lib/research/share-repository";
import { revokeShareToken } from "@/lib/research/share-tokens";
import { recordResearchFunnelEvent } from "@/lib/research/funnel-analytics";

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
    const { runId, expiresInMs, maxViews, sections } = body;

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

    const manifest = createShareManifest(sections);
    // Validate that this completed run can be reduced to the strict public DTO
    // before returning a capability that would fail when opened later.
    const report = buildPublicShareProjection(run, manifest);
    const share = await getShareRepository().create({
      runId,
      manifest,
      report,
      expiresInMs: expiresMs,
      maxViews: maxViewsN,
    });
    await recordResearchFunnelEvent("share_created", runId, {
      mode: run.mode,
    });

    return rotateCsrf(
      NextResponse.json(
        {
          token: share.token,
          // This independent capability is returned once to the creator. The
          // repository stores only its SHA-256 digest.
          manageToken: share.manageToken,
          expiresAt: share.expiresAt,
          maxViews: share.maxViews,
          createdAt: share.createdAt,
          sections: share.sections,
        },
        { headers: { "Cache-Control": "private, no-store" } },
      ),
    );
  } catch (error) {
    if (error instanceof ShareManifestValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof ShareProjectionError) {
      return NextResponse.json({ error: error.message }, { status: 422 });
    }
    if (error instanceof Error && error.name === "ShareRepositoryUnavailableError") {
      return NextResponse.json({ error: "share_storage_unavailable" }, { status: 503 });
    }
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

  try {
    const shares = await getShareRepository().listForRun(runId);
    return NextResponse.json(
      { shares },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch {
    return NextResponse.json({ error: "share_storage_unavailable" }, { status: 503 });
  }
}

// Revoke a share. The public share token grants read access only; revocation
// additionally requires the creator's one-time management capability or a
// separately authenticated administrator.
export async function DELETE(request: NextRequest) {
  const csrfRejection = verifyCsrf(request);
  if (csrfRejection) return csrfRejection;
  const ip = (request.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "anonymous";
  const rl = checkRateLimitForIp(ip, { capacity: 60, refillIntervalMs: 60_000 });
  if (!rl.allowed) {
    return NextResponse.json({ error: "rate_limited", retryAfterMs: rl.resetMs }, { status: 429, headers: { "Retry-After": String(Math.ceil(rl.resetMs / 1000)) } });
  }

  let body: Record<string, unknown> = {};
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    // Keep accepting the legacy query token for an authenticated admin, but a
    // public token in the URL is never sufficient authority by itself.
  }
  const url = new URL(request.url);
  const token = typeof body.token === "string" ? body.token : url.searchParams.get("token");
  const manageToken = typeof body.manageToken === "string" ? body.manageToken : null;

  if (!token) {
    return NextResponse.json({ error: "token is required" }, { status: 400 });
  }

  const authority = manageToken
    ? { kind: "manager" as const, manageToken }
    : null;
  let isAdmin = false;
  if (!authority) {
    const auth = requireAdmin(request);
    if (!auth.ok) return auth.response;
    isAdmin = true;
  }

  try {
    const repository = getShareRepository();
    // Every authenticated admin revocation writes the durable migration
    // tombstone, even when this serverless instance has no copy of the legacy
    // Map. Otherwise a different warm instance could resurrect the token.
    if (isAdmin) revokeShareToken(token);
    let revoked = isAdmin
      ? await repository.revokeLegacy(token)
      : await repository.revoke(token, authority!);
    if (isAdmin && !revoked) {
      // Outside the bounded compatibility window no tombstone is needed, but
      // an administrator must still be able to revoke an ordinary new share.
      revoked = await repository.revoke(token, { kind: "admin" });
    }
    if (!revoked) {
      return NextResponse.json(
        { error: "invalid_share_management_capability" },
        { status: authority ? 403 : 404 },
      );
    }
    return rotateCsrf(NextResponse.json({ revoked: true }));
  } catch {
    return NextResponse.json({ error: "share_storage_unavailable" }, { status: 503 });
  }
}
