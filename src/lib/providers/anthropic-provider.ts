/* eslint-disable @typescript-eslint/no-explicit-any */
// Anthropic Messages API adapter.
// Targets POST {baseUrl}/v1/messages with x-api-key header.
// Throws on HTTP failure or validation failure — the caller (research-engine)
// is responsible for fallback to mock and circuit-breaker telemetry.
// When ctx.onProgress is defined the adapter requests stream:true and
// forwards Anthropic content_block_delta events as partial text plus a
// fraction estimate. Transient HTTP errors (5xx, 429) are retried with
// exponential backoff; 4xx errors are surfaced immediately.

import type { AgentId, AgentOutput } from "@/lib/schema/research-schema";
import type { ProviderContext, ResearchProvider } from "@/lib/providers/provider.types";
import { validateAgentOutput } from "@/lib/providers/output-validator";
import { retryWithBackoff } from "@/lib/utils/retry";

export interface AnthropicProviderConfig {
  apiKey: string;
  baseUrl?: string;
  model?: string;
  fetchImpl?: typeof fetch;
}

function buildSystemPrompt(agentId: AgentId): string {
  return [
    "You are the " + agentId + " agent in a multi-agent market intelligence system.",
    "Respond with strict JSON that matches the LaunchLens AgentOutput schema for this agent.",
    "Do not include explanations, prose, or fences outside the JSON object.",
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

function extractJsonFromMessages(json: any): string {
  const blocks = Array.isArray(json?.content) ? json.content : [];
  for (const block of blocks) {
    if (block && block.type === "text" && typeof block.text === "string") {
      return block.text;
    }
  }
  return "";
}

async function readAnthropicSSE(res: Response, onChunk: (text: string) => void): Promise<string> {
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
      if (!payload) continue;
      try {
        const event = JSON.parse(payload);
        // Anthropic streams content via content_block_delta with text_delta blocks.
        if (event?.type === "content_block_delta" && event?.delta?.type === "text_delta") {
          const t = event.delta.text;
          if (typeof t === "string" && t.length > 0) {
            assembled += t;
            onChunk(assembled);
          }
        }
      } catch {
        // tolerate malformed frames
      }
    }
  }
  return assembled;
}

export function createAnthropicProvider(config: AnthropicProviderConfig): ResearchProvider {
  const baseUrl = config.baseUrl || "https://api.anthropic.com";
  const model = config.model || "claude-3-5-sonnet-latest";
  const fetchImpl = config.fetchImpl || globalThis.fetch;

  return {
    id: "anthropic",
    displayName: "Anthropic Messages (" + model + ")",
    isMock: false,
    supportsStreaming: true,
    async generate(agentId: AgentId, ctx: ProviderContext): Promise<AgentOutput> {
      const wantsStream = typeof ctx.onProgress === "function";
      const url = baseUrl.replace(/\/$/, "") + "/v1/messages";
      // Per-attempt timeout: 90s for streaming (long outputs), 60s for JSON.
      // Prevents hung fetches from leaking resources. Timeout is retriable.
      const ATTEMPT_TIMEOUT_MS = wantsStream ? 90_000 : 60_000;

        const doFetch = async () => {
          // Compose abort signal per attempt: user cancellation + per-attempt timeout.
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
              "x-api-key": config.apiKey,
              "anthropic-version": "2023-06-01",
            },
            signal: attemptSignal,
            body: JSON.stringify({
              model,
              max_tokens: 8192,
              temperature: 0.4,
              stream: wantsStream,
              system: buildSystemPrompt(agentId),
              messages: [
                { role: "user", content: buildUserPrompt(agentId, ctx) },
              ],
            }),
          });
          // Retry on 5xx, 429, *and* network failures (TypeError from fetch).
          // 4xx (401/403 bad key, etc.) surface immediately so we don't burn quota.
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
            if (err instanceof TypeError) return true; // network failure
            if (err instanceof DOMException && err.name === "TimeoutError") return true;
            if (err instanceof Error && err.name === "TimeoutError") return true;
            return false;
          },
        });

        if (!res.ok) throw new Error("anthropic HTTP " + res.status);

        let text: string;
        if (wantsStream) {
          // Per-agent estimated output size (in characters) for progress estimation.
          // These are rough averages — the actual output varies, but using
          // per-agent baselines gives a more realistic progress curve than a
          // one-size-fits-all 1500-char assumption.
          const estimatedChars: Record<string, number> = {
            "market-sizer": 2200,
            "competitor-analyst": 2800,
            "pain-detective": 2500,
            "pricing-scout": 1800,
            "channel-scout": 2000,
            synthesis: 3500,
          };
          const expected = estimatedChars[agentId] ?? 2000;
          text = await readAnthropicSSE(res as unknown as Response, (assembled) => {
            // Ease-out curve: progress grows quickly at first, slows as it
            // approaches 90%, giving a natural deceleration feel.
            const raw = Math.min(0.9, assembled.length / expected);
            const fraction = raw < 0.5
              ? 2 * raw * raw
              : 1 - Math.pow(-2 * raw + 2, 2) / 2;
            ctx.onProgress!({ fraction: Math.min(0.95, fraction), step: "step.streaming", partial: assembled });
          });
          ctx.onProgress!({ fraction: 1, step: "step.validating" });
        } else {
          const json: any = await res.json();
          text = extractJsonFromMessages(json);
        }
        const parsed = JSON.parse(text);
        return validateAgentOutput(agentId, parsed);
    },
  };
}
