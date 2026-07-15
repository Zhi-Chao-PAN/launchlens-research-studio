// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NextRequest, type NextResponse } from "next/server";
import {
  ADMIN_SESSION_COOKIE,
  createAdminSession,
} from "@/lib/api/admin-session";
import {
  clearBypassTokens,
  createBypassToken,
  getTokenInfo,
} from "@/lib/api/bypass-tokens";
import { CSRF_COOKIE_NAME, CSRF_HEADER_NAME } from "@/lib/api/csrf";
import { DELETE, GET, POST } from "./route";

const SESSION_SECRET =
  "admin-session-route-test-secret-with-at-least-thirty-two-characters";
const originalSessionSecret = process.env.LAUNCHLENS_ADMIN_SESSION_SECRET;
const originalCsrfStrict = process.env.LAUNCHLENS_CSRF_STRICT;
const originalNodeEnv = process.env.NODE_ENV;

let ipSequence = 30;

describe("/api/admin/session", () => {
  beforeEach(() => {
    clearBypassTokens();
    process.env.LAUNCHLENS_ADMIN_SESSION_SECRET = SESSION_SECRET;
    process.env.LAUNCHLENS_CSRF_STRICT = "1";
    restoreEnv("NODE_ENV", "test");
    ipSequence += 1;
  });

  afterEach(() => {
    restoreEnv("LAUNCHLENS_ADMIN_SESSION_SECRET", originalSessionSecret);
    restoreEnv("LAUNCHLENS_CSRF_STRICT", originalCsrfStrict);
    restoreEnv("NODE_ENV", originalNodeEnv);
    clearBypassTokens();
  });

  it("accepts a valid signed admin session on GET", async () => {
    const { session } = createAdminTokenAndSession();

    const response = await GET(
      makeRequest("GET", { session: session.value }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ authenticated: true });
  });

  it("rejects a tampered or otherwise invalid signed session on GET", async () => {
    const { session } = createAdminTokenAndSession();
    const tampered = `${session.value.slice(0, -1)}${
      session.value.endsWith("x") ? "y" : "x"
    }`;

    const response = await GET(makeRequest("GET", { session: tampered }));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: "Unauthorized: missing-auth",
    });
  });

  it("exchanges an admin Bearer token for a production-safe signed cookie", async () => {
    restoreEnv("NODE_ENV", "production");
    const token = createBypassToken("admin", "session-route-login");

    const response = await POST(
      makeRequest("POST", { authorization: `Bearer ${token}` }),
    );

    expect(response.status).toBe(201);
    const bodyText = await response.text();
    const body = JSON.parse(bodyText) as {
      authenticated: boolean;
      expiresAt: number;
    };
    expect(body.authenticated).toBe(true);
    expect(body.expiresAt).toBeGreaterThan(Date.now());

    const sessionCookie = (response as NextResponse).cookies.get(ADMIN_SESSION_COOKIE);
    expect(sessionCookie?.value).toBeTruthy();
    expect(sessionCookie?.value).not.toBe(token);

    const setCookie = response.headers.get("set-cookie") || "";
    expect(setCookie).toContain(`${ADMIN_SESSION_COOKIE}=`);
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=strict/i);
    expect(setCookie).toMatch(/Path=\//i);
    expect(setCookie).toMatch(/Secure/i);
    expect(setCookie).toMatch(/Expires=/i);
    expect(response.headers.get(CSRF_HEADER_NAME)).toBeTruthy();

    expect(bodyText).not.toContain(token);
    expect(setCookie).not.toContain(token);
  });

  it("requires double-submit CSRF when rotating an existing browser session", async () => {
    const { session } = createAdminTokenAndSession();

    const response = await POST(
      makeRequest("POST", { session: session.value }),
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: "csrf_failed",
      reason: "missing-csrf",
    });
    expect((response as NextResponse).cookies.get(ADMIN_SESSION_COOKIE)).toBeUndefined();
  });

  it("rejects a non-admin Bearer token without issuing a session", async () => {
    const token = createBypassToken("bypass", "session-route-non-admin");

    const response = await POST(
      makeRequest("POST", { authorization: `Bearer ${token}` }),
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: "Unauthorized: insufficient-scope",
    });
    expect((response as NextResponse).cookies.get(ADMIN_SESSION_COOKIE)).toBeUndefined();
    expect(response.headers.get("set-cookie") || "").not.toContain(token);
  });

  it("enforces same-origin CORS before authentication or cookie issuance", async () => {
    const token = createBypassToken("admin", "session-route-cors");

    const response = await POST(
      makeRequest("POST", {
        authorization: `Bearer ${token}`,
        origin: "https://evil.example",
      }),
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "CORS origin not allowed" });
    expect((response as NextResponse).cookies.get(ADMIN_SESSION_COOKIE)).toBeUndefined();
  });

  it("fails closed with 503 when session signing is not configured", async () => {
    const token = createBypassToken("admin", "session-route-no-secret");
    delete process.env.LAUNCHLENS_ADMIN_SESSION_SECRET;

    const response = await POST(
      makeRequest("POST", { authorization: `Bearer ${token}` }),
    );

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: "Admin session signing is not configured.",
    });
    expect((response as NextResponse).cookies.get(ADMIN_SESSION_COOKIE)).toBeUndefined();
  });

  it("rejects logout without a valid double-submit CSRF token", async () => {
    const response = await DELETE(makeRequest("DELETE"));

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: "csrf_failed",
      reason: "missing-csrf",
    });
  });

  it("clears the admin cookie and rotates CSRF on logout", async () => {
    restoreEnv("NODE_ENV", "production");
    const csrf = "csrf-before-logout-0123456789";

    const response = await DELETE(makeRequest("DELETE", { csrf }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ authenticated: false });

    const rotatedCsrf = response.headers.get(CSRF_HEADER_NAME);
    expect(rotatedCsrf).toBeTruthy();
    expect(rotatedCsrf).not.toBe(csrf);
    const cookies = (response as NextResponse).cookies;
    expect(cookies.get(CSRF_COOKIE_NAME)?.value).toBe(rotatedCsrf);
    expect(cookies.get(ADMIN_SESSION_COOKIE)?.value).toBe("");

    const setCookie = response.headers.get("set-cookie") || "";
    expect(setCookie).toContain(`${ADMIN_SESSION_COOKIE}=`);
    expect(setCookie).toMatch(/Expires=Thu, 01 Jan 1970 00:00:00 GMT/i);
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=strict/i);
    expect(setCookie).toMatch(/Path=\//i);
    expect(setCookie).toMatch(/Secure/i);
  });
});

function createAdminTokenAndSession(): {
  token: string;
  session: { value: string; expiresAt: number };
} {
  const token = createBypassToken("admin", "session-route-admin");
  const tokenInfo = getTokenInfo(token);
  expect(tokenInfo).not.toBeNull();
  return { token, session: createAdminSession(tokenInfo!.hash) };
}

function makeRequest(
  method: "GET" | "POST" | "DELETE",
  options: {
    authorization?: string;
    session?: string;
    csrf?: string;
    origin?: string;
  } = {},
): NextRequest {
  const headers = new Headers({
    "x-forwarded-for": `203.0.113.${ipSequence}`,
  });
  if (options.authorization) {
    headers.set("authorization", options.authorization);
  }
  if (options.origin) headers.set("origin", options.origin);

  const cookies: string[] = [];
  if (options.session !== undefined) {
    cookies.push(
      `${ADMIN_SESSION_COOKIE}=${encodeURIComponent(options.session)}`,
    );
  }
  if (options.csrf !== undefined) {
    cookies.push(`${CSRF_COOKIE_NAME}=${encodeURIComponent(options.csrf)}`);
    headers.set(CSRF_HEADER_NAME, options.csrf);
  }
  if (cookies.length > 0) headers.set("cookie", cookies.join("; "));

  return new NextRequest("http://localhost/api/admin/session", {
    method,
    headers,
  });
}

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
