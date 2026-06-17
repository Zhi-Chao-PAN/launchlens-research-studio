import { NextResponse } from "next/server";
import { createShareToken, getSharesForRun, revokeShareToken } from "@/lib/research/share-tokens";
import { getResearchRun } from "@/lib/research/storage";

// Create a share token for a run
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { runId, expiresInMs, maxViews } = body;

    if (!runId) {
      return NextResponse.json({ error: "runId is required" }, { status: 400 });
    }

    // Verify run exists
    const run = getResearchRun(runId);
    if (!run) {
      return NextResponse.json({ error: "Run not found" }, { status: 404 });
    }

    const share = createShareToken(runId, {
      expiresInMs: expiresInMs ? parseInt(expiresInMs) : undefined,
      maxViews: maxViews ? parseInt(maxViews) : undefined,
    });

    return NextResponse.json({
      token: share.token,
      expiresAt: share.expiresAt,
      maxViews: share.maxViews,
      createdAt: share.createdAt,
    });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}

// List shares for a run
export async function GET(request: Request) {
  const url = new URL(request.url);
  const runId = url.searchParams.get("runId");

  if (!runId) {
    return NextResponse.json({ error: "runId is required" }, { status: 400 });
  }

  const shares = getSharesForRun(runId);
  return NextResponse.json({ shares });
}

// Revoke a share token
export async function DELETE(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");

  if (!token) {
    return NextResponse.json({ error: "token is required" }, { status: 400 });
  }

  const revoked = revokeShareToken(token);
  return NextResponse.json({ revoked });
}
