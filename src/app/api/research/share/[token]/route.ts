import { NextResponse, NextRequest } from "next/server";
import { jsonErrorLocalized } from "@/lib/api/validation";
import { getShareRepository } from "@/lib/research/share-repository";
import { resolveResearchRun } from "@/lib/research/resolve-run";
import {
  buildPublicShareProjection,
  createShareManifest,
  type PublicShareReportV1,
} from "@/lib/research/share-manifest";
import { checkRateLimitForIp } from "@/lib/api/rate-limit";
import {
  readLegacyPublicRunShare,
  synchronizeLegacyPublicShareViews,
} from "@/lib/research/share-tokens";

// Public endpoint: view a shared research run
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const ip = (request.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "anonymous";
  const rate = checkRateLimitForIp(ip, { capacity: 120, refillIntervalMs: 60_000 });
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "rate_limited", retryAfterMs: rate.resetMs },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil(rate.resetMs / 1000)),
          "Cache-Control": "private, no-store",
        },
      },
    );
  }
  const repository = getShareRepository();
  let share;
  let migratedLegacyReport: PublicShareReportV1 | undefined;
  try {
    // Redis executes validation + view increment in one Lua transition, so two
    // concurrent readers cannot exceed maxViews.
    share = await repository.consume(token);
  } catch {
    return NextResponse.json(
      { error: "share_storage_unavailable" },
      { status: 503, headers: { "Cache-Control": "private, no-store" } },
    );
  }

  if (!share) {
    const legacy = readLegacyPublicRunShare(token);
    if (!legacy) return shareNotFound(request);

    // The old route returned raw run/provider/model data. Migration always
    // reduces the run through today's all-sections allowlist before anything
    // is persisted or sent to the recipient.
    const manifest = createShareManifest(undefined);
    try {
      migratedLegacyReport = buildPublicShareProjection(legacy.run, manifest);
    } catch {
      return shareNotFound(request);
    }
    try {
      share = await repository.adoptLegacyAndConsume({
        token,
        runId: legacy.share.runId,
        manifest,
        report: migratedLegacyReport,
        createdAt: legacy.share.createdAt,
        expiresAt: legacy.share.expiresAt,
        views: legacy.share.views,
        maxViews: legacy.share.maxViews,
      });
    } catch {
      return NextResponse.json(
        { error: "share_storage_unavailable" },
        { status: 503, headers: { "Cache-Control": "private, no-store" } },
      );
    }
    if (!share) return shareNotFound(request);
    synchronizeLegacyPublicShareViews(token, share.views);
  }

  try {
    // New records carry the immutable allowlisted snapshot. Legacy records
    // created before snapshot-backed sharing still resolve their run once.
    let report = migratedLegacyReport ?? share.report;
    if (!report) {
      const run = await resolveResearchRun(share.runId);
      if (!run || run.status !== "completed") return shareNotFound(request);
      report = buildPublicShareProjection(run, share.manifest);
    }
    return NextResponse.json(
      {
        report,
        share: {
          views: share.views,
          maxViews: share.maxViews,
          expiresAt: share.expiresAt,
          sections: [...share.manifest.sections],
        },
      },
      {
        headers: {
          "Cache-Control": "private, no-store",
          "X-Robots-Tag": "noindex, nofollow, noarchive",
        },
      },
    );
  } catch {
    // A malformed or legacy result must never fall through to returning the
    // raw run, which would bypass the creator's section manifest.
    return shareNotFound(request);
  }
}

function shareNotFound(request: NextRequest): NextResponse {
  const response = jsonErrorLocalized(request, "errors.notFound", 404);
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  return response;
}
