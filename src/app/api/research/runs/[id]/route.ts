import { NextResponse, NextRequest } from "next/server";
import { getResearchRun } from "@/lib/research/storage";
import {
  getPersistentResearchRun,
  researchRunFromSession,
  storePersistentResearchRun,
} from "@/lib/research/run-store";
import { fetchSession } from "@/lib/research/session-store";
import { jsonErrorLocalized } from "@/lib/api/validation";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  let run = getResearchRun(id) ?? (await getPersistentResearchRun(id));
  if (!run) {
    const session = await fetchSession(id);
    if (session && ["completed", "cancelled", "error"].includes(session.status)) {
      run = researchRunFromSession(session);
      void storePersistentResearchRun(run);
    }
  }

  if (!run) {
    return jsonErrorLocalized(request, "errors.notFound", 404, undefined, { id });
  }

  return NextResponse.json(run);
}
