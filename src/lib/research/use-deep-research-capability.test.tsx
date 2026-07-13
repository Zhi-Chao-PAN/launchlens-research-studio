// @vitest-environment jsdom

import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useDeepResearchCapability } from "./use-deep-research-capability";

const deepCapability = {
  mode: "deep",
  id: "deep",
  label: "Deep Research",
  description: "Evidence-first research",
  depthLabel: "Multi-pass evidence audit",
  availability: "available",
  checkedAt: "2026-07-13T00:00:00.000Z",
  requirements: [
    {
      id: "durable_state",
      ready: true,
      label: "Durable state",
      detail: "Redis is reachable.",
    },
  ],
  blockers: [],
  capabilityNotice: "Ready",
  expectedDurationSec: { min: 600, max: 1200 },
  expectedDurationLabel: "10-20 min target",
  validationPasses: 3,
  retrieval: "required",
  requiresAsyncExecution: true,
  maxSynchronousDurationSec: 300,
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useDeepResearchCapability", () => {
  it("accepts a valid server capability response", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ modes: { deep: deepCapability } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useDeepResearchCapability());
    expect(result.current.isLoading).toBe(true);

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.capability?.availability).toBe("available");
    expect(result.current.error).toBeNull();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/research/capabilities",
      expect.objectContaining({ cache: "no-store", credentials: "same-origin" }),
    );
  });

  it("fails closed when the endpoint returns an invalid shape", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ modes: { deep: { availability: "available" } } }),
    }));

    const { result } = renderHook(() => useDeepResearchCapability());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.capability).toBeNull();
    expect(result.current.error).toMatch(/invalid response/i);
  });
});
