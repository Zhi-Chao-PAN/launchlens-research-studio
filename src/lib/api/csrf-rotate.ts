import { NextResponse } from "next/server";
import { generateCsrfToken, CSRF_COOKIE_NAME, CSRF_HEADER_NAME, getCsrfCookieOptions } from "@/lib/api/csrf";

/**
 * Attach a freshly rotated CSRF token to a successful JSON response.
 * Call this from mutating handlers (POST/PUT/PATCH/DELETE) after the main
 * business logic completes:
 *
 *   return rotateCsrf(NextResponse.json({ ok: true }));
 *
 * The next mutation from the browser reads the new token from the
 * X-CSRF-Token response header (via csrf-client) and from the Set-Cookie,
 * so a stolen token can only be used once before it rolls.
 */
export function rotateCsrf(response: NextResponse): NextResponse {
  const token = generateCsrfToken();
  response.headers.set(CSRF_HEADER_NAME, token);
  response.cookies.set(CSRF_COOKIE_NAME, token, getCsrfCookieOptions());
  return response;
}
