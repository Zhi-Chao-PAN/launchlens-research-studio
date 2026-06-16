import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  revokeBypassToken,
  isBypassToken,
  extractBearerToken,
} from "@/lib/api/bypass-tokens";

function isAdminRequest(request: NextRequest): boolean {
  const auth = request.headers.get("authorization");
  const tok = extractBearerToken(auth);
  return tok ? isBypassToken(tok) : false;
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ hash: string }> },
) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { hash } = await params;
  const ok = revokeBypassToken(decodeURIComponent(hash));
  if (!ok) {
    return NextResponse.json({ error: "Token not found" }, { status: 404 });
  }
  return NextResponse.json({ revoked: hash });
}

export const runtime = "nodejs";
