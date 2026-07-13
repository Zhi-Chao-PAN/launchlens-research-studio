// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { createAnthropicProvider } from "./anthropic-provider";
import { createAnthropicStructuredCompletionProvider } from "./anthropic-structured-completion";
import { createOpenAIProvider } from "./openai-provider";
import { createOpenAIStructuredCompletionProvider } from "./openai-structured-completion";
import { selectProvider } from "./provider-registry";
import {
  resetRetrievalProviderCache,
  selectRetrievalProvider,
} from "./retrieval-registry";
import { selectStructuredCompletionProvider } from "./structured-completion-registry";
import { TavilyRetrievalProvider } from "./tavily-retrieval-provider";

afterEach(() => {
  resetRetrievalProviderCache();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("provider base URL enforcement", () => {
  it.each([
    () => createOpenAIProvider({ apiKey: "secret", baseUrl: "http://provider.example/v1" }),
    () => createAnthropicProvider({ apiKey: "secret", baseUrl: "http://provider.example" }),
    () => new TavilyRetrievalProvider({ apiKey: "secret", baseUrl: "http://search.example" }),
  ])("rejects cleartext public provider endpoints during construction", (construct) => {
    expect(construct).toThrow(/base URL/i);
  });

  it.each([
    () => createOpenAIProvider({ apiKey: "secret", baseUrl: "https://user:pass@provider.example/v1" }),
    () => createAnthropicProvider({ apiKey: "secret", baseUrl: "https://user@provider.example" }),
    () => new TavilyRetrievalProvider({ apiKey: "secret", baseUrl: "https://user@search.example" }),
  ])("rejects provider endpoints containing URL credentials", (construct) => {
    expect(construct).toThrow(/base URL/i);
  });

  it("fails Standard provider selection closed for an unsafe configured URL", () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    const provider = selectProvider({
      NODE_ENV: "production",
      LAUNCHLENS_PROVIDER: "openai",
      OPENAI_API_KEY: "secret",
      OPENAI_BASE_URL: "http://localhost:11434/v1",
    } as NodeJS.ProcessEnv);

    expect(provider.id).toBe("mock");
    expect(warning).toHaveBeenCalledWith(
      "[provider] OPENAI_BASE_URL is unsafe; using mock generation.",
    );
  });

  it("fails Tavily selection closed for an unsafe configured URL", () => {
    vi.stubEnv("LAUNCHLENS_SEARCH_PROVIDER", "tavily");
    vi.stubEnv("TAVILY_API_KEY", "secret");
    vi.stubEnv("TAVILY_BASE_URL", "http://search.example");
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});

    const provider = selectRetrievalProvider();

    expect(provider.id).toBe("mock-retrieval");
    expect(warning).toHaveBeenCalledWith(
      "[retrieval] TAVILY_BASE_URL is unsafe; using mock retrieval.",
    );
  });

  it("marks strict reviewer selection unavailable for an unsafe URL", () => {
    expect(
      selectStructuredCompletionProvider({
        NODE_ENV: "production",
        LAUNCHLENS_REVIEW_PROVIDER: "openai",
        LAUNCHLENS_REVIEW_OPENAI_KEY: "secret",
        LAUNCHLENS_REVIEW_BASE_URL: "http://localhost:11434/v1",
      }),
    ).toEqual({ kind: "unavailable", reason: "invalid_provider_url" });
  });

  it.each([
    () => createOpenAIStructuredCompletionProvider({
      apiKey: "secret",
      baseUrl: "http://provider.example/v1",
    }),
    () => createAnthropicStructuredCompletionProvider({
      apiKey: "secret",
      baseUrl: "https://user:pass@provider.example",
    }),
  ])("surfaces strict reviewer URL failures as configuration errors", (construct) => {
    expect(construct).toThrow(expect.objectContaining({
      code: "configuration_error",
      retryable: false,
    }));
  });
});
