// R215: citation URL verification against the retrieved-source set.
//
// When a RetrievalProvider is wired, the engine can compare the LLM's
// emitted citations to the URLs actually retrieved. This module exposes
// `filterCitationsAgainstRetrieved` which:
//
//   - keeps any citation whose URL was retrieved (or whose URL is missing,
//     leaving it as-is to avoid breaking real LLM outputs),
//   - optionally downgrades confidence to "low" for unverifiable URLs,
//   - deduplicates by URL.
//
// The validator in output-validator.ts does NOT call this directly — it
// only checks top-level shape. URL verification happens at the engine
// boundary where retrieval results are in scope.

import type { SourceCitation } from "@/lib/schema/research-schema";
import type { RetrievedSource } from "./retrieval.types";

export interface VerificationResult {
  /** Citations after filtering + dedup. */
  citations: SourceCitation[];
  /** Number of citations whose URL was not in the retrieved set. */
  unverifiable: number;
  /** Total inputs received (before filtering). */
  total: number;
}

/**
 * Filter an LLM-emitted citation list against a retrieved-source set.
 * If `retrieved` is empty, the function is a no-op (returns the input
 * unchanged, unverifiable: 0) — the engine never has retrieval available
 * before this round ships, so this stays a clean upgrade path.
 */
export function filterCitationsAgainstRetrieved(
  citations: readonly SourceCitation[],
  retrieved: readonly RetrievedSource[],
): VerificationResult {
  const total = citations.length;
  if (retrieved.length === 0) {
    return { citations: dedupeCitations([...citations]), unverifiable: 0, total };
  }

  const retrievedUrls = new Set(retrieved.map((r) => r.url).filter(Boolean));
  const out: SourceCitation[] = [];
  let unverifiable = 0;

  for (const c of citations) {
    if (!c.url || retrievedUrls.has(c.url)) {
      out.push(c);
    } else {
      // URL was fabricated by the LLM and not in the retrieved set.
      unverifiable++;
    }
  }

  return { citations: dedupeCitations(out), unverifiable, total };
}

function dedupeCitations(citations: SourceCitation[]): SourceCitation[] {
  const seen = new Set<string>();
  const out: SourceCitation[] = [];
  for (const c of citations) {
    const key = c.url || c.id;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}