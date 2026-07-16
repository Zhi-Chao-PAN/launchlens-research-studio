import { describe, expect, it, vi } from "vitest";
import type {
  ProviderCredentialHealth,
  ResolvedProviderCredential,
} from "@/lib/admin/provider-credentials";
import { ProviderRequestError } from "@/lib/providers/provider-request-error";
import { StructuredCompletionError } from "@/lib/providers/structured-completion";
import { RetriableSseError } from "@/lib/utils/sse-reconnect";
import {
  classifyManagedProviderError,
  classifyManagedStructuredError,
  createManagedResearchProvider,
  createManagedStructuredCompletionProvider,
  type ManagedProviderDependencies,
} from "@/lib/providers/managed-provider";

const validOutput = {
  agent: "channel-scout",
  summary: "managed provider output",
  channels: [],
  citations: [{ id: "src-1", title: "Source", snippet: "evidence" }],
};

const unknownHealth: ProviderCredentialHealth = {
  status: "unknown",
  consecutiveFailures: 0,
  lastSuccessAt: null,
  lastFailureAt: null,
  lastFailureReason: null,
  cooldownUntil: null,
};

function credential(slot: 1 | 2 | 3, health = unknownHealth): ResolvedProviderCredential {
  return {
    provider: "openai",
    slot,
    credentialId: String(slot).repeat(32),
    apiKey: `managed-key-${slot}-long-enough`,
    baseUrl: ({
      1: "https://api.minimaxi.com/v1",
      2: "https://ark.cn-beijing.volces.com/api/plan/v3",
      3: "https://api.deepseek.com",
    } as const)[slot],
    model: ({
      1: "MiniMax-M3",
      2: "doubao-seed-evolving",
      3: "deepseek-v4-flash",
    } as const)[slot],
    fingerprint: String(slot).repeat(20),
    health,
  };
}

function dependencies(
  credentials: ResolvedProviderCredential[],
): { deps: ManagedProviderDependencies; success: ReturnType<typeof vi.fn>; failure: ReturnType<typeof vi.fn> } {
  const success = vi.fn(async () => undefined);
  const failure = vi.fn(async () => undefined);
  return {
    success,
    failure,
    deps: {
      resolve: vi.fn(async () => credentials),
      recordSuccess: success,
      recordFailure: failure,
      acquireProbe: vi.fn(async (provider, slot, credentialId) => ({
        provider,
        slot,
        credentialId,
        leaseId: "a".repeat(32),
      })),
      releaseProbe: vi.fn(async () => true),
      now: () => Date.parse("2026-07-15T00:00:00.000Z"),
    },
  };
}

function openAiFetch(statusByKey: Record<string, number>) {
  return vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    const key = new Headers(init?.headers).get("authorization")?.replace("Bearer ", "") || "";
    const status = statusByKey[key] ?? 200;
    if (status !== 200) return new Response("upstream error", { status });
    return new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify(validOutput) } }],
    }), { status: 200, headers: { "content-type": "application/json" } });
  });
}

describe("managed research provider", () => {
  it("stops after slot 1 succeeds", async () => {
    const { deps, success, failure } = dependencies([credential(1), credential(2), credential(3)]);
    const fetchImpl = openAiFetch({});
    const provider = createManagedResearchProvider({
      provider: "openai",
      failureMode: "fallback",
      fetchImpl: fetchImpl as typeof fetch,
      dependencies: deps,
    });

    const output = await provider.generate("channel-scout", { query: "q", keywords: [] });

    expect(output).toMatchObject({ agent: "channel-scout", summary: "managed provider output" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(success).toHaveBeenCalledWith("openai", 1, "1".repeat(32));
    expect(failure).not.toHaveBeenCalled();
  });

  it("fails over strictly 1 to 2 and does not call 3 after success", async () => {
    const { deps, success, failure } = dependencies([credential(1), credential(2), credential(3)]);
    const fetchImpl = openAiFetch({ "managed-key-1-long-enough": 401 });
    const provider = createManagedResearchProvider({
      provider: "openai",
      failureMode: "throw",
      fetchImpl: fetchImpl as typeof fetch,
      dependencies: deps,
    });

    const output = await provider.generate("channel-scout", { query: "q", keywords: [] });

    expect(output.agent).toBe("channel-scout");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(failure).toHaveBeenCalledWith("openai", 1, "1".repeat(32), "auth", 86_400_000);
    expect(success).toHaveBeenCalledWith("openai", 2, "2".repeat(32));
  });

  it("keeps each failover key paired with its own endpoint and model", async () => {
    const { deps } = dependencies([credential(1), credential(2), credential(3)]);
    const fetchImpl = openAiFetch({
      "managed-key-1-long-enough": 401,
      "managed-key-2-long-enough": 401,
    });
    const provider = createManagedResearchProvider({
      provider: "openai",
      failureMode: "throw",
      env: {
        OPENAI_BASE_URL: "https://global.example/v1",
        OPENAI_MODEL: "global-fallback-model",
      },
      fetchImpl: fetchImpl as typeof fetch,
      dependencies: deps,
    });

    await provider.generate("channel-scout", { query: "q", keywords: [] });

    expect(fetchImpl.mock.calls.map(([input]) => String(input))).toEqual([
      "https://api.minimaxi.com/v1/chat/completions",
      "https://ark.cn-beijing.volces.com/api/plan/v3/chat/completions",
      "https://api.deepseek.com/chat/completions",
    ]);
    expect(fetchImpl.mock.calls.map(([, init]) =>
      JSON.parse(String(init?.body)).model,
    )).toEqual(["MiniMax-M3", "doubao-seed-evolving", "deepseek-v4-flash"]);
    expect(fetchImpl.mock.calls.map(([, init]) =>
      new Headers(init?.headers).get("authorization"),
    )).toEqual([
      "Bearer managed-key-1-long-enough",
      "Bearer managed-key-2-long-enough",
      "Bearer managed-key-3-long-enough",
    ]);
  });

  it("falls back to mock exactly once in Standard after all three fail", async () => {
    const { deps } = dependencies([credential(1), credential(2), credential(3)]);
    const fetchImpl = openAiFetch({
      "managed-key-1-long-enough": 500,
      "managed-key-2-long-enough": 500,
      "managed-key-3-long-enough": 500,
    });
    const onFallback = vi.fn();
    const provider = createManagedResearchProvider({
      provider: "openai",
      failureMode: "fallback",
      fetchImpl: fetchImpl as typeof fetch,
      dependencies: deps,
    });

    const output = await provider.generate("market-sizer", {
      query: "q",
      keywords: [],
      onFallback,
    });

    expect(output.agent).toBe("market-sizer");
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(onFallback).toHaveBeenCalledTimes(1);
    expect(onFallback).toHaveBeenCalledWith("http_error", expect.any(Object));
  });

  it("fails closed in Deep-style throw mode after all slots fail", async () => {
    const { deps } = dependencies([credential(1), credential(2), credential(3)]);
    const fetchImpl = openAiFetch({
      "managed-key-1-long-enough": 401,
      "managed-key-2-long-enough": 401,
      "managed-key-3-long-enough": 401,
    });
    const provider = createManagedResearchProvider({
      provider: "openai",
      failureMode: "throw",
      fetchImpl: fetchImpl as typeof fetch,
      dependencies: deps,
    });

    await expect(provider.generate("market-sizer", { query: "q", keywords: [] }))
      .rejects.toMatchObject({ code: "MANAGED_PROVIDER_UNAVAILABLE" });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("switches endpoints for provider-specific 400 request errors", async () => {
    const { deps, success, failure } = dependencies([credential(1), credential(2)]);
    const fetchImpl = openAiFetch({ "managed-key-1-long-enough": 400 });
    const provider = createManagedResearchProvider({
      provider: "openai",
      failureMode: "throw",
      fetchImpl: fetchImpl as typeof fetch,
      dependencies: deps,
    });

    await expect(provider.generate("channel-scout", { query: "q", keywords: [] }))
      .resolves.toMatchObject({ agent: "channel-scout" });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(failure).toHaveBeenCalledWith(
      "openai",
      1,
      "1".repeat(32),
      "unknown",
      0,
    );
    expect(success).toHaveBeenCalledWith("openai", 2, "2".repeat(32));
  });

  it("skips an active cooldown without probing it", async () => {
    const activeCooldown: ProviderCredentialHealth = {
      ...unknownHealth,
      status: "cooldown",
      cooldownUntil: "2026-07-15T00:01:00.000Z",
    };
    const { deps } = dependencies([credential(1, activeCooldown), credential(2)]);
    const fetchImpl = openAiFetch({});
    const provider = createManagedResearchProvider({
      provider: "openai",
      failureMode: "throw",
      fetchImpl: fetchImpl as typeof fetch,
      dependencies: deps,
    });

    await provider.generate("channel-scout", { query: "q", keywords: [] });

    const firstKeyUsed = new Headers(fetchImpl.mock.calls[0]?.[1]?.headers).get("authorization");
    expect(firstKeyUsed).toBe("Bearer managed-key-2-long-enough");
    expect(deps.acquireProbe).not.toHaveBeenCalled();
  });

  it("switches from slot 1 to slot 2 after a streaming network drop with one call per slot", async () => {
    const { deps, success, failure } = dependencies([credential(1), credential(2), credential(3)]);
    const encoder = new TextEncoder();
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const key = new Headers(init?.headers).get("authorization")?.replace("Bearer ", "") || "";
      if (key.includes("key-1")) {
        return new Response(new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"{\\"agent\\":"}}]}\n\n'));
            controller.error(new Error("socket reset"));
          },
        }), { status: 200, headers: { "content-type": "text/event-stream" } });
      }
      const payload = JSON.stringify({
        choices: [{ delta: { content: JSON.stringify(validOutput) } }],
      });
      return new Response(`data: ${payload}\n\ndata: [DONE]\n\n`, {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      });
    });
    const provider = createManagedResearchProvider({
      provider: "openai",
      failureMode: "throw",
      fetchImpl: fetchImpl as typeof fetch,
      dependencies: deps,
    });

    const output = await provider.generate("channel-scout", {
      query: "q",
      keywords: [],
      onProgress: vi.fn(),
    });

    expect(output.agent).toBe("channel-scout");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls.map((call) =>
      new Headers(call[1]?.headers).get("authorization"),
    )).toEqual([
      "Bearer managed-key-1-long-enough",
      "Bearer managed-key-2-long-enough",
    ]);
    expect(failure).toHaveBeenCalledWith("openai", 1, "1".repeat(32), "network", 30_000);
    expect(success).toHaveBeenCalledWith("openai", 2, "2".repeat(32));
  });
});

describe("managed structured reviewer", () => {
  it("shares the same ordered failover and health ledger", async () => {
    const { deps, success, failure } = dependencies([credential(1), credential(2)]);
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const key = new Headers(init?.headers).get("authorization")?.replace("Bearer ", "");
      if (key?.includes("key-1")) return new Response("rate limited", { status: 429 });
      return new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify({ ok: true }) } }],
      }), { status: 200 });
    });
    const reviewer = createManagedStructuredCompletionProvider({
      provider: "openai",
      fetchImpl: fetchImpl as typeof fetch,
      dependencies: deps,
    });

    const output = await reviewer.complete({
      schemaName: "managed_test",
      systemPrompt: "Return the test schema.",
      userPrompt: "Untrusted test payload.",
      validate: (value): value is { ok: true } =>
        typeof value === "object" && value !== null && (value as { ok?: unknown }).ok === true,
    });

    expect(output).toEqual({ ok: true });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(failure).toHaveBeenCalledWith("openai", 1, "1".repeat(32), "rate_limit", 60_000);
    expect(success).toHaveBeenCalledWith("openai", 2, "2".repeat(32));
  });

  it("ignores review-wide URL/model overrides and uses slot configuration", async () => {
    const { deps } = dependencies([credential(2)]);
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ ok: true }) } }],
    }), { status: 200 }));
    const reviewer = createManagedStructuredCompletionProvider({
      provider: "openai",
      env: {
        OPENAI_MODEL: "global-generation-model",
        LAUNCHLENS_REVIEW_MODEL: "must-not-override-slot",
        LAUNCHLENS_REVIEW_BASE_URL: "https://must-not-be-used.example/v1",
      },
      fetchImpl: fetchImpl as typeof fetch,
      dependencies: deps,
    });

    await reviewer.complete({
      schemaName: "managed_test",
      systemPrompt: "Return the test schema.",
      userPrompt: "Untrusted test payload.",
      validate: (value): value is { ok: true } =>
        typeof value === "object" && value !== null && (value as { ok?: unknown }).ok === true,
    });

    const [input, init] = (fetchImpl.mock.calls as unknown as Array<
      [RequestInfo | URL, RequestInit?]
    >)[0];
    expect(String(input)).toBe(
      "https://ark.cn-beijing.volces.com/api/plan/v3/chat/completions",
    );
    expect(JSON.parse(String(init?.body)).model).toBe("doubao-seed-evolving");
  });

  it("continues structured failover after a provider-specific 400", async () => {
    const { deps, success, failure } = dependencies([credential(1), credential(2)]);
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const key = new Headers(init?.headers).get("authorization")?.replace("Bearer ", "");
      if (key?.includes("key-1")) return new Response("unsupported parameter", { status: 400 });
      return new Response(JSON.stringify({
        choices: [{ message: { content: '{"ok":true}' } }],
      }), { status: 200 });
    });
    const reviewer = createManagedStructuredCompletionProvider({
      provider: "openai",
      fetchImpl: fetchImpl as typeof fetch,
      dependencies: deps,
    });

    await expect(reviewer.complete({
      schemaName: "managed_test",
      systemPrompt: "Return the test schema.",
      userPrompt: "Untrusted test payload.",
      validate: (value): value is { ok: true } =>
        typeof value === "object" && value !== null && (value as { ok?: unknown }).ok === true,
    })).resolves.toEqual({ ok: true });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(failure).toHaveBeenCalledWith(
      "openai",
      1,
      "1".repeat(32),
      "unknown",
      0,
    );
    expect(success).toHaveBeenCalledWith("openai", 2, "2".repeat(32));
  });
});

describe("managed failover policy", () => {
  it("switches only key-specific/transient failures", () => {
    expect(classifyManagedProviderError(new ProviderRequestError("http", "bad", { status: 401 })).action).toBe("switch");
    expect(classifyManagedProviderError(new ProviderRequestError("http", "bad", { status: 400 })).action).toBe("switch");
    expect(classifyManagedProviderError(new ProviderRequestError("network", "offline")).action).toBe("switch");
    expect(classifyManagedProviderError(new RetriableSseError("socket reset")).action).toBe("switch");
  });

  it("never switches a structured timeout or validation failure", () => {
    const timeout = new StructuredCompletionError({
      code: "timeout",
      providerId: "openai",
      message: "timeout",
      retryable: true,
    });
    const validation = new StructuredCompletionError({
      code: "validation_failed",
      providerId: "openai",
      message: "invalid",
      retryable: true,
    });
    expect(classifyManagedStructuredError(timeout).action).toBe("abort");
    expect(classifyManagedStructuredError(validation).action).toBe("stop");
  });
});
