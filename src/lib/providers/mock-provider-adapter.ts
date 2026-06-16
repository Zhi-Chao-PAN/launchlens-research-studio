// Wraps the deterministic mock generator into the ResearchProvider shape.
import type { AgentId, AgentOutput } from "@/lib/schema/research-schema";
import { generateMockAgentOutput } from "@/lib/providers/mock-provider";
import type { ProviderContext, ResearchProvider } from "@/lib/providers/provider.types";

export const mockResearchProvider: ResearchProvider = {
  id: "mock",
  displayName: "Mock (deterministic)",
  isMock: true,
  async generate(agentId: AgentId, ctx: ProviderContext): Promise<AgentOutput> {
    return generateMockAgentOutput(agentId, ctx.query, ctx.keywords, ctx.upstream);
  },
};
