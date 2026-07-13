// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { selectRetrievalProvider, probeRetrievalProvider, resetRetrievalProviderCache } from "./retrieval-registry";

const ORIGINAL_OVERRIDE = process.env.LAUNCHLENS_SEARCH_PROVIDER;
const ORIGINAL_KEY = process.env.TAVILY_API_KEY;
const ORIGINAL_BASE = process.env.TAVILY_BASE_URL;

function setEnv(override?: string, key?: string, base?: string) {
  if (override === undefined) delete process.env.LAUNCHLENS_SEARCH_PROVIDER;
  else process.env.LAUNCHLENS_SEARCH_PROVIDER = override;
  if (key === undefined) delete process.env.TAVILY_API_KEY;
  else process.env.TAVILY_API_KEY = key;
  if (base === undefined) delete process.env.TAVILY_BASE_URL;
  else process.env.TAVILY_BASE_URL = base;
  resetRetrievalProviderCache();
}

afterEach(() => {
  setEnv(ORIGINAL_OVERRIDE, ORIGINAL_KEY, ORIGINAL_BASE);
});

describe("selectRetrievalProvider (R215)", () => {
  it("returns mock when nothing is configured", () => {
    setEnv(undefined, undefined);
    const p = selectRetrievalProvider();
    expect(p.id).toBe("mock-retrieval");
    expect(p.isMock).toBe(true);
  });

  it("returns mock when LAUNCHLENS_SEARCH_PROVIDER=mock is set explicitly", () => {
    setEnv("mock", "tvly-should-be-ignored");
    const p = selectRetrievalProvider();
    expect(p.id).toBe("mock-retrieval");
  });

  it("returns tavily when override is set and key is present", () => {
    setEnv("tavily", "tvly-real-key");
    const p = selectRetrievalProvider();
    expect(p.id).toBe("tavily");
    expect(p.isMock).toBe(false);
  });

  it("auto-picks tavily when key is present with no override", () => {
    setEnv(undefined, "tvly-auto");
    const p = selectRetrievalProvider();
    expect(p.id).toBe("tavily");
  });

  it("falls back to mock when override=tavily but no key (with warning)", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      setEnv("tavily", undefined);
      const p = selectRetrievalProvider();
      expect(p.id).toBe("mock-retrieval");
      expect(warnSpy).toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("caches the chosen provider between calls", () => {
    setEnv(undefined, undefined);
    const a = selectRetrievalProvider();
    const b = selectRetrievalProvider();
    expect(a).toBe(b);
  });

  it("resetRetrievalProviderCache forces re-selection", () => {
    setEnv(undefined, undefined);
    const a = selectRetrievalProvider();
    resetRetrievalProviderCache();
    setEnv("tavily", "tvly-real");
    const b = selectRetrievalProvider();
    expect(b.id).toBe("tavily");
    expect(a).not.toBe(b);
  });
});

describe("probeRetrievalProvider (R215)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("reports retrieval as not configured when the mock provider is selected", async () => {
    setEnv(undefined, undefined);
    const result = await probeRetrievalProvider();
    expect(result.ok).toBe(false);
    expect(result.providerId).toBe("mock-retrieval");
    expect(result.reason).toBe("not_configured");
    expect(typeof result.latencyMs).toBe("number");
  });
});
