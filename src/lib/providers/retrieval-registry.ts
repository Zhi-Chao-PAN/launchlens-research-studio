// R215: retrieval provider registry. Selects a RetrievalProvider based on
// environment configuration, mirroring the LLM-side provider-registry.ts.
//
// Selection rules:
//   1. If LAUNCHLENS_SEARCH_PROVIDER=mock, force mock.
//   2. If LAUNCHLENS_SEARCH_PROVIDER=tavily and TAVILY_API_KEY is set, use
//      Tavily.
//   3. If TAVILY_API_KEY is set (and no override), auto-pick Tavily.
//   4. Otherwise mock.
//
// Today only Tavily is wired; future adapters plug into the same switch.

import type { RetrievalProvider } from "./retrieval.types";
import { mockRetrievalProvider } from "./mock-retrieval-provider";
import { TavilyRetrievalProvider } from "./tavily-retrieval-provider";
import { isSafeProviderBaseUrl } from "@/lib/security/provider-base-url";

const DEFAULT_TAVILY_BASE_URL = "https://api.tavily.com";

let cached: RetrievalProvider | null = null;

export function selectRetrievalProvider(): RetrievalProvider {
  if (cached) return cached;

  // Read env on every invocation (not module-load) so test setups that
  // mutate process.env between cases see the updated values, and so a
  // runtime config change takes effect after resetRetrievalProviderCache().
  const apiKey = process.env.TAVILY_API_KEY || "";
  const baseUrl = process.env.TAVILY_BASE_URL || "";
  const override = (process.env.LAUNCHLENS_SEARCH_PROVIDER || "").toLowerCase();

  if (override === "mock") {
    cached = mockRetrievalProvider;
    return cached;
  }

  if (override === "tavily" || (!override && apiKey)) {
    if (apiKey) {
      if (!isSafeProviderBaseUrl(baseUrl || undefined, DEFAULT_TAVILY_BASE_URL)) {
        console.warn("[retrieval] TAVILY_BASE_URL is unsafe; using mock retrieval.");
        cached = mockRetrievalProvider;
        return cached;
      }
      cached = new TavilyRetrievalProvider({
        apiKey,
        baseUrl: baseUrl || undefined,
      });
      return cached;
    }
    // Override said Tavily but no key — fall through to mock with a
    // console warning so misconfiguration is visible at startup.
    if (override === "tavily") {
      console.warn(
        "[retrieval] LAUNCHLENS_SEARCH_PROVIDER=tavily but TAVILY_API_KEY is unset; using mock retrieval.",
      );
    }
  }

  cached = mockRetrievalProvider;
  return cached;
}

/**
 * Reset the cached provider. Tests use this when they mutate
 * process.env between cases so the next selectRetrievalProvider() picks
 * up the new configuration.
 */
export function resetRetrievalProviderCache(): void {
  cached = null;
}

/** Probe whether the configured retrieval provider is reachable.
 *  Mirrors /api/provider/test for retrieval so the UI can show a "Search
 *  connected" pill without running a full research session. Returns
 *  `{ ok, latencyMs, reason }` rather than throwing. */
export async function probeRetrievalProvider(): Promise<{
  ok: boolean;
  providerId: string;
  latencyMs: number;
  reason?: string;
}> {
  const provider = selectRetrievalProvider();
  const start = Date.now();

  if (provider.isMock) {
    return {
      ok: false,
      providerId: provider.id,
      latencyMs: Date.now() - start,
      reason: "not_configured",
    };
  }

  try {
    const sources = await provider.search({ query: "ping", maxResults: 1 });

    if (sources.length === 0) {
      return {
        ok: false,
        providerId: provider.id,
        latencyMs: Date.now() - start,
        reason: "empty_response",
      };
    }

    return {
      ok: true,
      providerId: provider.id,
      latencyMs: Date.now() - start,
    };
  } catch (e) {
    return {
      ok: false,
      providerId: provider.id,
      latencyMs: Date.now() - start,
      reason: e instanceof Error ? e.message : String(e),
    };
  }
}
