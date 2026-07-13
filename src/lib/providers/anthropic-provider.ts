/* eslint-disable @typescript-eslint/no-explicit-any */
// Anthropic Messages API adapter.
// Targets POST {baseUrl}/v1/messages with x-api-key header. Falls back
// to mock outputs on HTTP failure or validation failure so the demo
// path is always intact, and validates the parsed JSON before returning.
// When ctx.onProgress is defined the adapter requests stream:true and
// forwards Anthropic content_block_delta events as partial text plus a
// fraction estimate. Transient HTTP errors (5xx, 429) are retried with
// exponential backoff; 4xx errors are surfaced immediately. SSE streams
// reconnect automatically on mid-stream drops.

import type { AgentId, AgentOutput } from "@/lib/schema/research-schema";
import type { ProviderContext, ProviderFallbackReason, ResearchProvider } from "@/lib/providers/provider.types";
import { mockResearchProvider } from "@/lib/providers/mock-provider-adapter";
import { validateOrNormalizeAgentOutput } from "@/lib/providers/output-coerce";
import { retryWithBackoff } from "@/lib/utils/retry";
import { readSseWithReconnect, parseAnthropicSse } from "@/lib/utils/sse-reconnect";
import { buildSystemPrompt, buildUserPrompt } from "@/lib/providers/agent-prompts";
import { detectQueryLanguage } from "@/lib/providers/query-language";
import { extractJsonObject } from "@/lib/providers/json-extract";
import {
  classifyProviderRequestError,
  isAbortError,
  isRetriableProviderError,
  providerRequestErrorDetail,
  ProviderRequestError,
} from "@/lib/providers/provider-request-error";
import { normalizeProviderBaseUrl } from "@/lib/security/provider-base-url";

export interface AnthropicProviderConfig {
  apiKey: string;
  baseUrl?: string;
  model?: string;
  fetchImpl?: typeof fetch;
}

function extractJsonFromMessages(json: any): string {
  const blocks = Array.isArray(json?.content) ? json.content : [];
  for (const block of blocks) {
    if (block && block.type === "text" && typeof block.text === "string") {
      return block.text;
    }
  }
  return "";
}

export function createAnthropicProvider(config: AnthropicProviderConfig): ResearchProvider {
  const baseUrl = normalizeProviderBaseUrl(
    config.baseUrl,
    "https://api.anthropic.com",
  );
  const model = config.model || "claude-3-5-sonnet-latest";
  const fetchImpl = config.fetchImpl || globalThis.fetch;

  return {
    id: "anthropic",
    displayName: "Anthropic Messages (" + model + ")",
    isMock: false,
    supportsStreaming: true,
    async generate(agentId: AgentId, ctx: ProviderContext): Promise<AgentOutput> {
      const wantsStream = typeof ctx.onProgress === "function";
      // R243: same query-language detection as openai-provider — pass the
      // detected language to buildSystemPrompt / buildUserPrompt so the model
      // produces human-readable strings in the user's language while keeping
      // the schema keys, enum values, and URLs in English.
      const outputLanguage = detectQueryLanguage(ctx.query);
      // Classify a thrown error into a fallback reason so the engine can
      // surface "demo data" with an accurate tooltip. Without this the
      // catch below silently returned mock and the user had no idea the
      // real call failed.
      const reportFallback = (reason: ProviderFallbackReason, detail?: { status?: number; message?: string }) => {
        ctx.onFallback?.(reason, detail);
      };
      try {
        const url = baseUrl.replace(/\/$/, "") + "/v1/messages";

        const doFetch = async () => {
          let r: Response;
          try {
            r = await fetchImpl(url, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "x-api-key": config.apiKey,
                "anthropic-version": "2023-06-01",
              },
              signal: ctx.signal,
              body: JSON.stringify({
                model,
                max_tokens: 2048,
                temperature: 0.4,
                stream: wantsStream,
                system: buildSystemPrompt(agentId, outputLanguage),
                messages: [
                  { role: "user", content: buildUserPrompt(agentId, { query: ctx.query, keywords: ctx.keywords, upstream: ctx.upstream, outputLanguage, retrievedSources: ctx.retrievedSources, validationSummary: ctx.validationSummary }) },
                ],
              }),
            });
          } catch (e) {
            if (isAbortError(e, ctx.signal)) throw e;
            throw new ProviderRequestError(
              "network",
              "retriable provider network error",
              { cause: e },
            );
          }
          if (!r.ok && (r.status >= 500 || r.status === 429)) {
            throw new ProviderRequestError(
              "http",
              "retriable provider HTTP " + r.status,
              { status: r.status },
            );
          }
          return r;
        };

        let text: string;
        if (wantsStream) {
          try {
            text = await readSseWithReconnect(
              doFetch,
              (assembled) => {
                const fraction = Math.min(0.95, assembled.length / 1500);
                ctx.onProgress!({ fraction, step: "Streaming response", partial: assembled });
              },
              parseAnthropicSse,
              {
                maxAttempts: 3,
                baseDelayMs: 300,
                maxDelayMs: 2000,
                signal: ctx.signal,
                shouldRetry: isRetriableProviderError,
              },
            );
          } catch (streamErr) {
            // R205 gap: the streaming path previously let readSseWithReconnect
            // failures fall straight to the outer catch without reporting a
            // reason, so a stream that dropped after retries (or returned an
            // HTTP error / empty body mid-stream) degraded to mock with no
            // "demo" badge. Classify the SSE error so the UI shows the cause.
            if (!isAbortError(streamErr, ctx.signal)) {
              reportFallback(
                classifyProviderRequestError(streamErr),
                providerRequestErrorDetail(streamErr),
              );
            }
            throw streamErr;
          }
          ctx.onProgress!({ fraction: 1, step: "Validating output" });
        } else {
          let res: Response;
          try {
            res = await retryWithBackoff(doFetch, {
              maxAttempts: 3,
              baseDelayMs: 200,
              maxDelayMs: 2000,
              signal: ctx.signal,
              shouldRetry: isRetriableProviderError,
            });
          } catch (err) {
            if (!isAbortError(err, ctx.signal)) {
              reportFallback(
                classifyProviderRequestError(err),
                providerRequestErrorDetail(err),
              );
            }
            throw err;
          }
          if (!res.ok) {
            // Non-retriable 4xx (e.g. 401 bad key) — report and fall back.
            reportFallback("http_error", {
              status: res.status,
              message: "anthropic HTTP " + res.status,
            });
            throw new Error("anthropic HTTP " + res.status);
          }
          const json: any = await res.json();
          text = extractJsonFromMessages(json);
        }
        if (!text) {
          reportFallback("empty_response", { message: "empty provider response" });
          throw new Error("empty provider response");
        }
        let parsed: unknown;
        try {
          // Reasoning models (MiniMax-M3 via the Anthropic-compatible
          // gateway, DeepSeek-R1, o1-style) wrap their JSON in
          // <think>…</think> blocks and/or fences; a bare JSON.parse would
          // fail on that scaffolding and silently degrade to mock.
          parsed = extractJsonObject(text);
        } catch {
          reportFallback("parse_error", { message: "provider returned non-JSON" });
          throw new Error("provider returned non-JSON");
        }
        try {
          // R244: strict validate first; if the real provider only omitted
          // recoverable structural fields, normalize once and validate again.
          // Invalid citations / malformed evidence still fail into mock.
          return validateOrNormalizeAgentOutput(agentId, parsed);
        } catch {
          reportFallback("validation_error", { message: "provider output failed schema validation" });
          throw new Error("provider output failed schema validation");
        }
      } catch {
        return mockResearchProvider.generate(agentId, ctx);
      }
    },
  };
}
