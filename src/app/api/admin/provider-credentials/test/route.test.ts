// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { ProviderCredentialsConflictError } from "@/lib/admin/provider-credentials";

const mocks = vi.hoisted(() => ({
  connectionTest: vi.fn(),
  requireAdmin: vi.fn(),
  verifyCsrf: vi.fn(),
  recordAuthAudit: vi.fn(),
}));

vi.mock("@/lib/admin/provider-connection-test", () => ({
  testProviderCredentialConnection: mocks.connectionTest,
}));
vi.mock("@/lib/api/require-admin", () => ({
  requireAdmin: mocks.requireAdmin,
}));
vi.mock("@/lib/api/csrf-guard", () => ({
  verifyCsrf: mocks.verifyCsrf,
}));
vi.mock("@/lib/api/cors", () => ({
  checkCors: vi.fn(() => ({
    allowed: true,
    headers: { "x-route-test": "cors" },
  })),
  handleOptions: vi.fn(() => null),
}));
vi.mock("@/lib/api/csrf-rotate", () => ({
  rotateCsrf: (response: Response) => response,
}));
vi.mock("@/lib/api/auth-audit", () => ({
  recordAuthAudit: mocks.recordAuthAudit,
}));
vi.mock("@/lib/providers/managed-keyring-config", () => ({
  resolveManagedKeyringTargetProvider: vi.fn(() => "openai"),
}));
vi.mock("@/lib/telemetry/request-log", () => ({
  hashIp: vi.fn(() => "ip-hash"),
}));

import { POST } from "./route";

const CREDENTIAL_ID = "a".repeat(32);

describe("POST /api/admin/provider-credentials/test", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdmin.mockReturnValue({
      ok: true,
      ip: "203.0.113.9",
      tokenHash: "admin-hash",
    });
    mocks.verifyCsrf.mockReturnValue(null);
    mocks.connectionTest.mockResolvedValue({
      ok: true,
      provider: "openai",
      slot: 2,
      baseUrl: "https://ark.cn-beijing.volces.com/api/plan/v3",
      endpoint:
        "https://ark.cn-beijing.volces.com/api/plan/v3/chat/completions",
      model: "doubao-seed-evolving",
      durationMs: 321,
      testedAt: "2026-07-16T08:00:00.000Z",
      httpStatus: 200,
    });
  });

  it("rejects unauthenticated requests before selecting a paid route", async () => {
    mocks.requireAdmin.mockReturnValue({
      ok: false,
      response: NextResponse.json({ error: "unauthorized" }, { status: 401 }),
    });

    const response = await POST(request(validBody()));

    expect(response.status).toBe(401);
    expect(mocks.connectionTest).not.toHaveBeenCalled();
  });

  it("requires CSRF before selecting a paid route", async () => {
    mocks.verifyCsrf.mockReturnValue(
      NextResponse.json({ error: "csrf_failed" }, { status: 403 }),
    );

    const response = await POST(request(validBody()));

    expect(response.status).toBe(403);
    expect(mocks.connectionTest).not.toHaveBeenCalled();
  });

  it("binds the probe to provider, slot, revision, and credential identity", async () => {
    const response = await POST(request(validBody()));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("x-route-test")).toBe("cors");
    expect(mocks.connectionTest).toHaveBeenCalledWith(
      "openai",
      2,
      CREDENTIAL_ID,
      7,
    );
    const text = await response.text();
    expect(text).not.toMatch(/apiKey|authorization|upstream/iu);
    expect(JSON.parse(text)).toMatchObject({
      data: { ok: true, slot: 2, model: "doubao-seed-evolving" },
    });
  });

  it("rejects unsupported fields and malformed credential identities", async () => {
    const cases = [
      { ...validBody(), apiKey: "must-never-be-accepted" },
      { ...validBody(), credentialId: "short" },
      { ...validBody(), expectedRevision: -1 },
    ];

    for (const body of cases) {
      const response = await POST(request(body));
      expect(response.status).toBe(422);
    }
    expect(mocks.connectionTest).not.toHaveBeenCalled();
  });

  it("maps a stale browser snapshot to a structured conflict", async () => {
    mocks.connectionTest.mockRejectedValue(
      new ProviderCredentialsConflictError(9),
    );

    const response = await POST(request(validBody()));

    expect(response.status).toBe(409);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "PROVIDER_CREDENTIALS_REVISION_CONFLICT",
        message: "Provider credentials changed. Refresh and try again.",
        currentRevision: 9,
      },
    });
  });
});

function validBody() {
  return {
    provider: "openai",
    slot: 2,
    credentialId: CREDENTIAL_ID,
    expectedRevision: 7,
  };
}

function request(body: unknown): NextRequest {
  return new NextRequest(
    "https://launchlens.example/api/admin/provider-credentials/test",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}
