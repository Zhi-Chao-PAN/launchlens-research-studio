import {
  StructuredCompletionError,
  type StructuredCompletionProvider,
  type StructuredCompletionRequest,
  createCompletionDeadline,
  httpCompletionError,
  normalizeStructuredCompletionRequest,
  parseProviderEnvelope,
  readResponseTextBounded,
  structuredJsonInstruction,
  throwIfCompletionAborted,
  toStructuredTransportError,
  validateStructuredContent,
} from "./structured-completion";
import {
  ProviderBaseUrlError,
  normalizeProviderBaseUrl,
} from "@/lib/security/provider-base-url";

export interface AnthropicStructuredCompletionConfig {
  apiKey: string;
  baseUrl?: string;
  model?: string;
  fetchImpl?: typeof fetch;
}

const PROVIDER_ID = "anthropic";
const MAX_RESPONSE_ENVELOPE_CHARS = 512_000;

/** Strict JSON completion over Anthropic's Messages API, without fallback. */
export function createAnthropicStructuredCompletionProvider(
  config: AnthropicStructuredCompletionConfig,
): StructuredCompletionProvider {
  if (!config.apiKey?.trim()) {
    throw new StructuredCompletionError({
      code: "configuration_error",
      providerId: PROVIDER_ID,
      message: "Anthropic API key is required for structured completion.",
      retryable: false,
    });
  }

  let baseUrl: string;
  try {
    baseUrl = normalizeProviderBaseUrl(config.baseUrl, "https://api.anthropic.com");
  } catch (error) {
    if (!(error instanceof ProviderBaseUrlError)) throw error;
    throw new StructuredCompletionError({
      code: "configuration_error",
      providerId: PROVIDER_ID,
      message: "Anthropic structured completion base URL must be an allowed HTTPS endpoint.",
      retryable: false,
    });
  }
  const model = config.model || "claude-3-5-sonnet-latest";
  const fetchImpl = config.fetchImpl || globalThis.fetch;

  return {
    id: PROVIDER_ID,
    displayName: `Anthropic Messages (${model})`,
    model,
    isMock: false,

    async complete<T>(request: StructuredCompletionRequest<T>): Promise<T> {
      const normalized = normalizeStructuredCompletionRequest(PROVIDER_ID, request);
      const deadline = createCompletionDeadline(normalized.signal, normalized.timeoutMs);

      try {
        throwIfCompletionAborted(PROVIDER_ID, deadline);
        let response: Response;
        try {
          response = await fetchImpl(`${baseUrl}/v1/messages`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-api-key": config.apiKey,
              "anthropic-version": "2023-06-01",
            },
            signal: deadline.signal,
            body: JSON.stringify({
              model,
              max_tokens: normalized.maxOutputTokens,
              temperature: normalized.temperature,
              stream: false,
              system: `${structuredJsonInstruction(normalized.schemaName)}\n\n${normalized.systemPrompt}`,
              messages: [{ role: "user", content: normalized.userPrompt }],
            }),
          });
        } catch (error) {
          throw toStructuredTransportError(PROVIDER_ID, error, deadline);
        }

        if (!response.ok) throw httpCompletionError(PROVIDER_ID, response.status);

        let body: string;
        try {
          const envelopeLimit = Math.min(
            MAX_RESPONSE_ENVELOPE_CHARS,
            normalized.maxOutputChars * 4 + 32_000,
          );
          body = await readResponseTextBounded(PROVIDER_ID, response, envelopeLimit);
        } catch (error) {
          throw toStructuredTransportError(PROVIDER_ID, error, deadline);
        }

        const envelope = parseProviderEnvelope(PROVIDER_ID, body);
        const content = anthropicContent(envelope);
        return validateStructuredContent(
          PROVIDER_ID,
          content,
          normalized.maxOutputChars,
          normalized.validate,
        );
      } finally {
        deadline.dispose();
      }
    },
  };
}

function anthropicContent(envelope: unknown): string {
  if (!isRecord(envelope) || !Array.isArray(envelope.content)) {
    throw invalidEnvelope();
  }
  const text = envelope.content
    .filter((block): block is Record<string, unknown> => isRecord(block) && block.type === "text")
    .map((block) => block.text)
    .filter((value): value is string => typeof value === "string")
    .join("");
  if (!text) throw invalidEnvelope();
  return text;
}

function invalidEnvelope(): StructuredCompletionError {
  return new StructuredCompletionError({
    code: "invalid_response",
    providerId: PROVIDER_ID,
    message: "Anthropic structured completion response is missing text content.",
    retryable: true,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
