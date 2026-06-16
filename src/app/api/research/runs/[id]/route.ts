import { NextResponse } from "next/server";
import { getResearchRun } from "@/lib/research/storage";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const run = getResearchRun(id);
  
  if (!run) {
    return NextResponse.json(
      { error: "Research run not found" },
      { status: 404 },
    );
  }

  return NextResponse.json(run);
}
