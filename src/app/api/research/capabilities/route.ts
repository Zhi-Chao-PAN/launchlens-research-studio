import { NextResponse } from "next/server";
import { probeDeepResearchCapability } from "@/lib/research/deep-research/capability";
import { RESEARCH_MODE_CONFIGS } from "@/lib/research/research-modes";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const deep = await probeDeepResearchCapability();
  return NextResponse.json(
    {
      checkedAt: deep.checkedAt,
      modes: {
        standard: RESEARCH_MODE_CONFIGS.standard,
        deep,
      },
    },
    {
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
      },
    },
  );
}
