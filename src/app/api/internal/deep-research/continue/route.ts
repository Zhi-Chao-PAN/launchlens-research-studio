import { after, NextRequest, NextResponse } from "next/server";
import { createDeepResearchService } from "@/lib/research/deep-research/runtime";
import { isDeepWorkerAuthorized } from "@/lib/research/deep-research/worker-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

const SESSION_ID_PATTERN = /^[a-z0-9]{1,128}$/i;

export async function POST(request: NextRequest) {
  const suppliedSecret = request.headers.get("x-launchlens-deep-worker-secret") || "";
  if (!isDeepWorkerAuthorized(suppliedSecret)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }
  const sessionId =
    body && typeof body === "object" && "sessionId" in body
      ? (body as { sessionId?: unknown }).sessionId
      : undefined;
  if (typeof sessionId !== "string" || !SESSION_ID_PATTERN.test(sessionId)) {
    return NextResponse.json({ error: "Invalid session id." }, { status: 400 });
  }

  const workerId =
    request.headers.get("x-vercel-id")?.slice(0, 160) ||
    `worker-${crypto.randomUUID()}`;
  after(async () => {
    try {
      await createDeepResearchService().signal({
        kind: "continue",
        sessionId,
        workerId,
      });
    } catch (error) {
      console.error(
        `[deep-research] continuation failed for ${sessionId}:`,
        error instanceof Error ? error.message : "unknown failure",
      );
    }
  });

  return NextResponse.json(
    { accepted: true, sessionId },
    { status: 202, headers: { "Cache-Control": "no-store" } },
  );
}
