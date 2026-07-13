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

export interface OpenAIStructuredCompletionConfig {
  apiKey: string;
  baseUrl?: string;
  model?: string;
  fetchImpl?: typeof fetch;
}

const PROVIDER_ID = "openai";
const MAX_RESPONSE_ENVELOPE_CHARS = 512_000;

/** Strict JSON completion over the same OpenAI-compatible endpoint as Standard. */
export function createOpenAIStructuredCompletionProvider(
  config: OpenAIStructuredCompletionConfig,
): StructuredCompletionProvider {
  if (!config.apiKey?.trim()) {
    throw new StructuredCompletionError({
      code: "configuration_error",
      providerId: PROVIDER_ID,
      message: "OpenAI API key is required for structured completion.",
      retryable: false,
    });
  }

  let baseUrl: string;
  try {
    baseUrl = normalizeProviderBaseUrl(config.baseUrl, "https://api.openai.com/v1");
  } catch (error) {
    if (!(error instanceof ProviderBaseUrlError)) throw error;
    throw new StructuredCompletionError({
      code: "configuration_error",
      providerId: PROVIDER_ID,
      message: "OpenAI structured completion base URL must be an allowed HTTPS endpoint.",
      retryable: false,
    });
  }
  const model = config.model || "gpt-4o-mini";
  const fetchImpl = config.fetchImpl || globalThis.fetch;

  return {
    id: PROVIDER_ID,
    displayName: `OpenAI-compatible (${model})`,
    model,
    isMock: false,

    async complete<T>(request: StructuredCompletionRequest<T>): Promise<T> {
      const normalized = normalizeStructuredCompletionRequest(PROVIDER_ID, request);
      const deadline = createCompletionDeadline(normalized.signal, normalized.timeoutMs);

      try {
        throwIfCompletionAborted(PROVIDER_ID, deadline);
        let response: Response;
        try {
          response = await fetchImpl(`${baseUrl}/chat/completions`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${config.apiKey}`,
            },
            signal: deadline.signal,
            body: JSON.stringify({
              model,
              temperature: normalized.temperature,
              stream: false,
              max_tokens: normalized.maxOutputTokens,
              response_format: { type: "json_object" },
              messages: [
                {
                  role: "system",
                  content: `${structuredJsonInstruction(normalized.schemaName)}\n\n${normalized.systemPrompt}`,
                },
                { role: "user", content: normalized.userPrompt },
              ],
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
        const content = openAIContent(envelope);
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

function openAIContent(envelope: unknown): string {
  if (!isRecord(envelope) || !Array.isArray(envelope.choices)) {
    throw invalidEnvelope();
  }
  const first = envelope.choices[0];
  if (!isRecord(first) || !isRecord(first.message) || typeof first.message.content !== "string") {
    throw invalidEnvelope();
  }
  return first.message.content;
}

function invalidEnvelope(): StructuredCompletionError {
  return new StructuredCompletionError({
    code: "invalid_response",
    providerId: PROVIDER_ID,
    message: "OpenAI structured completion response is missing message content.",
    retryable: true,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
