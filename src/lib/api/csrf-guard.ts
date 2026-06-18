import { NextResponse } from "next/server";
import { checkCsrfToken, CSRF_COOKIE_NAME, CSRF_HEADER_NAME } from "@/lib/api/csrf";

/**
 * Run CSRF verification for a mutating request. Returns a 403 Response if
 * verification fails, or null if the handler should proceed. GET/HEAD/OPTIONS
 * always pass through. Accepts both plain Request and NextRequest so it works
 * in every app route handler.
 */
export function verifyCsrf(request: Request): Response | null {
  const method = (request.method || "GET").toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return null;

  // Build a NextRequest-shaped view for checkCsrfToken. It only uses cookies
  // and headers, so we polyfill by reading the Cookie header directly.
  const cookieHeader = request.headers.get("cookie") || "";
  const cookieToken = readCookie(cookieHeader, CSRF_COOKIE_NAME);
  const headerToken = request.headers.get(CSRF_HEADER_NAME);

  const strict = process.env.LAUNCHLENS_CSRF_STRICT === "1";
  if (!cookieToken && !headerToken) {
    if (strict) {
      return NextResponse.json({ error: "csrf_failed", reason: "missing-csrf" }, { status: 403 });
    }
    return null; // soft mode allows for backward compat
  }
  if (!cookieToken || !headerToken) {
    return NextResponse.json({ error: "csrf_failed", reason: "csrf-mismatch-one-sided" }, { status: 403 });
  }
  if (cookieToken !== headerToken) {
    return NextResponse.json({ error: "csrf_failed", reason: "csrf-token-mismatch" }, { status: 403 });
  }
  return null;
}

function readCookie(header: string, name: string): string | undefined {
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const k = part.slice(0, eq).trim();
    if (k === name) return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return undefined;
}
