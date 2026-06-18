/// <reference types="vitest/globals" />
import {
  generateCsrfToken,
  checkCsrfToken,
  CSRF_COOKIE_NAME,
  CSRF_HEADER_NAME,
  getCsrfCookieOptions,
} from "@/lib/api/csrf";
import { NextRequest } from "next/server";

// Mock NextRequest builder for testing
function mockRequest(cookieToken?: string, headerToken?: string): NextRequest {
  const headers = new Headers();
  if (headerToken) headers.set(CSRF_HEADER_NAME, headerToken);

  const req = new Request("http://localhost/api/test", { headers });
  const nextReq = req as unknown as NextRequest;
  
  // Mock cookies are read-only in the real impl; add a mock getter
  Object.defineProperty(nextReq, "cookies", {
    value: {
      get(name: string) {
        if (name === CSRF_COOKIE_NAME && cookieToken) {
        return { value: cookieToken };
      }
      return undefined;
    },
  },
  });
  return nextReq;
}

describe("csrf", () => {
  describe("generateCsrfToken", () => {
    it("generates hex tokens of consistent length", () => {
      const t1 = generateCsrfToken();
      const t2 = generateCsrfToken();
      expect(t1).toMatch(/^[a-f0-9]{64}$/);
      expect(t2).toMatch(/^[a-f0-9]{64}$/);
      expect(t1).not.toBe(t2);
    });
  });

  describe("checkCsrfToken", () => {
    it("passes with matching token (soft mode)", () => {
      const token = generateCsrfToken();
      const req = mockRequest(token, token);
      const result = checkCsrfToken(req, false);
      expect(result.ok).toBe(true);
    });

    it("passes with no tokens (soft mode)", () => {
      const req = mockRequest();
      const result = checkCsrfToken(req, false);
      expect(result.ok).toBe(true);
      expect(result.reason).toBe("no-csrf-soft-mode");
    });

    it("fails with only cookie (soft mode)", () => {
      const req = mockRequest("tok-cookie", undefined);
      const result = checkCsrfToken(req, false);
      expect(result.ok).toBe(false);
      expect(result.reason).toBe("csrf-mismatch-one-sided");
    });

    it("fails with only header (soft mode)", () => {
      const req = mockRequest(undefined, "tok-header");
      const result = checkCsrfToken(req, false);
      expect(result.ok).toBe(false);
    });

    it("fails with mismatched tokens (soft mode)", () => {
      const req = mockRequest("tok-a", "tok-b");
      const result = checkCsrfToken(req, false);
      expect(result.ok).toBe(false);
      expect(result.reason).toBe("csrf-token-mismatch");
    });

    it("fails with no tokens (strict mode)", () => {
      const req = mockRequest();
      const result = checkCsrfToken(req, true);
      expect(result.ok).toBe(false);
      expect(result.reason).toBe("missing-csrf");
    });

    it("passes with matching tokens (strict mode)", () => {
      const token = generateCsrfToken();
      const req = mockRequest(token, token);
      const result = checkCsrfToken(req, true);
      expect(result.ok).toBe(true);
    });
  });

  describe("getCsrfCookieOptions", () => {
    it("returns sensible defaults", () => {
      const opts = getCsrfCookieOptions();
      expect(opts.httpOnly).toBe(true);
      expect(opts.sameSite).toBe("lax");
      expect(opts.path).toBe("/");
      expect(opts.maxAge).toBeGreaterThan(0);
    });
  });
});
