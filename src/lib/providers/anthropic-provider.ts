/* eslint-disable @typescript-eslint/no-explicit-any */
// Anthropic Messages API adapter.
// Targets POST {baseUrl}/v1/messages with x-api-key header. Falls back
// to mock outputs on HTTP failure or validation failure so the demo
// path is always intact, and validates the parsed JSON before returning.

import type { AgentId, AgentOutput } from "@/lib/schema/research-schema";
import type { ProviderContext, ResearchProvider } from "@/lib/providers/provider.types";
import { mockResearchProvider } from "@/lib/providers/mock-provider-adapter";
import { validateAgentOutput } from "@/lib/providers/output-validator";

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
  // Anthropic Messages API: { content: [{ type: "text", text: "..." }] }
  const blocks = Array.isArray(json?.content) ? json.content : [];
  for (const block of blocks) {
    if (block && block.type === "text" && typeof block.text === "string") {
      return block.text;
    }
  }
  return "";
}

export function createAnthropicProvider(config: AnthropicProviderConfig): ResearchProvider {
  const baseUrl = config.baseUrl || "https://api.anthropic.com";
  const model = config.model || "claude-3-5-sonnet-latest";
  const fetchImpl = config.fetchImpl || globalThis.fetch;

  return {
    id: "anthropic",
    displayName: "Anthropic Messages (" + model + ")",
    isMock: false,
    async generate(agentId: AgentId, ctx: ProviderContext): Promise<AgentOutput> {
      try {
        const url = baseUrl.replace(/\/$/, "") + "/v1/messages";
        const res = await fetchImpl(url, {
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
            system: buildSystemPrompt(agentId),
            messages: [
              { role: "user", content: buildUserPrompt(agentId, ctx) },
            ],
          }),
        });
        if (!res.ok) throw new Error("anthropic HTTP " + res.status);
        const json: any = await res.json();
        const text = extractJsonFromMessages(json);
        const parsed = JSON.parse(text);
        return validateAgentOutput(agentId, parsed);
      } catch {
        return mockResearchProvider.generate(agentId, ctx);
      }
    },
  };
}
