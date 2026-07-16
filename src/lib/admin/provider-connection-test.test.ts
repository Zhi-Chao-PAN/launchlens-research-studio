// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import type {
  ProviderCredentialHealth,
  ResolvedProviderCredential,
} from "./provider-credentials";
import { testProviderCredentialConnection } from "./provider-connection-test";

const HEALTH: ProviderCredentialHealth = {
  status: "unknown",
  consecutiveFailures: 0,
  lastSuccessAt: null,
  lastFailureAt: null,
  lastFailureReason: null,
  cooldownUntil: null,
};

function credential(
  overrides: Partial<ResolvedProviderCredential> = {},
): ResolvedProviderCredential {
  return {
    credentialId: "a".repeat(32),
    provider: "openai",
    slot: 2,
    apiKey: "sk-probe-secret-never-return-123456",
    baseUrl: "https://ark.cn-beijing.volces.com/api/plan/v3",
    model: "doubao-seed-evolving",
    fingerprint: "f".repeat(20),
    health: HEALTH,
    ...overrides,
  };
}

describe("provider credential connection test", () => {
  it("runs one real JSON completion against the exact saved URL/model", async () => {
    const saved = credential();
    const resolve = vi.fn(async () => saved);
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: '{"ok":true}' } }],
    }), { status: 200 }));

    const result = await testProviderCredentialConnection(
      "openai",
      2,
      saved.credentialId,
      7,
      {
        env: { NODE_ENV: "production" },
        dependencies: { resolve },
        lookupImpl: vi.fn(async () => [{ address: "8.8.8.8", family: 4 }]),
        fetchImpl: fetchImpl as typeof fetch,
        now: () => new Date("2026-07-16T08:00:00.000Z"),
        clock: (() => {
          let value = 100;
          return () => (value += 5);
        })(),
      },
    );

    expect(resolve).toHaveBeenCalledWith({
      provider: "openai",
      slot: 2,
      credentialId: saved.credentialId,
      expectedRevision: 7,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = (fetchImpl.mock.calls as unknown as Array<
      [RequestInfo | URL, RequestInit?]
    >)[0];
    expect(String(url)).toBe(
      "https://ark.cn-beijing.volces.com/api/plan/v3/chat/completions",
    );
    expect(init).toMatchObject({ method: "POST", redirect: "error" });
    expect(new Headers(init?.headers).get("authorization"))
      .toBe(`Bearer ${saved.apiKey}`);
    expect(JSON.parse(String(init?.body))).toMatchObject({
      model: "doubao-seed-evolving",
      stream: false,
      response_format: { type: "json_object" },
    });
    expect(result).toMatchObject({
      ok: true,
      slot: 2,
      model: "doubao-seed-evolving",
      httpStatus: 200,
    });
    expect(JSON.stringify(result)).not.toContain(saved.apiKey);
  });

  it("uses the current MiniMax model and documented request fields", async () => {
    const saved = credential({
      slot: 1,
      baseUrl: "https://api.minimaxi.com/v1",
      model: "MiniMax-M3",
    });
    let requestBody: Record<string, unknown> = {};
    const result = await testProviderCredentialConnection(
      "openai",
      1,
      saved.credentialId,
      3,
      {
        env: { NODE_ENV: "production" },
        dependencies: { resolve: vi.fn(async () => saved) },
        lookupImpl: vi.fn(async () => [{ address: "8.8.8.8", family: 4 }]),
        fetchImpl: vi.fn(async (_input, init) => {
          requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
          return new Response(JSON.stringify({
            choices: [{ message: { content: '<think>probe</think>{"ok":true}' } }],
          }), { status: 200 });
        }) as typeof fetch,
      },
    );

    expect(result).toMatchObject({ ok: true, model: "MiniMax-M3" });
    expect(requestBody).toMatchObject({
      model: "MiniMax-M3",
      temperature: 1,
      max_completion_tokens: 64,
      stream: false,
    });
    expect(requestBody).not.toHaveProperty("max_tokens");
    expect(requestBody).not.toHaveProperty("response_format");
  });

  it("accepts probe JSON wrapped by reasoning output", async () => {
    const saved = credential();
    const result = await testProviderCredentialConnection(
      "openai",
      2,
      saved.credentialId,
      7,
      {
        env: { NODE_ENV: "production" },
        dependencies: { resolve: vi.fn(async () => saved) },
        lookupImpl: vi.fn(async () => [{ address: "8.8.8.8", family: 4 }]),
        fetchImpl: vi.fn(async () => new Response(JSON.stringify({
          choices: [{
            message: {
              content: '<think>probe reasoning</think>\n\n```json\n{"ok":true}\n```',
            },
          }],
        }), { status: 200 })) as typeof fetch,
      },
    );

    expect(result).toMatchObject({ ok: true, httpStatus: 200 });
  });

  it("accepts probe JSON from reasoning_content when content is absent", async () => {
    const saved = credential({
      slot: 3,
      baseUrl: "https://api.deepseek.com",
      model: "deepseek-v4-flash",
    });
    const result = await testProviderCredentialConnection(
      "openai",
      3,
      saved.credentialId,
      8,
      {
        env: { NODE_ENV: "production" },
        dependencies: { resolve: vi.fn(async () => saved) },
        lookupImpl: vi.fn(async () => [{ address: "8.8.8.8", family: 4 }]),
        fetchImpl: vi.fn(async () => new Response(JSON.stringify({
          choices: [{
            message: { content: "", reasoning_content: '{"ok":true}' },
          }],
        }), { status: 200 })) as typeof fetch,
      },
    );

    expect(result).toMatchObject({ ok: true, httpStatus: 200 });
  });

  it("rejects an arbitrary public HTTPS endpoint before DNS or fetch", async () => {
    const lookupImpl = vi.fn(async () => [{ address: "8.8.8.8", family: 4 }]);
    const fetchImpl = vi.fn();
    await expect(
      testProviderCredentialConnection(
        "openai",
        1,
        "a".repeat(32),
        1,
        {
          env: { NODE_ENV: "production" },
          dependencies: {
            resolve: vi.fn(async () => credential({
              slot: 1,
              baseUrl: "https://evil.example/v1",
            })),
          },
          lookupImpl,
          fetchImpl: fetchImpl as typeof fetch,
        },
      ),
    ).rejects.toMatchObject({
      code: "PROVIDER_CREDENTIAL_VALIDATION_ERROR",
    });
    expect(lookupImpl).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("rejects an allowlisted hostname when any DNS answer is private", async () => {
    const fetchImpl = vi.fn();
    await expect(
      testProviderCredentialConnection(
        "openai",
        3,
        "a".repeat(32),
        1,
        {
          env: { NODE_ENV: "production" },
          dependencies: {
            resolve: vi.fn(async () => credential({
              slot: 3,
              baseUrl: "https://api.deepseek.com",
              model: "deepseek-v4-flash",
            })),
          },
          lookupImpl: vi.fn(async () => [
            { address: "8.8.8.8", family: 4 },
            { address: "10.0.0.8", family: 4 },
          ]),
          fetchImpl: fetchImpl as typeof fetch,
        },
      ),
    ).rejects.toMatchObject({
      code: "PROVIDER_CREDENTIAL_VALIDATION_ERROR",
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("returns only a bounded diagnostic when upstream authentication fails", async () => {
    const saved = credential({ slot: 3, baseUrl: "https://api.deepseek.com" });
    const result = await testProviderCredentialConnection(
      "openai",
      3,
      saved.credentialId,
      2,
      {
        env: { NODE_ENV: "production" },
        dependencies: { resolve: vi.fn(async () => saved) },
        lookupImpl: vi.fn(async () => [{ address: "1.1.1.1", family: 4 }]),
        fetchImpl: vi.fn(async () => new Response(
          `invalid key ${saved.apiKey}`,
          { status: 401 },
        )) as unknown as typeof fetch,
      },
    );

    expect(result).toMatchObject({ ok: false, reason: "auth", httpStatus: 401 });
    expect(JSON.stringify(result)).not.toContain(saved.apiKey);
  });
});
