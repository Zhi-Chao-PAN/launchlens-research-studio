// Citation URL allowlisting against the retrieved-source set.
//
// A URL match only establishes that the model cited a source made available
// during retrieval. It does not establish that the cited claim is factually
// supported by that source.

import type { SourceCitation } from "@/lib/schema/research-schema";
import { canonicalizeSafeExternalUrl } from "@/lib/security/safe-external-url";
import type { RetrievedSource } from "./retrieval.types";

export type CitationAllowlistPolicy = "compatible" | "strict";

export interface CitationAllowlistOptions {
  /**
   * `compatible` preserves the original permissive behavior. Callers that
   * require evidence-grounded citations must opt in with `strict`.
   */
  policy?: CitationAllowlistPolicy;
}

/** @deprecated Prefer `CitationAllowlistResult`; URL matching is not fact verification. */
export interface VerificationResult {
  /** Citations retained after policy checks and deduplication. */
  citations: SourceCitation[];
  /** Total input citations before policy checks or deduplication. */
  total: number;
  /**
   * Legacy counter retained for compatibility. It is the number rejected by
   * URL allowlisting, not a statement about factual verification.
   */
  unverifiable: number;
}

export interface CitationAllowlistResult extends VerificationResult {
  /** Inputs accepted by the policy, before deduplication. */
  accepted: number;
  /** Inputs rejected by the policy. */
  rejected: number;
  /** Inputs rejected or tolerated because no non-empty URL was supplied. */
  missingUrl: number;
  /**
   * Model-emitted citation id -> canonical retrieved-source id. Populated by
   * strict mode so callers can reconcile nested citation-id references.
   */
  idRemap: Record<string, string>;
}

/**
 * Filter an LLM-emitted citation list against a retrieved-source set.
 *
 * The default `compatible` policy preserves the original behavior:
 *
 * - an empty retrieved set is a no-op apart from legacy deduplication;
 * - URL-less citations are retained;
 * - URL comparison is exact after rejecting unsafe external-link forms;
 * - retained safe URLs are canonicalized and unsafe URLs become non-clickable.
 *
 * The explicit `strict` policy is fail-closed. It rejects citations when the
 * retrieved set is empty, when a citation has no usable HTTP(S) URL, or when
 * its normalized URL is absent from the retrieved set. Accepted citations use
 * the retrieved source's id, title, URL, snippet, access timestamp, and
 * conservative source confidence.
 */
export function filterCitationsAgainstRetrieved(
  citations: readonly SourceCitation[],
  retrieved: readonly RetrievedSource[],
  options: CitationAllowlistOptions = {},
): CitationAllowlistResult {
  if ((options.policy ?? "compatible") === "strict") {
    return applyStrictAllowlist(citations, retrieved);
  }

  return applyCompatibleFilter(citations, retrieved);
}

function applyCompatibleFilter(
  citations: readonly SourceCitation[],
  retrieved: readonly RetrievedSource[],
): CitationAllowlistResult {
  const total = citations.length;
  const missingUrl = citations.filter((citation) => !citation.url?.trim()).length;
  const sanitized = citations.map((citation) => {
    const safeUrl = canonicalizeSafeExternalUrl(citation.url);
    return {
      citation: withCanonicalUrl(citation, safeUrl),
      rawUrl: typeof citation.url === "string" ? citation.url.trim() : "",
      safeUrl,
    };
  });

  if (retrieved.length === 0) {
    return createResult({
      citations: dedupeCitations(sanitized.map((entry) => entry.citation)),
      total,
      accepted: total,
      rejected: 0,
      missingUrl,
      idRemap: createIdRemap(),
    });
  }

  // Compatible mode intentionally preserves exact-match legacy semantics.
  // Validation still runs first so unsafe URLs never reach rendered output.
  const retrievedUrls = new Set(
    retrieved
      .map((source) => source.url?.trim())
      .filter((url): url is string => Boolean(url && canonicalizeSafeExternalUrl(url))),
  );
  const allowed: SourceCitation[] = [];
  let rejected = 0;

  for (const entry of sanitized) {
    if (!entry.rawUrl || !entry.safeUrl) {
      allowed.push(entry.citation);
    } else if (retrievedUrls.has(entry.rawUrl)) {
      allowed.push(entry.citation);
    } else {
      rejected++;
    }
  }

  return createResult({
    citations: dedupeCitations(allowed),
    total,
    accepted: total - rejected,
    rejected,
    missingUrl,
    idRemap: createIdRemap(),
  });
}

function applyStrictAllowlist(
  citations: readonly SourceCitation[],
  retrieved: readonly RetrievedSource[],
): CitationAllowlistResult {
  const retrievedByUrl = indexRetrievedSources(retrieved);
  const conflictingIds = findConflictingCitationIds(citations);
  const allowed: SourceCitation[] = [];
  const idRemap = createIdRemap();
  let accepted = 0;
  let rejected = 0;
  let missingUrl = 0;

  for (const citation of citations) {
    const rawUrl = citation.url?.trim();
    if (!rawUrl) {
      missingUrl++;
    }

    if (conflictingIds.has(citation.id)) {
      rejected++;
      continue;
    }

    if (!rawUrl) {
      rejected++;
      continue;
    }

    const normalizedUrl = canonicalizeSafeExternalUrl(rawUrl);
    const match = normalizedUrl ? retrievedByUrl.get(normalizedUrl) : undefined;
    if (!match) {
      rejected++;
      continue;
    }

    accepted++;
    idRemap[citation.id] = match.source.id;
    allowed.push({
      ...citation,
      id: match.source.id,
      title: match.source.title,
      url: match.canonicalUrl,
      snippet: match.source.snippet,
      accessedAt: match.source.accessedAt,
      confidence: match.source.confidence,
    });
  }

  return createResult({
    citations: dedupeCitations(allowed),
    total: citations.length,
    accepted,
    rejected,
    missingUrl,
    idRemap,
  });
}

function createResult(
  result: Omit<CitationAllowlistResult, "unverifiable">,
): CitationAllowlistResult {
  return { ...result, unverifiable: result.rejected };
}

function indexRetrievedSources(
  retrieved: readonly RetrievedSource[],
): Map<string, { source: RetrievedSource; canonicalUrl: string }> {
  const byUrl = new Map<string, { source: RetrievedSource; canonicalUrl: string }>();

  for (const source of retrieved) {
    const normalizedUrl = canonicalizeSafeExternalUrl(source.url);
    if (normalizedUrl && !byUrl.has(normalizedUrl)) {
      // Preserve retrieval order when two results normalize to the same URL.
      byUrl.set(normalizedUrl, { source, canonicalUrl: normalizedUrl });
    }
  }

  return byUrl;
}

function findConflictingCitationIds(
  citations: readonly SourceCitation[],
): Set<string> {
  const targetsById = new Map<string, Set<string>>();
  for (const citation of citations) {
    const rawUrl = citation.url?.trim() ?? "";
    const target = canonicalizeSafeExternalUrl(rawUrl) ?? `unsafe:${rawUrl || "(missing)"}`;
    const targets = targetsById.get(citation.id) ?? new Set<string>();
    targets.add(target);
    targetsById.set(citation.id, targets);
  }

  return new Set(
    [...targetsById.entries()]
      .filter(([, targets]) => targets.size > 1)
      .map(([id]) => id),
  );
}

function withCanonicalUrl(
  citation: SourceCitation,
  canonicalUrl: string | undefined,
): SourceCitation {
  const copy = { ...citation };
  delete copy.url;
  if (canonicalUrl) copy.url = canonicalUrl;
  return copy;
}

function createIdRemap(): Record<string, string> {
  // Citation ids are model output, so a null prototype prevents special keys
  // such as `__proto__` from mutating the result object's prototype.
  return Object.create(null) as Record<string, string>;
}

function dedupeCitations(citations: SourceCitation[]): SourceCitation[] {
  const seen = new Set<string>();
  const out: SourceCitation[] = [];
  for (const citation of citations) {
    const key = citation.url || citation.id;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(citation);
  }
  return out;
}
