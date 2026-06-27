// R215: mock retrieval provider. Returns an empty array immediately so the
// engine falls back to LLM-only generation. Used when no real
// retrieval-provider env var is set, and as a safety net inside the
// selectRetrievalProvider() registry.

import type { RetrievalProvider, RetrievalQuery, RetrievedSource } from "./retrieval.types";

export const mockRetrievalProvider: RetrievalProvider = {
  id: "mock-retrieval",
  displayName: "Mock Retrieval",
  isMock: true,
  async search(_opts: RetrievalQuery): Promise<RetrievedSource[]> {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    void _opts;
    return [];
  },
};