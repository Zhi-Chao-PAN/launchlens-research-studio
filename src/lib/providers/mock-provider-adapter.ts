// Wraps the deterministic mock generator into the ResearchProvider shape.
// Synthesizes progress events so consumers see uniform telemetry whether
// the underlying provider is mock or a real streaming model.
import type { AgentId, AgentOutput } from "@/lib/schema/research-schema";
import { generateMockAgentOutput } from "@/lib/providers/mock-provider";
import { applyQueryVariability } from "@/lib/providers/mock-variability";
import type { ProviderContext, ResearchProvider } from "@/lib/providers/provider.types";
import { applyPersona } from "@/lib/providers/mock-persona";

const MOCK_STEPS = [
  { fraction: 0.2, step: "Loading research context" },
  { fraction: 0.5, step: "Synthesizing findings" },
  { fraction: 0.85, step: "Compiling citations" },
  { fraction: 1.0, step: "Complete" },
];

export const mockResearchProvider: ResearchProvider = {
  id: "mock",
  displayName: "Mock (deterministic)",
  isMock: true,
  supportsStreaming: false,
  async generate(agentId: AgentId, ctx: ProviderContext): Promise<AgentOutput> {
    if (ctx.onProgress) {
      for (const event of MOCK_STEPS) {
        ctx.onProgress(event);
      }
    }
    const base = generateMockAgentOutput(agentId, ctx.query, ctx.keywords, ctx.upstream);
    const withVariability = applyQueryVariability(agentId, base, ctx.query, ctx.keywords);
    return applyPersona(withVariability, ctx.personaId);
  },
};
