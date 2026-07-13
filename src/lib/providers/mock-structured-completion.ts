import {
  type StructuredCompletionProvider,
  type StructuredCompletionRequest,
  createCompletionDeadline,
  normalizeStructuredCompletionRequest,
  throwIfCompletionAborted,
  validateStructuredContent,
} from "./structured-completion";

export interface DeterministicStructuredCompletionConfig {
  id?: string;
  model?: string;
  respond: (request: Readonly<{
    schemaName: string;
    systemPrompt: string;
    userPrompt: string;
  }>) => unknown;
}

/** Explicit test/demo adapter. Production selection never silently chooses it. */
export function createDeterministicStructuredCompletionProvider(
  config: DeterministicStructuredCompletionConfig,
): StructuredCompletionProvider {
  const id = config.id?.trim() || "mock-structured";
  const model = config.model?.trim() || "deterministic-fixture";

  return {
    id,
    displayName: `Deterministic structured completion (${model})`,
    model,
    isMock: true,

    async complete<T>(request: StructuredCompletionRequest<T>): Promise<T> {
      const normalized = normalizeStructuredCompletionRequest(id, request);
      const deadline = createCompletionDeadline(normalized.signal, normalized.timeoutMs);
      try {
        throwIfCompletionAborted(id, deadline);
        const value = config.respond({
          schemaName: normalized.schemaName,
          systemPrompt: normalized.systemPrompt,
          userPrompt: normalized.userPrompt,
        });
        throwIfCompletionAborted(id, deadline);
        const serialized = JSON.stringify(value);
        return validateStructuredContent(
          id,
          serialized,
          normalized.maxOutputChars,
          normalized.validate,
        );
      } finally {
        deadline.dispose();
      }
    },
  };
}
