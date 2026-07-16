import type { LlmProvider } from "@/lib/admin/provider-credentials";

export function resolveManagedCredentialModel(
  provider: LlmProvider,
  slotModel: string | null,
  env: Readonly<Record<string, string | undefined>>,
): string {
  return slotModel ||
    (provider === "anthropic" ? env.ANTHROPIC_MODEL : env.OPENAI_MODEL) ||
    (provider === "anthropic" ? "claude-3-5-sonnet-latest" : "gpt-4o-mini");
}
