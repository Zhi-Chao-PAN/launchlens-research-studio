import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  checkCsrfToken: vi.fn(),
  selectProvider: vi.fn(),
}));

vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimitForIp: vi.fn(() => ({ allowed: true, remaining: 9, resetMs: 0 })),
}));
vi.mock("@/lib/api/csrf", () => ({ checkCsrfToken: mocks.checkCsrfToken }));
vi.mock("@/lib/api/csrf-rotate", () => ({
  rotateCsrf: (response: Response) => response,
}));
vi.mock("@/lib/api/bypass-tokens", () => ({
  extractBearerToken: vi.fn(() => undefined),
  isBypassToken: vi.fn(() => false),
}));
vi.mock("@/lib/telemetry/request-log", () => ({
  hashIp: vi.fn(() => "ip-hash"),
  recordRequest: vi.fn(),
}));
vi.mock("@/lib/api/cors", () => ({
  checkCors: vi.fn(() => ({ allowed: true, headers: {} })),
  handleOptions: vi.fn(() => null),
}));
vi.mock("@/lib/providers/provider-registry", () => ({
  selectProvider: mocks.selectProvider,
}));

import { POST } from "./route";

describe("POST /api/provider/test CSRF boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.checkCsrfToken.mockReturnValue({ ok: false, reason: "missing-csrf" });
  });

  it("rejects a failed CSRF result object before selecting a paid provider", async () => {
    const response = await POST(
      new NextRequest("https://example.test/api/provider/test", { method: "POST" }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: "Invalid CSRF token" });
    expect(mocks.selectProvider).not.toHaveBeenCalled();
  });
});
