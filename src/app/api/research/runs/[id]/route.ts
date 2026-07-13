import { NextResponse, NextRequest } from "next/server";
import { resolveResearchRun } from "@/lib/research/resolve-run";
import { jsonErrorLocalized } from "@/lib/api/validation";
import { isValidResearchRunId } from "@/lib/research/run-id";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!isValidResearchRunId(id)) {
    return jsonErrorLocalized(request, "errors.badRequest", 400, undefined, {
      field: "id",
    });
  }

  const run = await resolveResearchRun(id);

  if (!run) {
    return jsonErrorLocalized(request, "errors.notFound", 404, undefined, { id });
  }

  return NextResponse.json(run);
}
