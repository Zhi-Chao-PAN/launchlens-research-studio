// @vitest-environment jsdom

import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fetchWithCsrfStrict = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api/csrf-client", () => ({
  fetchWithCsrfStrict,
  RateLimitError: class RateLimitError extends Error {
    retryAfterMs = 1000;
  },
}));
vi.mock("@/lib/analytics/stage2-context", () => ({
  stage2HeadersFromCurrentUrl: () => ({}),
}));

import { useResearchStudio } from "./use-research-studio";

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  onerror: (() => void) | null = null;
  readonly url: string;
  closed = false;
  private readonly listeners = new Map<string, Set<EventListener>>();

  constructor(url: string | URL) {
    this.url = String(url);
    FakeEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
    const callback: EventListener = typeof listener === "function"
      ? listener
      : (event) => listener.handleEvent(event);
    const listeners = this.listeners.get(type) ?? new Set<EventListener>();
    listeners.add(callback);
    this.listeners.set(type, listeners);
  }

  emit(type: string, data: unknown) {
    const event = new MessageEvent(type, { data: JSON.stringify(data) });
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }

  fail() {
    this.onerror?.();
  }

  close() {
    this.closed = true;
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("useResearchStudio cancellation contract", () => {
  beforeEach(() => {
    fetchWithCsrfStrict.mockReset();
    FakeEventSource.instances = [];
    vi.stubGlobal("EventSource", FakeEventSource);
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  async function startRun() {
    fetchWithCsrfStrict.mockResolvedValueOnce(jsonResponse({
      sessionId: "session123",
      mode: "standard",
      createdAt: "2026-07-13T00:00:00.000Z",
      updatedAt: "2026-07-13T00:00:00.000Z",
    }, 201));
    const hook = renderHook(() => useResearchStudio());
    await act(async () => {
      await hook.result.current.startResearch("AI market", ["ai"]);
    });
    expect(hook.result.current.session.status).toBe("running");
    return hook;
  }

  it("stays cancelling until a validated API response and then hydrates the terminal snapshot", async () => {
    const hook = await startRun();
    let resolveCancel!: (response: Response) => void;
    const pendingResponse = new Promise<Response>((resolve) => {
      resolveCancel = resolve;
    });
    fetchWithCsrfStrict.mockReturnValueOnce(pendingResponse);
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({
      status: "cancelled",
      updatedAt: "2026-07-13T00:01:00.000Z",
      agents: {
        "market-sizer": {
          status: "done",
          progress: 100,
          hasOutput: true,
          output: { agent: "market-sizer", summary: "partial result" },
        },
      },
      evidence: { version: 1, agents: {} },
    }));

    let cancellation!: Promise<void>;
    await act(async () => {
      cancellation = hook.result.current.cancel();
      await Promise.resolve();
    });
    expect(hook.result.current.session.status).toBe("cancelling");

    await act(async () => {
      resolveCancel(jsonResponse({ ok: true, sessionId: "session123", status: "cancelled" }));
      await cancellation;
    });

    expect(hook.result.current.session.status).toBe("cancelled");
    expect(hook.result.current.session.agentOutputs["market-sizer"]).toMatchObject({
      summary: "partial result",
    });
    expect(hook.result.current.session.evidence).toEqual({ version: 1, agents: {} });
  });

  it("makes an invalid success response visible and resumes observation", async () => {
    const hook = await startRun();
    fetchWithCsrfStrict.mockResolvedValueOnce(jsonResponse({
      ok: false,
      sessionId: "session123",
      status: "cancelled",
    }));
    const connectionCount = FakeEventSource.instances.length;

    await act(async () => {
      await hook.result.current.cancel();
    });

    expect(hook.result.current.session.status).toBe("running");
    expect(hook.result.current.session.error).toMatch(/response was invalid/i);
    expect(FakeEventSource.instances).toHaveLength(connectionCount + 1);
  });

  it("hydrates an active Deep run after refresh and resumes observer-only SSE", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({
      id: "deep123",
      query: "AI procurement copilots for mid-market manufacturers",
      keywords: ["procurement", "manufacturing"],
      mode: "deep",
      status: "running",
      createdAt: "2026-07-14T00:00:00.000Z",
      updatedAt: "2026-07-14T00:04:00.000Z",
      agents: {
        "pricing-scout": {
          status: "done",
          progress: 100,
          hasOutput: true,
          output: { agent: "pricing-scout", summary: "Pricing evidence" },
        },
      },
      deepRun: {
        revision: 6,
        lifecycle: "active",
        currentWorkIndex: 2,
        totalWork: 10,
        currentWork: {
          id: "specialist:pain-detective",
          kind: "specialist",
          agentId: "pain-detective",
          status: "running",
          attempts: 1,
          maxAttempts: 3,
        },
        nextWakeAt: 2_000,
        totalAttempts: 3,
      },
    }));
    const hook = renderHook(() => useResearchStudio());

    await act(async () => {
      await hook.result.current.resumeResearch("deep123");
    });

    expect(fetch).toHaveBeenCalledWith(
      "/api/research/deep123",
      expect.objectContaining({ cache: "no-store", credentials: "same-origin" }),
    );
    expect(hook.result.current.session).toMatchObject({
      sessionId: "deep123",
      query: "AI procurement copilots for mid-market manufacturers",
      keywords: ["procurement", "manufacturing"],
      mode: "deep",
      status: "running",
      deepRun: { currentWorkIndex: 2, totalWork: 10 },
    });
    expect(hook.result.current.session.agentOutputs["pricing-scout"]).toMatchObject({
      summary: "Pricing evidence",
    });
    expect(FakeEventSource.instances).toHaveLength(1);
    expect(FakeEventSource.instances[0].url).toBe("/api/research/deep123/stream");

    await act(async () => {
      FakeEventSource.instances[0].emit("complete", {
        id: "deep123",
        query: "AI procurement copilots for mid-market manufacturers",
        keywords: ["procurement", "manufacturing"],
        mode: "deep",
        status: "completed",
        updatedAt: "2026-07-14T00:14:00.000Z",
        agents: {
          synthesis: {
            status: "done",
            progress: 100,
            hasOutput: true,
            output: { agent: "synthesis", summary: "Final grounded brief" },
          },
        },
        deepRun: {
          revision: 20,
          lifecycle: "completed",
          currentWorkIndex: 10,
          totalWork: 10,
          currentWork: null,
          nextWakeAt: 3_000,
          totalAttempts: 10,
        },
      });
    });

    expect(hook.result.current.session.status).toBe("completed");
    expect(hook.result.current.session.deepRun).toMatchObject({
      lifecycle: "completed",
      currentWorkIndex: 10,
    });
    expect(hook.result.current.session.agentOutputs.synthesis).toMatchObject({
      summary: "Final grounded brief",
    });
    expect(FakeEventSource.instances[0].closed).toBe(true);
  });

  it("restores a terminal Deep snapshot without opening another stream", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({
      id: "deepdone",
      query: "Completed durable research",
      keywords: ["durable"],
      mode: "deep",
      status: "completed",
      createdAt: "2026-07-14T00:00:00.000Z",
      updatedAt: "2026-07-14T00:12:00.000Z",
      agents: {
        synthesis: {
          status: "done",
          progress: 100,
          hasOutput: true,
          output: { agent: "synthesis", summary: "Recovered report" },
        },
      },
      deepRun: {
        revision: 20,
        lifecycle: "completed",
        currentWorkIndex: 10,
        totalWork: 10,
        currentWork: null,
        nextWakeAt: 3_000,
        totalAttempts: 10,
      },
    }));
    const hook = renderHook(() => useResearchStudio());

    await act(async () => {
      await hook.result.current.resumeResearch("deepdone");
    });

    expect(hook.result.current.session).toMatchObject({
      sessionId: "deepdone",
      query: "Completed durable research",
      mode: "deep",
      status: "completed",
      deepRun: { lifecycle: "completed", currentWorkIndex: 10 },
    });
    expect(hook.result.current.session.agentOutputs.synthesis).toMatchObject({
      summary: "Recovered report",
    });
    expect(FakeEventSource.instances).toHaveLength(0);
  });

  it("closes each failed stream, accumulates reconnect failures, and terminalizes a polling 410", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);
    const hook = await startRun();

    const failAndAdvanceToReconnect = async (index: number, reconnectDelayMs: number) => {
      act(() => FakeEventSource.instances[index].fail());
      expect(FakeEventSource.instances[index].closed).toBe(true);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100 + reconnectDelayMs);
      });
    };

    await failAndAdvanceToReconnect(0, 2_000);
    expect(FakeEventSource.instances[1].url).toBe("/api/research/session123/stream?reconnect=1");
    await failAndAdvanceToReconnect(1, 4_000);
    await failAndAdvanceToReconnect(2, 8_000);

    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ error: "Gone" }, 410));
    act(() => FakeEventSource.instances[3].fail());
    expect(FakeEventSource.instances[3].closed).toBe(true);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(hook.result.current.session).toMatchObject({
      status: "error",
      pollingIntervalMs: null,
    });
    expect(hook.result.current.session.error).toMatch(/expired/i);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(FakeEventSource.instances).toHaveLength(4);
  });

  it("stops fallback polling as soon as an SSE probe proves the stream is healthy", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);
    vi.mocked(fetch).mockImplementation(async () => jsonResponse({
      id: "session123",
      status: "running",
      updatedAt: "2026-07-14T00:05:00.000Z",
      agents: {},
    }));
    const hook = await startRun();

    const failAndAdvanceToReconnect = async (index: number, reconnectDelayMs: number) => {
      act(() => FakeEventSource.instances[index].fail());
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100 + reconnectDelayMs);
      });
    };

    await failAndAdvanceToReconnect(0, 2_000);
    await failAndAdvanceToReconnect(1, 4_000);
    await failAndAdvanceToReconnect(2, 8_000);
    act(() => FakeEventSource.instances[3].fail());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
      await vi.advanceTimersByTimeAsync(2_000 + 4_000 + 8_000 + 16_000);
    });

    expect(fetch).toHaveBeenCalledTimes(5);
    expect(FakeEventSource.instances).toHaveLength(5);
    const probe = FakeEventSource.instances[4];
    expect(probe.url).toBe("/api/research/session123/stream");

    act(() => probe.emit("state", { status: "running", agents: {} }));
    expect(probe.closed).toBe(true);
    expect(FakeEventSource.instances).toHaveLength(6);
    expect(hook.result.current.session.pollingIntervalMs).toBeNull();

    const fetchCountAtRecovery = vi.mocked(fetch).mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(fetch).toHaveBeenCalledTimes(fetchCountAtRecovery);
  });

  it("treats an expired terminal SSE event as a final, user-actionable error", async () => {
    const hook = await startRun();
    const stream = FakeEventSource.instances[0];

    act(() => stream.emit("terminal", { reason: "expired" }));

    expect(hook.result.current.session).toMatchObject({
      status: "error",
      reconnectUntilMs: null,
      pollingIntervalMs: null,
    });
    expect(hook.result.current.session.error).toMatch(/expired.*start a new research/i);
    expect(stream.closed).toBe(true);
  });
});
