import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getBatch } from "@/lib/research/batch-manager";

// GET /api/research/batch/[batchId] — get batch status
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ batchId: string }> },
) {
  const { batchId } = await params;
  const batch = getBatch(batchId);

  if (!batch) {
    return NextResponse.json({ error: "Batch not found" }, { status: 404 });
  }

  return NextResponse.json(batch);
}
