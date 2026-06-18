/// <reference types="vitest/globals" />
// Integration test: verify CORS headers are present on responses
// We can't easily test Next.js route handlers in unit tests,
// but we can verify the cors.ts module logic directly.

import { checkCors, corsConfig } from "@/lib/api/cors";
import { NextRequest } from "next/server";

// Mock request helper
function mockReq(method: string, origin?: string): NextRequest {
  const headers = new Headers();
  if (origin) headers.set("origin", origin);
  return { method, headers } as unknown as NextRequest;
}

describe("CORS module behavior", () => {
  // These tests run with default env (permissive mode)
  // We can't easily test strict mode without reimporting,
  // but we verify the public API shape.

  describe("permissive mode", () => {
    it("returns wildcard origin for any request", () => {
      const result = checkCors(mockReq("GET", "https://anything.com"));
      expect(result.allowed).toBe(true);
      expect(result.headers["Access-Control-Allow-Origin"]).toBe("*");
    });

    it("returns wildcard origin for no-origin request", () => {
      const result = checkCors(mockReq("GET"));
      expect(result.allowed).toBe(true);
      expect(result.headers["Access-Control-Allow-Origin"]).toBe("*");
    });

    it("includes standard headers", () => {
      const result = checkCors(mockReq("POST"));
      expect(result.headers["Access-Control-Allow-Methods"]).toBeTruthy();
      expect(result.headers["Access-Control-Allow-Headers"]).toBeTruthy();
      expect(result.headers["Access-Control-Max-Age"]).toBe("86400");
    });

    it("corsConfig reports non-strict", () => {
      expect(corsConfig.strict).toBe(false);
      expect(Array.isArray(corsConfig.allowedOrigins)).toBe(true);
    });
  });

  describe("strict mode simulation", () => {
    // We can't re-import with different env vars in this test setup,
    // but we can verify that checkCors returns the expected shape
    // when allowed = false (which happens in strict mode for bad origins)
    it("returns consistent result shape", () => {
      const result = checkCors(mockReq("GET"));
      expect(result).toHaveProperty("allowed");
      expect(result).toHaveProperty("headers");
      expect(typeof result.allowed).toBe("boolean");
      expect(typeof result.headers).toBe("object");
    });
  });
});
