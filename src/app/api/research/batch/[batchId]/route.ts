import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getBatch } from "@/lib/research/batch-manager";
import { jsonErrorLocalized } from "@/lib/api/validation";

// GET /api/research/batch/[batchId] — get batch status
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ batchId: string }> },
) {
  const { batchId } = await params;
  const batch = getBatch(batchId);

  if (!batch) {
    return jsonErrorLocalized(request, "errors.notFound", 404, undefined, { batchId });
  }

  return NextResponse.json(batch);
}
