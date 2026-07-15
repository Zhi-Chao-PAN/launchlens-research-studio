import { describe, expect, it, vi } from "vitest";
import { HttpDeepWakeDispatcher } from "./dispatcher";

describe("HttpDeepWakeDispatcher", () => {
  it("sends an authenticated, redirect-safe fast wake", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 202 }));
    const dispatcher = new HttpDeepWakeDispatcher({
      origin: "https://studio.example/path",
      secret: "worker-secret-at-least-24-characters",
      protectionBypassSecret: "vercel-automation-bypass-secret",
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
          "x-vercel-protection-bypass": "vercel-automation-bypass-secret",
        }),
      }),
    );
  });

  it("omits the Vercel protection bypass header when it is not configured", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 202 }));
    const dispatcher = new HttpDeepWakeDispatcher({
      origin: "https://studio.example",
      secret: "worker-secret-at-least-24-characters",
      fetchImpl: fetchImpl as typeof fetch,
    });

    await dispatcher.dispatch("abc123");

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://studio.example/api/internal/deep-research/continue",
      expect.objectContaining({
        headers: expect.not.objectContaining({
          "x-vercel-protection-bypass": expect.anything(),
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
      protectionBypassSecret: "must-not-appear-in-errors",
      fetchImpl: vi.fn(async () => new Response(null, { status: 503 })) as unknown as typeof fetch,
    });
    const wakeError = await dispatcher.dispatch("abc123").catch((error: unknown) => error);
    expect(wakeError).toBeInstanceOf(Error);
    expect((wakeError as Error).message).toContain("HTTP 503");
    expect((wakeError as Error).message).not.toContain("must-not-appear-in-errors");
  });
});
