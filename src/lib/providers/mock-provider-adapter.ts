// Wraps the deterministic mock generator into the ResearchProvider shape.
// Synthesizes progress events so consumers see uniform telemetry whether
// the underlying provider is mock or a real streaming model.
import type { AgentId, AgentOutput } from "@/lib/schema/research-schema";
import { generateMockAgentOutput } from "@/lib/providers/mock-provider";
import { applyQueryVariability } from "@/lib/providers/mock-variability";
import type { ProviderContext, ResearchProvider } from "@/lib/providers/provider.types";

const MOCK_STEPS = [
  { fraction: 0.2, step: "step.loadingContext" },
  { fraction: 0.5, step: "step.synthesizingFindings" },
  { fraction: 0.85, step: "step.compilingCitations" },
  { fraction: 1.0, step: "step.complete" },
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
    return applyQueryVariability(agentId, base, ctx.query, ctx.keywords);
  },
};
