import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { createBatch, listBatches } from "@/lib/research/batch-manager";

const BatchSchema = z.object({
  queries: z.array(z.string().min(1).max(500)).min(1).max(10),
  keywords: z.array(z.string()).optional().default([]),
  provider: z.string().optional(),
  model: z.string().optional(),
});

// POST /api/research/batch — create a batch of research runs
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = BatchSchema.safeParse(body);
    
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.message },
        { status: 400 },
      );
    }

    const { queries, keywords, provider, model } = parsed.data;
    const batch = createBatch(queries, keywords, { provider, model });

    return NextResponse.json(
      {
        batchId: batch.id,
        total: batch.total,
        status: batch.status,
        runs: batch.runs.map((r) => ({ query: r.query, status: r.status })),
      },
      { status: 202 },
    );
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Internal error" },
      { status: 500 },
    );
  }
}

// GET /api/research/batch — list recent batches
export async function GET() {
  const batches = listBatches(20);
  return NextResponse.json({ batches });
}
