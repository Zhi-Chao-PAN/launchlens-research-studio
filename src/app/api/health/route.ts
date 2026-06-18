import { NextResponse } from "next/server";
import { selectProvider } from "@/lib/providers/provider-registry";
import { getSchedulerStats } from "@/lib/research/scheduler";
import { summarizeTelemetry } from "@/lib/telemetry/telemetry";
import { snapshotBreakers } from "@/lib/utils/circuit-breaker";
import packageJson from "../../../../package.json";

const STARTED_AT = Date.now();

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const provider = selectProvider();
  const scheduler = getSchedulerStats();
  const telemetry = summarizeTelemetry();
  const breakers = snapshotBreakers();
  const openBreakers = Object.values(breakers).filter((b) => b.openedAt !== null).length;

  return NextResponse.json({
    status: "ok",
    service: packageJson.name,
    version: packageJson.version,
    uptimeMs: Date.now() - STARTED_AT,
    startedAt: STARTED_AT,
    provider: {
      id: provider.id,
      displayName: provider.displayName,
      isMock: provider.isMock,
      supportsStreaming: provider.supportsStreaming,
    },
    scheduler,
    telemetry: {
      total: telemetry.total,
      successRate: telemetry.successRate,
      averageMs: telemetry.averageMs,
    },
    breakers: {
      total: Object.keys(breakers).length,
      open: openBreakers,
    },
    timestamp: Date.now(),
  });
}
