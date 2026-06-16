import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  listBypassTokens,
  createBypassToken,
  revokeBypassToken,
  isBypassToken,
  extractBearerToken,
} from "@/lib/api/bypass-tokens";

// Admin endpoint for bypass token management.
// Requires an existing bypass token in the Authorization header for auth.
//   GET  /api/admin/tokens     — list all tokens (hashes only)
//   POST /api/admin/tokens     — create a new token (body: { label? })
//   DELETE /api/admin/tokens/{hash} — revoke a token by hash

function isAdminRequest(request: NextRequest): boolean {
  const auth = request.headers.get("authorization");
  const tok = extractBearerToken(auth);
  return tok ? isBypassToken(tok) : false;
}

export async function GET(request: NextRequest) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const tokens = listBypassTokens();
  return NextResponse.json({ tokens });
}

export async function POST(request: NextRequest) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: any = {};
  try {
    body = await request.json();
  } catch {
    // empty body is fine
  }

  const token = createBypassToken(body?.label);
  return NextResponse.json({ token, label: body?.label }, { status: 201 });
}
