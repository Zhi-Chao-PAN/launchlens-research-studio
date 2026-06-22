import { NextResponse, NextRequest } from "next/server";
import { getResearchRun } from "@/lib/research/storage";
import { jsonErrorLocalized } from "@/lib/api/validation";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const run = getResearchRun(id);

  if (!run) {
    return jsonErrorLocalized(request, "errors.notFound", 404, undefined, { id });
  }

  return NextResponse.json(run);
}
