import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  clearAdminSessionCookie,
  createAdminSession,
  setAdminSessionCookie,
} from "@/lib/api/admin-session";
import { verifyCsrf } from "@/lib/api/csrf-guard";
import { rotateCsrf } from "@/lib/api/csrf-rotate";
import { checkCors, handleOptions } from "@/lib/api/cors";
import { requireAdmin } from "@/lib/api/require-admin";

export async function GET(request: NextRequest) {
  const cors = checkCors(request);
  if (!cors.allowed && cors.response) return cors.response;
  const auth = requireAdmin(request);
  if (!auth.ok) return auth.response;
  return NextResponse.json({ authenticated: true }, { headers: cors.headers });
}

export async function POST(request: NextRequest) {
  const cors = checkCors(request);
  if (!cors.allowed && cors.response) return cors.response;
  const csrfRejection = verifyCsrf(request);
  if (csrfRejection) return csrfRejection;
  const auth = requireAdmin(request);
  if (!auth.ok) return auth.response;

  try {
    const session = createAdminSession(auth.tokenHash);
    return rotateCsrf(setAdminSessionCookie(
      NextResponse.json(
        { authenticated: true, expiresAt: session.expiresAt },
        { status: 201, headers: cors.headers },
      ),
      session,
    ));
  } catch {
    return NextResponse.json(
      { error: "Admin session signing is not configured." },
      { status: 503, headers: cors.headers },
    );
  }
}

export async function DELETE(request: NextRequest) {
  const cors = checkCors(request);
  if (!cors.allowed && cors.response) return cors.response;
  const csrfRejection = verifyCsrf(request);
  if (csrfRejection) return csrfRejection;
  return rotateCsrf(clearAdminSessionCookie(
    NextResponse.json({ authenticated: false }, { headers: cors.headers }),
  ));
}

export const runtime = "nodejs";

export async function OPTIONS(request: NextRequest) {
  return handleOptions(request) || new Response(null, { status: 204 });
}
