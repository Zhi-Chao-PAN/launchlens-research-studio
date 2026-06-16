/* eslint-disable @typescript-eslint/no-explicit-any */
// Anthropic Messages API adapter.
// Targets POST {baseUrl}/v1/messages with x-api-key header. Falls back
// to mock outputs on HTTP failure or validation failure so the demo
// path is always intact, and validates the parsed JSON before returning.
// When ctx.onProgress is defined the adapter requests stream:true and
// forwards Anthropic content_block_delta events as partial text plus a
// fraction estimate. Transient HTTP errors (5xx, 429) are retried with
// exponential backoff; 4xx errors are surfaced immediately.

import type { AgentId, AgentOutput } from "@/lib/schema/research-schema";
import type { ProviderContext, ResearchProvider } from "@/lib/providers/provider.types";
import { mockResearchProvider } from "@/lib/providers/mock-provider-adapter";
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
      try {
        const url = baseUrl.replace(/\/$/, "") + "/v1/messages";

        const doFetch = async () => {
          const r = await fetchImpl(url, {
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
              system: buildSystemPrompt(agentId),
              messages: [
                { role: "user", content: buildUserPrompt(agentId, ctx) },
              ],
            }),
          });
          if (!r.ok && (r.status >= 500 || r.status === 429)) {
            throw new Error("retriable HTTP " + r.status);
          }
          return r;
        };

        const res = await retryWithBackoff(doFetch, {
          maxAttempts: 3,
          baseDelayMs: 200,
          maxDelayMs: 2000,
          shouldRetry: (err) => err instanceof Error && err.message.startsWith("retriable HTTP"),
        });

        if (!res.ok) throw new Error("anthropic HTTP " + res.status);

        let text: string;
        if (wantsStream) {
          text = await readAnthropicSSE(res as unknown as Response, (assembled) => {
            const fraction = Math.min(0.95, assembled.length / 1500);
            ctx.onProgress!({ fraction, step: "Streaming response", partial: assembled });
          });
          ctx.onProgress!({ fraction: 1, step: "Validating output" });
        } else {
          const json: any = await res.json();
          text = extractJsonFromMessages(json);
        }
        const parsed = JSON.parse(text);
        return validateAgentOutput(agentId, parsed);
      } catch {
        return mockResearchProvider.generate(agentId, ctx);
      }
    },
  };
}
