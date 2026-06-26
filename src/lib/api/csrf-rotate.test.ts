// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextResponse } from "next/server";
import { rotateCsrf } from "./csrf-rotate";
import { CSRF_HEADER_NAME } from "./csrf";

describe("rotateCsrf helper (round 200)", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("sets X-CSRF-Token header and csrf_token cookie on success response", async () => {
    const resp = NextResponse.json({ ok: true });
    const rotated = rotateCsrf(resp);
    const tok = rotated.headers.get(CSRF_HEADER_NAME);
    expect(tok && tok.length >= 32).toBe(true);
    const setCookie = rotated.headers.getSetCookie
      ? rotated.headers.getSetCookie().find(c => c.startsWith("csrf_token="))
      : null;
    expect(setCookie).toBeTruthy();
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=lax");
  });

  it("returns a fresh token each call (rotation)", () => {
    const a = rotateCsrf(NextResponse.json({}));
    const b = rotateCsrf(NextResponse.json({}));
    expect(a.headers.get(CSRF_HEADER_NAME)).not.toBe(b.headers.get(CSRF_HEADER_NAME));
  });

  it("preserves the original response body and status after rotation", async () => {
    const resp = NextResponse.json({ ok: true, items: [1, 2, 3] }, { status: 201 });
    const rotated = rotateCsrf(resp);
    expect(rotated.status).toBe(201);
    const text = await rotated.text();
    expect(JSON.parse(text)).toEqual({ ok: true, items: [1, 2, 3] });
    expect(rotated.headers.get(CSRF_HEADER_NAME)).toBeTruthy();
  });

  it("cookie is httpOnly so client-side JS cannot read it (defence-in-depth)", () => {
    const rotated = rotateCsrf(NextResponse.json({}));
    const setCookie = rotated.headers.getSetCookie
      ? rotated.headers.getSetCookie().find((c) => c.startsWith("csrf_token="))
      : null;
    expect(setCookie).toBeTruthy();
    expect(setCookie).toContain("HttpOnly");
  });
});
