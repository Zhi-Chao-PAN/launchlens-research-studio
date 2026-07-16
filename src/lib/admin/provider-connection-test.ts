import {
  ProviderCredentialNotFoundError,
  ProviderCredentialValidationError,
  resolveProviderCredentialForTest,
  type LlmProvider,
  type ProviderCredentialSlot,
  type ResolvedProviderCredential,
} from "./provider-credentials";
import { resolveManagedCredentialModel } from "@/lib/providers/managed-credential-config";
import { openAICompatibleRequestOptions } from "@/lib/providers/openai-compatible-profile";
import { extractJsonObject } from "@/lib/providers/json-extract";
import {
  assertPublicProviderBaseUrl,
  type ProviderDnsLookup,
} from "@/lib/security/provider-endpoint-security";

const DEFAULT_TIMEOUT_MS = 40_000;
const MAX_RESPONSE_BYTES = 64 * 1024;

export type ProviderConnectionTestFailureReason =
  | "auth"
  | "rate_limit"
  | "network"
  | "server"
  | "invalid_response";

export interface ProviderConnectionTestResult {
  ok: boolean;
  slot: ProviderCredentialSlot;
  provider: LlmProvider;
  baseUrl: string;
  endpoint: string;
  model: string;
  durationMs: number;
  testedAt: string;
  httpStatus?: number;
  reason?: ProviderConnectionTestFailureReason;
}

interface ProviderConnectionTestDependencies {
  resolve: typeof resolveProviderCredentialForTest;
}

export interface ProviderConnectionTestOptions {
  env?: Readonly<Record<string, string | undefined>>;
  fetchImpl?: typeof fetch;
  lookupImpl?: ProviderDnsLookup;
  timeoutMs?: number;
  now?: () => Date;
  clock?: () => number;
  dependencies?: Partial<ProviderConnectionTestDependencies>;
}

/** Run one real, non-streaming completion against exactly one saved slot. */
export async function testProviderCredentialConnection(
  provider: LlmProvider,
  slot: ProviderCredentialSlot,
  credentialId: string,
  expectedRevision: number,
  options: ProviderConnectionTestOptions = {},
): Promise<ProviderConnectionTestResult> {
  const env = options.env ?? process.env;
  const deps: ProviderConnectionTestDependencies = {
    resolve: resolveProviderCredentialForTest,
    ...options.dependencies,
  };
  const credential = await deps.resolve({
    provider,
    slot,
    credentialId,
    expectedRevision,
  });
  if (!credential) throw new ProviderCredentialNotFoundError();

  let baseUrl: string;
  try {
    baseUrl = await assertPublicProviderBaseUrl(credential.baseUrl, {
      lookupImpl: options.lookupImpl,
      nodeEnv: env.NODE_ENV,
      env,
    });
  } catch {
    throw new ProviderCredentialValidationError(
      "Configured baseUrl is not a public HTTPS provider endpoint.",
    );
  }

  const model = resolveManagedCredentialModel(
    provider,
    credential.model,
    env,
  );
  const endpoint = providerEndpoint(provider, baseUrl);
  const timeoutMs = boundedTimeout(options.timeoutMs);
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const now = options.now ?? (() => new Date());
  const clock = options.clock ?? Date.now;
  const startedAt = clock();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  let result: ProviderConnectionTestResult;
  try {
    let response: Response;
    try {
      response = await fetchImpl(endpoint, {
        method: "POST",
        headers: providerHeaders(provider, credential.apiKey),
        redirect: "error",
        signal: controller.signal,
        body: JSON.stringify(providerProbeBody(provider, baseUrl, model)),
      });
    } catch {
      result = failureResult(
        credential,
        baseUrl,
        endpoint,
        model,
        "network",
        startedAt,
        now,
        clock,
      );
      return result;
    }

    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      const reason = classifyHttpFailure(response.status);
      result = failureResult(
        credential,
        baseUrl,
        endpoint,
        model,
        reason,
        startedAt,
        now,
        clock,
        response.status,
      );
      return result;
    }

    let valid = false;
    try {
      const body = await readJsonBounded(response, MAX_RESPONSE_BYTES);
      valid = isValidProbeEnvelope(provider, body);
    } catch {
      valid = false;
    }
    if (!valid) {
      result = failureResult(
        credential,
        baseUrl,
        endpoint,
        model,
        "invalid_response",
        startedAt,
        now,
        clock,
        response.status,
      );
      return result;
    }

    return {
      ok: true,
      slot,
      provider,
      baseUrl,
      endpoint,
      model,
      durationMs: elapsedMs(startedAt, clock),
      testedAt: now().toISOString(),
      httpStatus: response.status,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function providerEndpoint(provider: LlmProvider, baseUrl: string): string {
  const suffix = provider === "anthropic" ? "/v1/messages" : "/chat/completions";
  return baseUrl.replace(/\/+$/u, "") + suffix;
}

function providerHeaders(provider: LlmProvider, apiKey: string): HeadersInit {
  return provider === "anthropic"
    ? {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      }
    : {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      };
}

function providerProbeBody(
  provider: LlmProvider,
  baseUrl: string,
  model: string,
): object {
  const messages = [{
    role: "user",
    content: 'Return exactly this JSON object and nothing else: {"ok":true}',
  }];
  if (provider === "anthropic") {
    return {
      model,
      temperature: 0,
      max_tokens: 64,
      messages,
    };
  }
  return {
    model,
    ...openAICompatibleRequestOptions(baseUrl, {
      temperature: 0,
      maxOutputTokens: 64,
      jsonObject: true,
    }),
    stream: false,
    messages,
  };
}

function classifyHttpFailure(status: number): ProviderConnectionTestFailureReason {
  if (status === 401 || status === 403) return "auth";
  if (status === 429) return "rate_limit";
  if (status >= 500) return "server";
  return "invalid_response";
}

function failureResult(
  credential: ResolvedProviderCredential,
  baseUrl: string,
  endpoint: string,
  model: string,
  reason: ProviderConnectionTestFailureReason,
  startedAt: number,
  now: () => Date,
  clock: () => number,
  httpStatus?: number,
): ProviderConnectionTestResult {
  return {
    ok: false,
    slot: credential.slot,
    provider: credential.provider,
    baseUrl,
    endpoint,
    model,
    durationMs: elapsedMs(startedAt, clock),
    testedAt: now().toISOString(),
    ...(httpStatus === undefined ? {} : { httpStatus }),
    reason,
  };
}

async function readJsonBounded(response: Response, maxBytes: number): Promise<unknown> {
  if (!response.body) throw new Error("missing response body");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) throw new Error("response envelope too large");
      chunks.push(value);
    }
  } finally {
    if (total > maxBytes) await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}

function isValidProbeEnvelope(provider: LlmProvider, value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (provider === "anthropic") {
    if (!Array.isArray(value.content)) return false;
    const text = value.content
      .filter((item) => isRecord(item) && typeof item.text === "string")
      .map((item) => String((item as { text: string }).text))
      .join("");
    return isExpectedProbeJson(text);
  }
  if (!Array.isArray(value.choices) || value.choices.length === 0) return false;
  const first = value.choices[0];
  if (!isRecord(first) || !isRecord(first.message)) return false;
  const content = typeof first.message.content === "string" &&
      first.message.content.trim().length > 0
    ? first.message.content
    : typeof first.message.reasoning_content === "string"
      ? first.message.reasoning_content
      : "";
  return isExpectedProbeJson(content);
}

function isExpectedProbeJson(content: string): boolean {
  try {
    // Reasoning-capable OpenAI-compatible models can wrap the requested JSON
    // in <think> blocks or Markdown fences. Use the same bounded extractor as
    // real provider execution so a valid route is not reported as broken.
    const parsed = extractJsonObject(content);
    return isRecord(parsed) && parsed.ok === true;
  } catch {
    return false;
  }
}

function boundedTimeout(value: number | undefined): number {
  if (value === undefined) return DEFAULT_TIMEOUT_MS;
  return Math.max(100, Math.min(45_000, Math.floor(value)));
}

function elapsedMs(startedAt: number, clock: () => number): number {
  return Math.max(0, Math.round(clock() - startedAt));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
