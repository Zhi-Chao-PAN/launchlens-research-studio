// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  ProviderBaseUrlError,
  isSafeProviderBaseUrl,
  normalizeProviderBaseUrl,
} from "./provider-base-url";

describe("normalizeProviderBaseUrl", () => {
  it("normalizes HTTPS provider endpoints without changing their path", () => {
    expect(
      normalizeProviderBaseUrl("https://Gateway.Example/v1/", "https://unused.example"),
    ).toBe("https://gateway.example/v1");
  });

  it.each([
    "http://provider.example/v1",
    "ftp://provider.example/v1",
    "https://user:secret@provider.example/v1",
    "https://provider.example/v1?redirect=https://evil.example",
    "https://provider.example/v1#fragment",
    "not-a-url",
  ])("rejects an unsafe endpoint before request construction: %s", (baseUrl) => {
    expect(() => normalizeProviderBaseUrl(baseUrl, "https://unused.example"))
      .toThrow(ProviderBaseUrlError);
  });

  it.each([
    "http://localhost:11434/v1",
    "http://model.localhost:8080/v1",
    "http://127.0.0.1:1234/v1",
    "http://127.23.45.67:1234/v1",
    "http://[::1]:1234/v1",
  ])("allows loopback HTTP during local development: %s", (baseUrl) => {
    expect(normalizeProviderBaseUrl(baseUrl, "https://unused.example", { nodeEnv: "development" }))
      .toBe(baseUrl.replace(/\/+$/, ""));
  });

  it("rejects loopback HTTP in production", () => {
    expect(() =>
      normalizeProviderBaseUrl("http://localhost:11434/v1", "https://unused.example", {
        nodeEnv: "production",
      }),
    ).toThrow(ProviderBaseUrlError);
  });

  it("provides a non-throwing check for capability and registry gates", () => {
    expect(isSafeProviderBaseUrl(undefined, "https://api.example/v1", { nodeEnv: "production" }))
      .toBe(true);
    expect(isSafeProviderBaseUrl("http://api.example/v1", "https://unused.example"))
      .toBe(false);
  });
});
