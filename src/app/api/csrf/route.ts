import { NextResponse, NextRequest } from "next/server";
import { generateCsrfToken, CSRF_COOKIE_NAME, getCsrfCookieOptions } from "@/lib/api/csrf";
import { checkCors, handleOptions } from "@/lib/api/cors";

export async function GET() {
  const token = generateCsrfToken();
  const response = NextResponse.json({ csrfToken: token });

  const opts = getCsrfCookieOptions();
  response.cookies.set(CSRF_COOKIE_NAME, token, opts);

  return response;
}

export const runtime = "nodejs";

export async function OPTIONS(request: NextRequest) {
  return handleOptions(request) || new Response(null, { status: 204 });
}
