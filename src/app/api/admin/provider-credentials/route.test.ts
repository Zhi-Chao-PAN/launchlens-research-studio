// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const redisMock = vi.hoisted(() => ({ current: null as FakeRedis | null }));

vi.mock("@/lib/research/redis-client", () => ({
  getRedis: () => redisMock.current,
}));

import { clearAuthAudit, snapshotAuthAudit } from "@/lib/api/auth-audit";
import { ADMIN_SESSION_COOKIE, createAdminSession } from "@/lib/api/admin-session";
import {
  clearBypassTokens,
  createBypassToken,
  getTokenInfo,
} from "@/lib/api/bypass-tokens";
import { CSRF_COOKIE_NAME, CSRF_HEADER_NAME } from "@/lib/api/csrf";
import { PROVIDER_CREDENTIALS_KEY } from "@/lib/admin/provider-credentials";
import { DELETE, GET, PUT } from "./route";

const MASTER_SECRET =
  Buffer.alloc(32, 11).toString("base64");

class FakeRedis {
  readonly store = new Map<string, string>();

  async get<T = unknown>(key: string): Promise<T | null> {
    return (this.store.get(key) as T | undefined) ?? null;
  }

  async set(key: string, value: string): Promise<string> {
    this.store.set(key, value);
    return "OK";
  }

  async del(key: string): Promise<number> {
    return this.store.delete(key) ? 1 : 0;
  }

  async eval(
    _script: string,
    keys: string[],
    args: string[],
  ): Promise<[number, number]> {
    const raw = this.store.get(keys[0]);
    let currentRevision = 0;
    if (raw) {
      try {
        const document = JSON.parse(raw) as { revision?: unknown };
        if (!Number.isSafeInteger(document.revision)) return [-1, -1];
        currentRevision = Number(document.revision);
      } catch {
        return [-1, -1];
      }
    }
    if (currentRevision !== Number(args[0])) return [0, currentRevision];
    this.store.set(keys[0], args[1]);
    return [1, Number(args[2])];
  }
}

let ipSequence = 10;
let adminToken = "";

describe("/api/admin/provider-credentials", () => {
  beforeEach(() => {
    redisMock.current = new FakeRedis();
    process.env.LAUNCHLENS_PROVIDER_KEY_ENCRYPTION_SECRET = MASTER_SECRET;
    process.env.LAUNCHLENS_ADMIN_SESSION_SECRET =
      "route-test-admin-session-secret-with-thirty-two-characters";
    process.env.LAUNCHLENS_PROVIDER_KEYRING_ENABLED = "1";
    process.env.LAUNCHLENS_PROVIDER_KEYRING_PROVIDER = "openai";
    clearBypassTokens();
    clearAuthAudit();
    adminToken = createBypassToken("admin", "provider-credentials-route-test");
    ipSequence += 1;
  });

  afterEach(() => {
    delete process.env.LAUNCHLENS_PROVIDER_KEY_ENCRYPTION_SECRET;
    delete process.env.LAUNCHLENS_ADMIN_SESSION_SECRET;
    delete process.env.LAUNCHLENS_PROVIDER_KEYRING_ENABLED;
    delete process.env.LAUNCHLENS_PROVIDER_KEYRING_PROVIDER;
    clearBypassTokens();
    clearAuthAudit();
  });

  it("rejects unauthenticated access before touching storage", async () => {
    const response = await GET(
      makeRequest("GET", undefined, { authenticated: false }),
    );
    expect(response.status).toBe(401);
    expect(redisMock.current?.store.size).toBe(0);
  });

  it("enforces same-origin CORS", async () => {
    const response = await GET(
      makeRequest("GET", undefined, { origin: "https://evil.example" }),
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "CORS origin not allowed" });
  });

  it("requires double-submit CSRF for HttpOnly admin sessions", async () => {
    const tokenInfo = getTokenInfo(adminToken);
    expect(tokenInfo).not.toBeNull();
    const session = createAdminSession(tokenInfo!.hash);
    const body = {
      provider: "openai",
      slot: 1,
      expectedRevision: 0,
      apiKey: "sk-route-session-csrf-key-123456",
    };
    const withoutCsrf = makeSessionRequest("PUT", body, session.value);
    const rejected = await PUT(withoutCsrf);
    expect(rejected.status).toBe(403);
    expect(await rejected.json()).toMatchObject({ error: "csrf_failed" });

    const accepted = await PUT(
      makeSessionRequest("PUT", body, session.value, "csrf-test-token"),
    );
    expect(accepted.status).toBe(200);
  });

  it("creates and lists a credential without leaking plaintext", async () => {
    const apiKey = "sk-route-secret-never-return-this-NEVERRETURN";
    const put = await PUT(
      makeRequest("PUT", {
        provider: "openai",
        slot: 1,
        expectedRevision: 0,
        apiKey,
      }),
    );
    expect(put.status).toBe(200);
    expect(put.headers.get("cache-control")).toBe("private, no-store");
    expect(put.headers.get("x-csrf-token")).toBeTruthy();
    const putText = await put.text();
    expect(putText).not.toContain(apiKey);
    expect(putText).not.toContain(apiKey.slice(-6));

    const get = await GET(makeRequest("GET"));
    expect(get.status).toBe(200);
    expect(get.headers.get("cache-control")).toBe("private, no-store");
    const getText = await get.text();
    expect(getText).not.toContain(apiKey);
    const getPayload = JSON.parse(getText) as {
      runtimeProvider: string | null;
      targetProvider: string | null;
      keyringEnabled: boolean;
      data: { revision: number; slots: Array<Record<string, unknown>> };
    };
    expect(getPayload.runtimeProvider).toBe("openai");
    expect(getPayload.targetProvider).toBe("openai");
    expect(getPayload.keyringEnabled).toBe(true);
    expect(getPayload.data.revision).toBe(1);
    expect(getPayload.data.slots).toHaveLength(3);
    expect(getPayload.data.slots[0]).toMatchObject({
      slot: 1,
      isConfigured: true,
      provider: "openai",
      baseUrl: "https://api.minimaxi.com/v1",
      model: "MiniMax-M3",
    });
    expect(getPayload.data.slots[0]).toHaveProperty("credentialId");
    expect(getPayload.data.slots[0]).not.toHaveProperty("fingerprint");
    expect(getPayload.data.slots[0]).not.toHaveProperty("hint");

    const stored = redisMock.current?.store.get(PROVIDER_CREDENTIALS_KEY);
    expect(stored).not.toContain(apiKey);
    expect(JSON.stringify(snapshotAuthAudit())).not.toContain(apiKey);
  });

  it("stages credentials for a configured target while runtime activation is disabled", async () => {
    process.env.LAUNCHLENS_PROVIDER_KEYRING_ENABLED = "0";
    process.env.LAUNCHLENS_PROVIDER_KEYRING_PROVIDER = "openai";

    const before = await GET(makeRequest("GET"));
    expect(before.status).toBe(200);
    expect(await before.json()).toMatchObject({
      runtimeProvider: null,
      targetProvider: "openai",
      keyringEnabled: false,
      data: { revision: 0 },
    });

    const staged = await PUT(
      makeRequest("PUT", {
        provider: "openai",
        slot: 1,
        expectedRevision: 0,
        apiKey: "sk-route-staged-before-activation-123456",
      }),
    );

    expect(staged.status).toBe(200);
    const stagedPayload = (await staged.json()) as {
      runtimeProvider: string | null;
      targetProvider: string | null;
      keyringEnabled: boolean;
      data: {
        revision: number;
        slots: Array<{ isConfigured: boolean; provider: string | null }>;
      };
    };
    expect(stagedPayload).toMatchObject({
      runtimeProvider: null,
      targetProvider: "openai",
      keyringEnabled: false,
      data: { revision: 1 },
    });
    expect(stagedPayload.data.slots[0]).toMatchObject({
      isConfigured: true,
      provider: "openai",
    });
  });

  it("supports enable/disable updates without accepting an empty mutation", async () => {
    process.env.LAUNCHLENS_PROVIDER_KEYRING_PROVIDER = "anthropic";
    const created = await PUT(
      makeRequest("PUT", {
        provider: "anthropic",
        slot: 2,
        expectedRevision: 0,
        apiKey: "sk-ant-route-toggle-key-123456",
      }),
    );
    expect(created.status).toBe(200);

    const disabled = await PUT(
      makeRequest("PUT", {
        provider: "anthropic",
        slot: 2,
        expectedRevision: 1,
        enabled: false,
      }),
    );
    expect(disabled.status).toBe(200);
    const disabledPayload = (await disabled.json()) as {
      data: { revision: number; slots: Array<{ enabled: boolean }> };
    };
    expect(disabledPayload.data.revision).toBe(2);
    expect(disabledPayload.data.slots[1].enabled).toBe(false);

    const empty = await PUT(
      makeRequest("PUT", {
        provider: "anthropic",
        slot: 2,
        expectedRevision: 2,
      }),
    );
    expect(empty.status).toBe(422);
    expect(await empty.json()).toMatchObject({
      error: { code: "VALIDATION_ERROR" },
    });
  });

  it("updates a slot endpoint/model without requiring the write-only key again", async () => {
    const created = await PUT(
      makeRequest("PUT", {
        provider: "openai",
        slot: 2,
        expectedRevision: 0,
        apiKey: "sk-route-endpoint-model-key-123456",
      }),
    );
    expect(created.status).toBe(200);
    const updated = await PUT(
      makeRequest("PUT", {
        provider: "openai",
        slot: 2,
        expectedRevision: 1,
        baseUrl: "https://ark.cn-beijing.volces.com/api/plan/v3",
        model: "doubao-seed-evolving",
      }),
    );
    expect(updated.status).toBe(200);
    const updatedPayload = (await updated.json()) as {
      data: { revision: number; slots: Array<Record<string, unknown>> };
    };
    expect(updatedPayload.data.revision).toBe(2);
    expect(updatedPayload.data.slots[1]).toMatchObject({
      baseUrl: "https://ark.cn-beijing.volces.com/api/plan/v3",
      model: "doubao-seed-evolving",
    });

    const blocked = await PUT(
      makeRequest("PUT", {
        provider: "openai",
        slot: 2,
        expectedRevision: 2,
        baseUrl: "https://evil.example/v1",
      }),
    );
    expect(blocked.status).toBe(422);
    expect(await blocked.json()).toMatchObject({
      error: { code: "PROVIDER_CREDENTIAL_VALIDATION_ERROR" },
    });
  });

  it("returns a structured 409 for stale writes", async () => {
    await PUT(
      makeRequest("PUT", {
        provider: "openai",
        slot: 1,
        expectedRevision: 0,
        apiKey: "sk-route-current-revision-123456",
      }),
    );
    const conflict = await PUT(
      makeRequest("PUT", {
        provider: "openai",
        slot: 2,
        expectedRevision: 0,
        apiKey: "sk-route-stale-revision-123456",
      }),
    );
    expect(conflict.status).toBe(409);
    expect(await conflict.json()).toEqual({
      error: {
        code: "PROVIDER_CREDENTIALS_REVISION_CONFLICT",
        message: "Provider credentials changed. Refresh and try again.",
        currentRevision: 1,
      },
    });
  });

  it("rejects writes that do not match the runtime provider", async () => {
    await PUT(
      makeRequest("PUT", {
        provider: "openai",
        slot: 1,
        expectedRevision: 0,
        apiKey: "sk-route-provider-lock-key-123456",
      }),
    );
    const response = await PUT(
      makeRequest("PUT", {
        provider: "anthropic",
        slot: 2,
        expectedRevision: 1,
        apiKey: "sk-ant-route-provider-mix-123456",
      }),
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: {
        code: "PROVIDER_KEYRING_PROVIDER_MISMATCH",
        message: "provider must match the managed keyring runtime provider.",
      },
    });
  });

  it("fails closed before storage when the runtime provider is unavailable", async () => {
    process.env.LAUNCHLENS_PROVIDER_KEYRING_PROVIDER = "unsupported";

    const response = await PUT(
      makeRequest("PUT", {
        provider: "openai",
        slot: 1,
        expectedRevision: 0,
        apiKey: "sk-route-runtime-provider-required-123456",
      }),
    );

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: {
        code: "PROVIDER_KEYRING_RUNTIME_PROVIDER_UNAVAILABLE",
        message: "Managed provider keyring target provider is unavailable.",
      },
    });
    expect(redisMock.current?.store.size).toBe(0);
  });

  it("strictly validates provider, slot, unknown fields, and key whitespace", async () => {
    const cases = [
      {
        provider: "gemini",
        slot: 1,
        expectedRevision: 0,
        apiKey: "sk-route-validation-key-123456",
      },
      {
        provider: "openai",
        slot: 4,
        expectedRevision: 0,
        apiKey: "sk-route-validation-key-123456",
      },
      {
        provider: "openai",
        slot: 1,
        expectedRevision: 0,
        apiKey: "sk-route-validation-key-123456",
        surprise: true,
      },
      {
        provider: "openai",
        slot: 1,
        expectedRevision: 0,
        apiKey: " sk-route-has-leading-space-123456",
      },
    ];
    for (const body of cases) {
      const response = await PUT(makeRequest("PUT", body));
      expect(response.status).toBe(422);
    }
    expect(redisMock.current?.store.size).toBe(0);
  });

  it("deletes by provider, slot, and expected revision", async () => {
    const apiKey = "sk-route-delete-key-123456";
    await PUT(
      makeRequest("PUT", {
        provider: "openai",
        slot: 3,
        expectedRevision: 0,
        apiKey,
      }),
    );
    process.env.LAUNCHLENS_PROVIDER_KEYRING_PROVIDER = "anthropic";
    const response = await DELETE(
      makeRequest("DELETE", {
        provider: "openai",
        slot: 3,
        expectedRevision: 1,
      }),
    );
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).not.toContain(apiKey);
    expect(JSON.parse(text)).toMatchObject({
      runtimeProvider: "anthropic",
      data: { revision: 2, slots: [{}, {}, { isConfigured: false }] },
    });
  });

  it("fails closed when Redis, the master secret, or ciphertext integrity is unavailable", async () => {
    redisMock.current = null;
    let response = await GET(makeRequest("GET"));
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      error: { code: "PROVIDER_CREDENTIALS_UNAVAILABLE" },
    });

    redisMock.current = new FakeRedis();
    delete process.env.LAUNCHLENS_PROVIDER_KEY_ENCRYPTION_SECRET;
    response = await GET(makeRequest("GET"));
    expect(response.status).toBe(503);

    process.env.LAUNCHLENS_PROVIDER_KEY_ENCRYPTION_SECRET = MASTER_SECRET;
    await PUT(
      makeRequest("PUT", {
        provider: "openai",
        slot: 1,
        expectedRevision: 0,
        apiKey: "sk-route-integrity-key-123456",
      }),
    );
    const raw = JSON.parse(
      redisMock.current.store.get(PROVIDER_CREDENTIALS_KEY)!,
    ) as { credentials: Array<{ encrypted: { authTag: string } }> };
    raw.credentials[0].encrypted.authTag = "AAAAAAAAAAAAAAAAAAAAAA";
    redisMock.current.store.set(PROVIDER_CREDENTIALS_KEY, JSON.stringify(raw));
    response = await GET(makeRequest("GET"));
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      error: { code: "PROVIDER_CREDENTIALS_INTEGRITY_ERROR" },
    });
  });
});

function makeRequest(
  method: "GET" | "PUT" | "DELETE",
  body?: unknown,
  options: { origin?: string; authenticated?: boolean } = {},
): NextRequest {
  const headers = new Headers();
  if (options.authenticated !== false) {
    headers.set("authorization", `Bearer ${adminToken}`);
  }
  headers.set("x-forwarded-for", `203.0.113.${ipSequence}`);
  if (options.origin) headers.set("origin", options.origin);
  if (body !== undefined) headers.set("content-type", "application/json");
  return new NextRequest("http://localhost/api/admin/provider-credentials", {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

function makeSessionRequest(
  method: "PUT" | "DELETE",
  body: unknown,
  session: string,
  csrf?: string,
): NextRequest {
  const headers = new Headers({
    "content-type": "application/json",
    "x-forwarded-for": `203.0.113.${ipSequence}`,
  });
  const cookies = [`${ADMIN_SESSION_COOKIE}=${encodeURIComponent(session)}`];
  if (csrf) {
    cookies.push(`${CSRF_COOKIE_NAME}=${encodeURIComponent(csrf)}`);
    headers.set(CSRF_HEADER_NAME, csrf);
  }
  headers.set("cookie", cookies.join("; "));
  return new NextRequest("http://localhost/api/admin/provider-credentials", {
    method,
    headers,
    body: JSON.stringify(body),
  });
}
