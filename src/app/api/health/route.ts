import { NextResponse } from "next/server";
import { selectProvider } from "@/lib/providers/provider-registry";
import { snapshotBreakers } from "@/lib/utils/circuit-breaker";
import { snapshotFlips } from "@/lib/utils/flip-history";
import packageJson from "../../../../package.json";

const startedAt = Date.now();

export async function GET() {
  const provider = selectProvider();
  return NextResponse.json({
    status: "ok",
    version: packageJson.version,
    uptimeMs: Date.now() - startedAt,
    provider: {
      id: provider.id,
      displayName: provider.displayName,
      isMock: provider.isMock,
      supportsStreaming: provider.supportsStreaming,
    },
    breakers: snapshotBreakers(),
    flipHistory: snapshotFlips(20),
    timestamp: new Date().toISOString(),
  });
}

export const runtime = "nodejs";
