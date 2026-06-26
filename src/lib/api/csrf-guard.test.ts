/// <reference types="vitest/globals" />
import { describe, it, expect, afterEach } from "vitest";
import { verifyCsrf } from "@/lib/api/csrf-guard";

function makeReq(method: string, opts: { cookie?: string; header?: string } = {}) {
  const headers = new Headers();
  if (opts.cookie) headers.set("cookie", "csrf_token=" + opts.cookie);
  if (opts.header) headers.set("x-csrf-token", opts.header);
  return new Request("http://localhost/x", { method, headers });
}

describe("csrf-guard (round 176)", () => {
  afterEach(() => { delete process.env.LAUNCHLENS_CSRF_STRICT; });

  it("allows GET/HEAD/OPTIONS without token", () => {
    expect(verifyCsrf(makeReq("GET"))).toBeNull();
    expect(verifyCsrf(makeReq("HEAD"))).toBeNull();
    expect(verifyCsrf(makeReq("OPTIONS"))).toBeNull();
  });

  it("R202: default mode is strict — POST with neither cookie nor header is rejected", () => {
    // R202 flipped the default to strict: a request with no CSRF token at all
    // is rejected with 403. The legacy soft behaviour is only available
    // behind LAUNCHLENS_CSRF_STRICT=0 (see the next test).
    delete process.env.LAUNCHLENS_CSRF_STRICT;
    const res = verifyCsrf(makeReq("POST"));
    expect(res).not.toBeNull();
    expect(res!.status).toBe(403);
  });

  it("LAUNCHLENS_CSRF_STRICT=0 restores legacy soft-mode (POST with no token allowed)", () => {
    process.env.LAUNCHLENS_CSRF_STRICT = "0";
    expect(verifyCsrf(makeReq("POST"))).toBeNull();
  });

  it("LAUNCHLENS_CSRF_STRICT=1 explicitly opts into strict mode", () => {
    process.env.LAUNCHLENS_CSRF_STRICT = "1";
    const res = verifyCsrf(makeReq("POST"));
    expect(res).not.toBeNull();
    expect(res!.status).toBe(403);
  });

  it("rejects POST when only cookie is present (one-sided)", () => {
    const res = verifyCsrf(makeReq("POST", { cookie: "abc" }));
    expect(res).not.toBeNull();
    expect(res!.status).toBe(403);
  });

  it("rejects POST when only header is present (one-sided)", () => {
    const res = verifyCsrf(makeReq("POST", { header: "abc" }));
    expect(res).not.toBeNull();
    expect(res!.status).toBe(403);
  });

  it("rejects POST with mismatched tokens", () => {
    const res = verifyCsrf(makeReq("POST", { cookie: "aaa", header: "bbb" }));
    expect(res).not.toBeNull();
    expect(res!.status).toBe(403);
  });

  it("allows POST when cookie and header match", () => {
    const res = verifyCsrf(makeReq("POST", { cookie: "tok123", header: "tok123" }));
    expect(res).toBeNull();
  });

  it("allows DELETE/PATCH with matching tokens", () => {
    expect(verifyCsrf(makeReq("DELETE", { cookie: "x", header: "x" }))).toBeNull();
    expect(verifyCsrf(makeReq("PATCH", { cookie: "x", header: "x" }))).toBeNull();
    expect(verifyCsrf(makeReq("PUT", { cookie: "x", header: "x" }))).toBeNull();
  });

  it("does not throw when cookie/header lengths differ (timingSafeEqual guard)", () => {
    const headers = new Headers();
    headers.set("cookie", "csrf_token=short");
    headers.set("x-csrf-token", "muchlongerstringhere");
    const req = new Request("http://localhost/x", { method: "POST", headers });
    const res = verifyCsrf(req);
    expect(res).not.toBeNull();
    expect(res!.status).toBe(403);
  });

    it("URL-decodes cookie value to support server-side encoding", () => {
    const headers = new Headers();
    headers.set("cookie", "csrf_token=hello%20world");
    headers.set("x-csrf-token", "hello world");
    const req = new Request("http://localhost/x", { method: "POST", headers });
    expect(verifyCsrf(req)).toBeNull();
  });
});
