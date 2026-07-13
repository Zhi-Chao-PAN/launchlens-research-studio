import { describe, expect, it, vi } from "vitest";
import { HttpDeepWakeDispatcher } from "./dispatcher";

describe("HttpDeepWakeDispatcher", () => {
  it("sends an authenticated, redirect-safe fast wake", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 202 }));
    const dispatcher = new HttpDeepWakeDispatcher({
      origin: "https://studio.example/path",
      secret: "worker-secret-at-least-24-characters",
      fetchImpl: fetchImpl as typeof fetch,
    });
    await dispatcher.dispatch("abc123");
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://studio.example/api/internal/deep-research/continue",
      expect.objectContaining({
        method: "POST",
        redirect: "error",
        cache: "no-store",
        body: '{"sessionId":"abc123"}',
        headers: expect.objectContaining({
          Authorization: "Bearer worker-secret-at-least-24-characters",
          "x-launchlens-deep-worker-secret": "worker-secret-at-least-24-characters",
        }),
      }),
    );
  });

  it("rejects unsafe configuration and non-success wakes", async () => {
    expect(() => new HttpDeepWakeDispatcher({ origin: "ftp://example.com", secret: "x".repeat(24) }))
      .toThrow("safe HTTP(S)");
    expect(() => new HttpDeepWakeDispatcher({ origin: "https://example.com", secret: "short" }))
      .toThrow("at least 24");
    expect(() => new HttpDeepWakeDispatcher({ origin: "http://example.com", secret: "x".repeat(24) }))
      .toThrow("must use HTTPS");
    const dispatcher = new HttpDeepWakeDispatcher({
      origin: "https://studio.example",
      secret: "x".repeat(24),
      fetchImpl: vi.fn(async () => new Response(null, { status: 503 })) as unknown as typeof fetch,
    });
    await expect(dispatcher.dispatch("abc123")).rejects.toThrow("HTTP 503");
  });
});
