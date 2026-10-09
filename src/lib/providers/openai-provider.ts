/* eslint-disable @typescript-eslint/no-explicit-any */
// OpenAI-compatible provider adapter.
// Targets any chat-completions endpoint that returns JSON when prompted to.
// Throws on any remote failure — the caller (research-engine) is responsible
// for fallback to mock and circuit-breaker telemetry. When ctx.onProgress is
// defined the adapter requests stream:true and forwards partial tokens.
// Transient HTTP errors (5xx, 429) are retried with exponential backoff;
// 4xx errors are surfaced immediately so the outer fallback can degrade
// to the mock without burning quota.

import type { AgentId, AgentOutput } from "@/lib/schema/research-schema";
import type { ProviderContext, ResearchProvider } from "@/lib/providers/provider.types";
import { validateAgentOutput } from "@/lib/providers/output-validator";
import { retryWithBackoff } from "@/lib/utils/retry";

export interface OpenAIProviderConfig {
  apiKey: string;
  baseUrl?: string;
  model?: string;
  fetchImpl?: typeof fetch;
}

function buildSystemPrompt(agentId: AgentId): string {
  return [
    "You are the " + agentId + " agent in a multi-agent market intelligence system.",
    "Respond with strict JSON that matches the LaunchLens AgentOutput schema for this agent.",
    "Do not include explanations outside the JSON object.",
  ].join(" ");
}

function buildUserPrompt(agentId: AgentId, ctx: ProviderContext): string {
  const upstream = ctx.upstream && ctx.upstream.length
    ? "\nUpstream agent outputs (JSON): " + JSON.stringify(ctx.upstream).slice(0, 4000)
    : "";
  return [
    "Agent: " + agentId,
    "Product idea: " + ctx.query,
    "Keywords: " + (ctx.keywords || []).join(", "),
    upstream,
  ].filter(Boolean).join("\n");
}

async function readSSE(res: Response, onChunk: (text: string) => void): Promise<string> {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let assembled = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const raw of lines) {
      const line = raw.trim();
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const json = JSON.parse(payload);
        const delta = json?.choices?.[0]?.delta?.content;
        if (typeof delta === "string" && delta.length > 0) {
          assembled += delta;
          onChunk(assembled);
        }
      } catch {
        // tolerate malformed SSE frames; the final JSON validator catches it.
      }
    }
  }
  return assembled;
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
      const url = baseUrl.replace(/\/$/, "") + "/chat/completions";
      // Per-attempt timeout: 90s for streaming, 60s for JSON. Prevents hung fetches.
      const ATTEMPT_TIMEOUT_MS = wantsStream ? 90_000 : 60_000;

        const doFetch = async () => {
          // Compose per-attempt signal: user abort + per-attempt timeout
          let attemptSignal = ctx.signal;
          if (typeof AbortSignal !== "undefined" && "timeout" in AbortSignal) {
            const timeout = (AbortSignal as any).timeout(ATTEMPT_TIMEOUT_MS);
            if (ctx.signal && "any" in AbortSignal) {
              attemptSignal = (AbortSignal as any).any([ctx.signal, timeout]);
            } else if (!ctx.signal) {
              attemptSignal = timeout;
            }
          }
          const r = await fetchImpl(url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": "Bearer " + config.apiKey,
            },
            signal: attemptSignal,
            body: JSON.stringify({
              model,
              temperature: 0.4,
              max_tokens: 8192,
              stream: wantsStream,
              response_format: { type: "json_object" },
              messages: [
                { role: "system", content: buildSystemPrompt(agentId) },
                { role: "user", content: buildUserPrompt(agentId, ctx) },
              ],
            }),
          });
          // Retry 5xx, 429, and transient network failures (TypeError).
          if (!r.ok && (r.status >= 500 || r.status === 429)) {
            throw new Error("retriable HTTP " + r.status);
          }
          return r;
        };

        const res = await retryWithBackoff(doFetch, {
          maxAttempts: 3,
          baseDelayMs: 200,
          maxDelayMs: 2000,
          signal: ctx.signal,
          shouldRetry: (err) => {
            if (err instanceof Error && err.message.startsWith("retriable HTTP")) return true;
            if (err instanceof TypeError) return true;
            if (err instanceof DOMException && err.name === "TimeoutError") return true;
            if (err instanceof Error && err.name === "TimeoutError") return true;
            return false;
          },
        });

        if (!res.ok) throw new Error("provider HTTP " + res.status);

      let text: string;
      if (wantsStream) {
        // Per-agent estimated output size (in characters) for progress estimation.
        const estimatedChars: Record<string, number> = {
          "market-sizer": 2200,
          "competitor-analyst": 2800,
          "pain-detective": 2500,
          "pricing-scout": 1800,
          "channel-scout": 2000,
          synthesis: 3500,
        };
        const expected = estimatedChars[agentId] ?? 2000;
        text = await readSSE(res as unknown as Response, (assembled) => {
          // Ease-out curve for more natural-feeling progress
          const raw = Math.min(0.9, assembled.length / expected);
          const fraction = raw < 0.5
            ? 2 * raw * raw
            : 1 - Math.pow(-2 * raw + 2, 2) / 2;
          ctx.onProgress!({ fraction: Math.min(0.95, fraction), step: "step.streaming", partial: assembled });
        });
        ctx.onProgress!({ fraction: 1, step: "step.validating" });
      } else {
          const json: any = await res.json();
          text = json?.choices?.[0]?.message?.content || "";
        }
        const parsed = JSON.parse(text);
        return validateAgentOutput(agentId, parsed);
    },
  };
}
