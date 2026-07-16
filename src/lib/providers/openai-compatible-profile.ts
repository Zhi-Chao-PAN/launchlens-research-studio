/**
 * Request capabilities that differ across the OpenAI-compatible endpoints in
 * the managed keyring. Keep this intentionally small: only fields whose
 * provider contracts are known to differ belong here.
 */
export interface OpenAICompatibleEndpointProfile {
  id: "generic" | "minimax";
  normalizeTemperature(value: number): number;
  completionTokenField: "max_tokens" | "max_completion_tokens";
  supportsJsonObjectResponseFormat: boolean;
}

export interface OpenAICompatibleRequestOptions {
  temperature: number;
  maxOutputTokens?: number;
  jsonObject?: boolean;
}

export const MINIMAX_DEFAULT_MODEL = "MiniMax-M3";

const MINIMAX_HOSTS = new Set([
  "api.minimaxi.com",
  "api.minimax.io",
]);

const GENERIC_PROFILE: OpenAICompatibleEndpointProfile = {
  id: "generic",
  normalizeTemperature: (value) => value,
  completionTokenField: "max_tokens",
  supportsJsonObjectResponseFormat: true,
};

const MINIMAX_PROFILE: OpenAICompatibleEndpointProfile = {
  id: "minimax",
  // M2.x rejects zero and MiniMax recommends 1. M3 also accepts 1, so this
  // preserves deterministic caller values where supported while remaining
  // compatible with every currently selectable MiniMax text model.
  normalizeTemperature: (value) => value <= 0 ? 1 : value,
  completionTokenField: "max_completion_tokens",
  // MiniMax's current Chat Completions reference does not declare
  // response_format. Strict JSON remains enforced by prompt + parser.
  supportsJsonObjectResponseFormat: false,
};

export function resolveOpenAICompatibleEndpointProfile(
  baseUrl: string,
): OpenAICompatibleEndpointProfile {
  try {
    const hostname = new URL(baseUrl).hostname.toLowerCase();
    return MINIMAX_HOSTS.has(hostname) ? MINIMAX_PROFILE : GENERIC_PROFILE;
  } catch {
    // Base URL validation is owned by the adapter boundary. Returning the
    // generic profile keeps this pure helper total for already-validated use.
    return GENERIC_PROFILE;
  }
}

export function openAICompatibleRequestOptions(
  baseUrl: string,
  options: OpenAICompatibleRequestOptions,
): Record<string, unknown> {
  const profile = resolveOpenAICompatibleEndpointProfile(baseUrl);
  const request: Record<string, unknown> = {
    temperature: profile.normalizeTemperature(options.temperature),
  };
  if (options.maxOutputTokens !== undefined) {
    request[profile.completionTokenField] = options.maxOutputTokens;
  }
  if (options.jsonObject && profile.supportsJsonObjectResponseFormat) {
    request.response_format = { type: "json_object" };
  }
  return request;
}
