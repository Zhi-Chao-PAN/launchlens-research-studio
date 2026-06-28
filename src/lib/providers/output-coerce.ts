import type { AgentId, AgentOutput } from "@/lib/schema/research-schema";
import { normalizeAgentOutput } from "@/lib/providers/output-normalize";
import { validateAgentOutput } from "@/lib/providers/output-validator";

/**
 * Accept real provider output only when it can satisfy the same validator the
 * UI relies on. We first try the strict path so already-valid output is kept
 * unchanged. If a real LLM omits a recoverable structural field (for example
 * an array the UI can safely render as empty), we normalize once and validate
 * again. Uncited, malformed, or semantically invalid output still throws and
 * lets the caller fall back to mock data.
 */
export function validateOrNormalizeAgentOutput(agentId: AgentId, parsed: unknown): AgentOutput {
  try {
    return normalizeAgentOutput(agentId, validateAgentOutput(agentId, parsed));
  } catch {
    return validateAgentOutput(agentId, normalizeAgentOutput(agentId, parsed));
  }
}
