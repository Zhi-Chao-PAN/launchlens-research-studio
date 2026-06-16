/* eslint-disable @typescript-eslint/no-explicit-any */
// OpenAI-compatible provider adapter.
// Targets any chat-completions endpoint that returns JSON when prompted to.
// Falls back to the mock provider on any remote failure so the demo path
// always succeeds, even with a misconfigured key.

import type { AgentId, AgentOutput } from "@/lib/schema/research-schema";
import type { ProviderContext, ResearchProvider } from "@/lib/providers/provider.types";
import { mockResearchProvider } from "@/lib/providers/mock-provider-adapter";

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

export function createOpenAIProvider(config: OpenAIProviderConfig): ResearchProvider {
  const baseUrl = config.baseUrl || "https://api.openai.com/v1";
  const model = config.model || "gpt-4o-mini";
  const fetchImpl = config.fetchImpl || globalThis.fetch;

  return {
    id: "openai",
    displayName: "OpenAI-compatible (" + model + ")",
    isMock: false,
    async generate(agentId: AgentId, ctx: ProviderContext): Promise<AgentOutput> {
      try {
        const url = baseUrl.replace(/\/$/, "") + "/chat/completions";
        const res = await fetchImpl(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": "Bearer " + config.apiKey,
          },
          signal: ctx.signal,
          body: JSON.stringify({
            model,
            temperature: 0.4,
            response_format: { type: "json_object" },
            messages: [
              { role: "system", content: buildSystemPrompt(agentId) },
              { role: "user", content: buildUserPrompt(agentId, ctx) },
            ],
          }),
        });
        if (!res.ok) throw new Error("provider HTTP " + res.status);
        const json: any = await res.json();
        const text: string = json?.choices?.[0]?.message?.content || "";
        const parsed = JSON.parse(text) as AgentOutput;
        return parsed;
      } catch {
        // Graceful fallback: keep the demo path alive.
        return mockResearchProvider.generate(agentId, ctx);
      }
    },
  };
}
