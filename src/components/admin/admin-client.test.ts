// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

const { fetchWithCsrfMock, parseRateLimitMock } = vi.hoisted(() => ({
  fetchWithCsrfMock: vi.fn(),
  parseRateLimitMock: vi.fn(() => ({ limited: false, retryAfterMs: null })),
}));

vi.mock("@/lib/api/csrf-client", () => ({
  fetchWithCsrf: fetchWithCsrfMock,
  parseRateLimit: parseRateLimitMock,
}));

import {
  createAdminSession,
  getAdminStats,
  getProviderCredentials,
  saveProviderCredential,
} from "./admin-client";

describe("admin-client", () => {
  beforeEach(() => {
    fetchWithCsrfMock.mockReset();
    parseRateLimitMock.mockClear();
  });

  it("uses the administrator token only for the one-time session exchange", async () => {
    fetchWithCsrfMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ authenticated: true }), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ research: { total: 4 } }), { status: 200 }));

    await createAdminSession("  admin-secret-token  ");
    await getAdminStats();

    expect(fetchWithCsrfMock).toHaveBeenCalledTimes(2);
    const [sessionPath, sessionInit] = fetchWithCsrfMock.mock.calls[0] as [string, RequestInit];
    const [statsPath, statsInit] = fetchWithCsrfMock.mock.calls[1] as [string, RequestInit];
    expect(sessionPath).toBe("/api/admin/session");
    expect(sessionInit.method).toBe("POST");
    expect((sessionInit.headers as Headers).get("Authorization")).toBe("Bearer admin-secret-token");
    expect(sessionInit.credentials).toBe("same-origin");
    expect(statsPath).toBe("/api/admin/stats");
    expect((statsInit.headers as Headers).has("Authorization")).toBe(false);
    expect(statsInit.credentials).toBe("same-origin");
  });

  it("parses the three-slot provider snapshot without plaintext key fields", async () => {
    const snapshot = {
      version: 1,
      revision: 7,
      slots: [1, 2, 3].map((slot) => ({
        slot,
        isConfigured: slot === 1,
        provider: slot === 1 ? "openai" : null,
        enabled: slot === 1,
        credentialId: slot === 1 ? "cred_opaque_123" : null,
        createdAt: null,
        updatedAt: null,
        health: {
          status: "unknown",
          consecutiveFailures: 0,
          lastSuccessAt: null,
          lastFailureAt: null,
          lastFailureReason: null,
          cooldownUntil: null,
        },
      })),
    };
    fetchWithCsrfMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          data: snapshot,
          runtimeProvider: "openai",
          targetProvider: "openai",
          keyringEnabled: true,
        }),
        { status: 200 },
      ),
    );

    const result = await getProviderCredentials();

    expect(result).toEqual({
      ...snapshot,
      runtimeProvider: "openai",
      targetProvider: "openai",
      keyringEnabled: true,
    });
    expect(JSON.stringify(result)).not.toContain("apiKey");
    expect(fetchWithCsrfMock).toHaveBeenCalledWith(
      "/api/admin/provider-credentials",
      expect.objectContaining({ credentials: "same-origin", cache: "no-store" }),
    );
  });

  it("preserves a writable target while the managed keyring is staged", async () => {
    const data = {
      version: 1 as const,
      revision: 0,
      slots: [],
    };
    fetchWithCsrfMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          data,
          runtimeProvider: null,
          targetProvider: "openai",
          keyringEnabled: false,
        }),
        { status: 200 },
      ),
    );

    await expect(getProviderCredentials()).resolves.toEqual({
      ...data,
      runtimeProvider: null,
      targetProvider: "openai",
      keyringEnabled: false,
    });
  });

  it("derives activation fields from the legacy API payload during a mixed-version rollout", async () => {
    const data = {
      version: 1 as const,
      revision: 3,
      slots: [],
    };
    fetchWithCsrfMock.mockResolvedValue(
      new Response(
        JSON.stringify({ data, runtimeProvider: "anthropic" }),
        { status: 200 },
      ),
    );

    await expect(getProviderCredentials()).resolves.toEqual({
      ...data,
      runtimeProvider: "anthropic",
      targetProvider: "anthropic",
      keyringEnabled: true,
    });
  });

  it("surfaces revision conflicts so the provider view can reload before retrying", async () => {
    fetchWithCsrfMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            code: "PROVIDER_CREDENTIALS_REVISION_CONFLICT",
            message: "Revision conflict.",
            currentRevision: 9,
          },
        }),
        { status: 409 },
      ),
    );

    const operation = saveProviderCredential({
      provider: "openai",
      slot: 2,
      expectedRevision: 7,
      apiKey: "sk-a-valid-provider-secret",
      enabled: true,
    });

    await expect(operation).rejects.toMatchObject({
      status: 409,
      code: "PROVIDER_CREDENTIALS_REVISION_CONFLICT",
      currentRevision: 9,
    });
  });
});
