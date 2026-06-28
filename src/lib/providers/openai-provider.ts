/* eslint-disable @typescript-eslint/no-explicit-any */
// OpenAI-compatible provider adapter.
// Targets any chat-completions endpoint that returns JSON when prompted to.
// Falls back to the mock provider on any remote failure so the demo path
// always succeeds, even with a misconfigured key. When ctx.onProgress is
// defined the adapter requests stream:true and forwards partial tokens.
// Transient HTTP errors (5xx, 429) are retried with exponential backoff;
// 4xx errors are surfaced immediately so the outer fallback can degrade
// to the mock without burning quota. SSE streams reconnect automatically
// on mid-stream drops so transient network failures don't silently fall
// through to the mock fallback.

import type { AgentId, AgentOutput } from "@/lib/schema/research-schema";
import type { ProviderContext, ProviderFallbackReason, ResearchProvider } from "@/lib/providers/provider.types";
import { mockResearchProvider } from "@/lib/providers/mock-provider-adapter";
import { validateOrNormalizeAgentOutput } from "@/lib/providers/output-coerce";
import { buildSystemPrompt, buildUserPrompt } from "@/lib/providers/agent-prompts";
import { detectQueryLanguage } from "@/lib/providers/query-language";
import { extractJsonObject } from "@/lib/providers/json-extract";
import { retryWithBackoff } from "@/lib/utils/retry";
import { readSseWithReconnect, parseOpenAiSse } from "@/lib/utils/sse-reconnect";
import {
  classifyProviderRequestError,
  isAbortError,
  isRetriableProviderError,
  ProviderRequestError,
} from "@/lib/providers/provider-request-error";

export interface OpenAIProviderConfig {
  apiKey: string;
  baseUrl?: string;
  model?: string;
  fetchImpl?: typeof fetch;
}

export function createOpenAIProvider(config: OpenAIProviderConfig): ResearchProvider {
  const baseUrl = config.baseUrl || "https://api.openai.com/v1";
  const model = config.model || "gpt-4o-mini";
  const fetchImpl = config.fetchImpl || globalThis.fetch;

  return {
    id: "openai",
    displayName: "OpenAI-compatible (" + model + ")",
    isMock: false,
    supportsStreaming: true,
    async generate(agentId: AgentId, ctx: ProviderContext): Promise<AgentOutput> {
      const wantsStream = typeof ctx.onProgress === "function";
      // R243: detect the user's language from the query so the agent can be
      // told to produce human-readable strings in the same language. The
      // schema, enum values, and URLs stay in English (validated by the
      // schema validator), but the summary, names, taglines, and snippets
      // come back localized. This is the cheapest way to give non-English
      // users a readable report without rewriting the schema validators
      // for every locale.
      const outputLanguage = detectQueryLanguage(ctx.query);
      // Classify a thrown error into a fallback reason so the engine can
      // surface "demo data" with an accurate tooltip. Without this the
      // catch below silently returned mock and the user had no idea the
      // real call failed.
      const reportFallback = (reason: ProviderFallbackReason) => {
        ctx.onFallback?.(reason);
      };
      try {
        const url = baseUrl.replace(/\/$/, "") + "/chat/completions";

        const doFetch = async () => {
          let r: Response;
          try {
            r = await fetchImpl(url, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": "Bearer " + config.apiKey,
              },
              signal: ctx.signal,
              body: JSON.stringify({
                model,
                temperature: 0.4,
                stream: wantsStream,
                response_format: { type: "json_object" },
                messages: [
                  { role: "system", content: buildSystemPrompt(agentId, outputLanguage) },
                  { role: "user", content: buildUserPrompt(agentId, { query: ctx.query, keywords: ctx.keywords, upstream: ctx.upstream, outputLanguage, retrievedSources: undefined }) },
                ],
              }),
            });
          } catch (e) {
            // Preserve explicit cancellation. Other transport failures are
            // tagged so the retry policy can distinguish them from 4xx and
            // only report degradation after all attempts are exhausted.
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
          // Let the reconnect reader own the first request as well as any
          // retries. The old path fetched once here and then fetched again
          // inside readSseWithReconnect, doubling live upstream concurrency.
          try {
            text = await readSseWithReconnect(
              doFetch,
              (assembled) => {
                const fraction = Math.min(0.95, assembled.length / 1500);
                ctx.onProgress!({ fraction, step: "Streaming response", partial: assembled });
              },
              parseOpenAiSse,
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
              reportFallback(classifyProviderRequestError(streamErr));
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
              reportFallback(classifyProviderRequestError(err));
            }
            throw err;
          }
          if (!res.ok) {
            // Non-retriable 4xx (e.g. 401 bad key) — report and fall back.
            reportFallback("http_error");
            throw new Error("provider HTTP " + res.status);
          }
          const json: any = await res.json();
          text = json?.choices?.[0]?.message?.content || "";
        }
        if (!text) {
          reportFallback("empty_response");
          throw new Error("empty provider response");
        }
        let parsed: unknown;
        try {
          // Reasoning models (MiniMax-M3, DeepSeek-R1, o1-style) wrap their
          // JSON in <think>…</think> blocks and/or fences; a bare JSON.parse
          // would fail on that scaffolding and silently degrade to mock.
          parsed = extractJsonObject(text);
        } catch {
          reportFallback("parse_error");
          throw new Error("provider returned non-JSON");
        }
        try {
          // R244: strict validate first; if the real provider only omitted
          // recoverable structural fields, normalize once and validate again.
          // Invalid citations / malformed evidence still fail into mock.
          return validateOrNormalizeAgentOutput(agentId, parsed);
        } catch {
          reportFallback("validation_error");
          throw new Error("provider output failed schema validation");
        }
      } catch {
        return mockResearchProvider.generate(agentId, ctx);
      }
    },
  };
}
