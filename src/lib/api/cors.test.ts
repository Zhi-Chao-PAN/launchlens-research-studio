/// <reference types="vitest/globals" />
// Integration test: verify CORS headers are present on responses
// We can't easily test Next.js route handlers in unit tests,
// but we can verify the cors.ts module logic directly.

import { checkCors, corsConfig } from "@/lib/api/cors";
import { NextRequest } from "next/server";

function mockReq(method: string, origin?: string): NextRequest {
  const headers = new Headers();
  if (origin) headers.set("origin", origin);
  return new NextRequest("https://launchlens.test/api/research", { method, headers });
}

describe("CORS module behavior", () => {
  describe("secure same-origin default", () => {
    it("allows and echoes the request origin when it is same-origin", () => {
      const result = checkCors(mockReq("GET", "https://launchlens.test"));
      expect(result.allowed).toBe(true);
      expect(result.headers["Access-Control-Allow-Origin"]).toBe("https://launchlens.test");
    });

    it("allows non-browser requests without emitting a wildcard origin", () => {
      const result = checkCors(mockReq("GET"));
      expect(result.allowed).toBe(true);
      expect(result.headers["Access-Control-Allow-Origin"]).toBeUndefined();
    });

    it("rejects cross-origin requests unless explicitly allowlisted", () => {
      const result = checkCors(mockReq("GET", "https://anything.com"));
      expect(result.allowed).toBe(false);
      expect(result.response?.status).toBe(403);
    });

    it("includes standard headers", () => {
      const result = checkCors(mockReq("POST"));
      expect(result.headers["Access-Control-Allow-Methods"]).toBeTruthy();
      expect(result.headers["Access-Control-Allow-Headers"]).toBeTruthy();
      expect(result.headers["Access-Control-Max-Age"]).toBe("86400");
    });

    it("corsConfig reports strict same-origin mode", () => {
      expect(corsConfig.strict).toBe(true);
      expect(corsConfig.mode).toBe("same-origin");
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
