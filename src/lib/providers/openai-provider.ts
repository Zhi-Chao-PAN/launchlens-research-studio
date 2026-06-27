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
import { validateAgentOutput } from "@/lib/providers/output-validator";
import { buildSystemPrompt, buildUserPrompt } from "@/lib/providers/agent-prompts";
import { retryWithBackoff } from "@/lib/utils/retry";
import { readSseWithReconnect, parseOpenAiSse } from "@/lib/utils/sse-reconnect";

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
                  { role: "system", content: buildSystemPrompt(agentId) },
                  { role: "user", content: buildUserPrompt(agentId, ctx) },
                ],
              }),
            });
          } catch (e) {
            // fetchImpl threw before any response — DNS, connection refused,
            // timeout, etc. Aborts are a user cancel, not a degradation, so
            // let them propagate untouched. Network errors are retriable for
            // the breaker's sake but we tag them as the fallback reason.
            const isAbort = e instanceof Error && (e.name === "AbortError" || (ctx.signal && ctx.signal.aborted));
            if (!isAbort) reportFallback("network_error");
            throw e;
          }
          if (!r.ok && (r.status >= 500 || r.status === 429)) {
            throw new Error("retriable HTTP " + r.status);
          }
          return r;
        };

        let res: Response;
        try {
          res = await retryWithBackoff(doFetch, {
            maxAttempts: 3,
            baseDelayMs: 200,
            maxDelayMs: 2000,
            shouldRetry: (err) => err instanceof Error && err.message.startsWith("retriable HTTP"),
          });
        } catch (err) {
          // Retries exhausted on a retriable HTTP error (5xx/429), or a
          // network error propagated from doFetch (already reported there).
          // Tag HTTP exhaustion so the UI can show an accurate reason;
          // network errors were already tagged inside doFetch.
          const isHttp = err instanceof Error && err.message.startsWith("retriable HTTP");
          if (isHttp) reportFallback("http_error");
          throw err;
        }

        if (!res.ok) {
          // Non-retriable 4xx (e.g. 401 bad key) — report and fall back.
          reportFallback("http_error");
          throw new Error("provider HTTP " + res.status);
        }

        let text: string;
        if (wantsStream) {
          // We already have a Response from the first request, but the
          // reconnect helper needs a factory so it can restart on drop.
          // Reuse the same fetch factory for reconnects.
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
              },
            );
          } catch (streamErr) {
            // R205 gap: the streaming path previously let readSseWithReconnect
            // failures fall straight to the outer catch without reporting a
            // reason, so a stream that dropped after retries (or returned an
            // HTTP error / empty body mid-stream) degraded to mock with no
            // "demo" badge. Classify the SSE error so the UI shows the cause.
            const isAbort = streamErr instanceof Error && (streamErr.name === "AbortError" || (ctx.signal && ctx.signal.aborted));
            if (!isAbort) reportFallback("network_error");
            throw streamErr;
          }
          ctx.onProgress!({ fraction: 1, step: "Validating output" });
        } else {
          const json: any = await res.json();
          text = json?.choices?.[0]?.message?.content || "";
        }
        if (!text) {
          reportFallback("empty_response");
          throw new Error("empty provider response");
        }
        let parsed: unknown;
        try {
          parsed = JSON.parse(text);
        } catch {
          reportFallback("parse_error");
          throw new Error("provider returned non-JSON");
        }
        try {
          return validateAgentOutput(agentId, parsed);
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
