import { NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/api/rate-limit";
import {
  createResearchSession,
  runResearchSession,
} from "@/lib/research/research-engine";
import {
  validateResearchRequest,
  jsonValidationError,
  jsonError,
} from "@/lib/api/validation";

export async function POST(request: Request) {
  const ip = (request.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "anonymous";
  const rate = checkRateLimit("research:" + ip);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Please retry shortly.", resetMs: rate.resetMs },
      {
        status: 429,
        headers: {
          "X-RateLimit-Remaining": String(rate.remaining),
          "X-RateLimit-Reset-Ms": String(rate.resetMs),
        },
      },
    );
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Request body must be valid JSON.", 400);
  }

  const validation = validateResearchRequest(body);
  if (!validation.ok) {
    return jsonValidationError(validation);
  }

  const { query, keywords } = validation.value;
  const session = createResearchSession(query, keywords);

  // Start the research in the background. We don't await it so the client
  // can connect to the SSE stream immediately. Errors are logged but do not
  // propagate to the response (the client polls/streams for status).
  runResearchSession(session.id).catch((err) => {
    console.error(`[research] session ${session.id} failed:`, err);
  });

  return NextResponse.json(
    {
      sessionId: session.id,
      query: session.query,
      keywords: session.keywords,
      status: session.status,
      agents: Object.fromEntries(
        Object.entries(session.agents).map(([id, state]) => [
          id,
          {
            status: state.status,
            progress: state.progress,
            currentStep: state.currentStep,
          },
        ]),
      ),
    },
    { status: 201 },
  );
}

export async function GET() {
  return NextResponse.json(
    { error: "Use POST to create a research session." },
    {
      status: 405,
      headers: { Allow: "POST" },
    },
  );
}
