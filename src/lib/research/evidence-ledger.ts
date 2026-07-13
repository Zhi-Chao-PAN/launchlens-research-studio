import type { RetrievedSource } from "@/lib/providers/retrieval.types";
import { filterCitationsAgainstRetrieved } from "@/lib/providers/retrieval-validate";
import { canonicalizeSafeExternalUrl } from "@/lib/security/safe-external-url";
import {
  RESEARCH_AGENTS,
  type AgentEvidenceLedgerEntry,
  type AgentId,
  type AgentOutput,
  type EvidenceAllowlistStats,
  type EvidenceLedger,
  type ResearchSession,
  type SourceCitation,
} from "@/lib/schema/research-schema";

const ALL_AGENTS: readonly AgentId[] = [...RESEARCH_AGENTS, "synthesis"];
const FOCUSED_QUERY_MAX_CHARS = 280;

const AGENT_RETRIEVAL_FOCUS: Record<Exclude<AgentId, "synthesis">, string> = {
  "market-sizer": "market size TAM SAM SOM CAGR forecasts industry reports",
  "competitor-analyst": "competitors alternatives product features positioning market share",
  "pain-detective": "user reviews complaints forum discussions unmet needs",
  "pricing-scout": "pricing pages plans tiers willingness to pay benchmarks",
  "channel-scout": "customer acquisition channels communities SEO paid media partnerships",
};

export function createEvidenceLedger(now: string = new Date().toISOString()): EvidenceLedger {
  const agents: EvidenceLedger["agents"] = {};
  for (const agentId of ALL_AGENTS) {
    agents[agentId] = createAgentEvidenceEntry(agentId, now);
  }
  return { version: 1, agents };
}

export function ensureEvidenceLedger(session: ResearchSession): EvidenceLedger {
  if (!session.evidence || session.evidence.version !== 1) {
    session.evidence = createEvidenceLedger(session.updatedAt || new Date().toISOString());
    return session.evidence;
  }

  for (const agentId of ALL_AGENTS) {
    if (!session.evidence.agents[agentId]) {
      session.evidence.agents[agentId] = createAgentEvidenceEntry(
        agentId,
        session.updatedAt || new Date().toISOString(),
      );
    }
  }
  return session.evidence;
}

export function createAgentEvidenceEntry(
  agentId: AgentId,
  now: string = new Date().toISOString(),
): AgentEvidenceLedgerEntry {
  return {
    agentId,
    retrieval: {
      status: "not_requested",
      sourceOrigin: "none",
      sourceCount: 0,
      sources: [],
    },
    allowlist: emptyAllowlistStats(),
    grounding: "ungrounded",
    updatedAt: now,
  };
}

export function emptyAllowlistStats(): EvidenceAllowlistStats {
  return {
    policy: "compatible",
    total: 0,
    matched: 0,
    rejected: 0,
    missingUrl: 0,
    retained: 0,
  };
}

/** Build a focused search query without changing the user's original query. */
export function buildFocusedRetrievalQuery(
  query: string,
  agentId: Exclude<AgentId, "synthesis">,
): string {
  const focus = AGENT_RETRIEVAL_FOCUS[agentId];
  const base = query.replace(/\s+/g, " ").trim();
  if (!base) return focus;

  // Search providers expect a concise query, not the user's full research
  // brief. Put the specialist intent first so truncation cannot discard it.
  return truncateAtWordBoundary(
    `${focus}. Product context: ${base}`,
    FOCUSED_QUERY_MAX_CHARS,
  );
}

function truncateAtWordBoundary(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  const clipped = value.slice(0, maxChars);
  const boundary = clipped.lastIndexOf(" ");
  return (boundary >= Math.floor(maxChars * 0.75) ? clipped.slice(0, boundary) : clipped).trim();
}

/**
 * Treat retrieval output as untrusted boundary data, retain only usable
 * HTTP(S) sources, and assign a URL-derived canonical id shared by agents.
 */
export function canonicalizeRetrievedSources(
  input: readonly RetrievedSource[],
  agentId: Exclude<AgentId, "synthesis">,
  now: string = new Date().toISOString(),
): RetrievedSource[] {
  const output: RetrievedSource[] = [];
  const seenUrls = new Set<string>();

  for (const candidate of input) {
    if (!candidate || typeof candidate !== "object") continue;
    const rawUrl = typeof candidate.url === "string" ? candidate.url.trim() : "";
    const normalizedUrl = canonicalizeSafeExternalUrl(rawUrl);
    if (!normalizedUrl || seenUrls.has(normalizedUrl)) continue;
    seenUrls.add(normalizedUrl);

    const title = typeof candidate.title === "string" && candidate.title.trim()
      ? candidate.title.trim().slice(0, 300)
      : new URL(normalizedUrl).hostname;
    const snippet = typeof candidate.snippet === "string"
      ? candidate.snippet.trim().slice(0, 1200)
      : "";
    const accessedAt = isIsoLike(candidate.accessedAt) ? candidate.accessedAt : now;
    const retrievedAt = isIsoLike(candidate.retrievedAt) ? candidate.retrievedAt : accessedAt;
    const confidence =
      candidate.confidence === "low" ||
      candidate.confidence === "medium" ||
      candidate.confidence === "high"
        ? candidate.confidence
        : "medium";
    const score = typeof candidate.score === "number" && Number.isFinite(candidate.score)
      ? Math.max(0, Math.min(1, candidate.score))
      : undefined;

    output.push({
      id: canonicalSourceId(normalizedUrl),
      title,
      url: normalizedUrl,
      snippet,
      accessedAt,
      confidence,
      agent: agentId,
      retrievedAt,
      ...(score === undefined ? {} : { score }),
    });
  }

  return output;
}

/** Dedupe only sources retained by specialists' strict citation allowlists. */
export function specialistAllowlistedSourceUnion(session: ResearchSession): RetrievedSource[] {
  const output: RetrievedSource[] = [];
  const seen = new Set<string>();

  for (const agentId of RESEARCH_AGENTS) {
    const entry = session.evidence?.agents[agentId];
    const agentOutput = session.agents[agentId]?.output;
    if (
      !entry ||
      entry.retrieval.status !== "retrieved" ||
      entry.allowlist.policy !== "strict" ||
      entry.grounding !== "grounded" ||
      session.agents[agentId]?.degraded === true ||
      !agentOutput
    ) {
      continue;
    }

    const allowlistedIds = new Set(agentOutput.citations.map((citation) => citation.id));

    for (const source of entry.retrieval.sources) {
      if (!allowlistedIds.has(source.id)) continue;
      const normalizedUrl = canonicalizeSafeExternalUrl(source.url);
      if (!normalizedUrl || seen.has(normalizedUrl)) continue;
      seen.add(normalizedUrl);
      output.push({
        ...source,
        id: canonicalSourceId(normalizedUrl),
        url: normalizedUrl,
        retrievedAt: source.retrievedAt || source.accessedAt,
      });
    }
  }

  return output;
}

export function allowlistAgentOutput(
  output: AgentOutput,
  retrievedSources: readonly RetrievedSource[],
  policy: "compatible" | "strict",
): { output: AgentOutput; stats: EvidenceAllowlistStats } {
  const result = filterCitationsAgainstRetrieved(output.citations, retrievedSources, { policy });
  const agentId = output.agent;

  if (policy === "strict") {
    const citations = result.citations.map((citation) => ({ ...citation, agent: agentId }));
    const rewritten = rewriteCitationReferences(output, citations, result.idRemap, true);
    return {
      output: sanitizeNestedExternalUrls(rewritten, retrievedSources, true),
      stats: {
        policy,
        total: result.total,
        matched: result.accepted,
        rejected: result.rejected,
        missingUrl: result.missingUrl,
        retained: citations.length,
      },
    };
  }

  const idRemap = createIdRemap();
  const citations = result.citations.map((citation) => {
    const namespacedId = compatibleCitationId(agentId, citation);
    if (!(citation.id in idRemap)) idRemap[citation.id] = namespacedId;
    return { ...citation, id: namespacedId, agent: agentId };
  });

  return {
    output: sanitizeNestedExternalUrls(
      rewriteCitationReferences(output, citations, idRemap, false),
      retrievedSources,
      false,
    ),
    stats: {
      policy,
      total: result.total,
      matched: 0,
      rejected: 0,
      missingUrl: result.missingUrl,
      retained: citations.length,
    },
  };
}

function rewriteCitationReferences(
  output: AgentOutput,
  citations: SourceCitation[],
  idRemap: Record<string, string>,
  dropUnmatched: boolean,
): AgentOutput {
  const remap = (ids: string[]): string[] => {
    const mapped: string[] = [];
    for (const id of ids) {
      const next = idRemap[id];
      if (next) mapped.push(next);
      else if (!dropUnmatched) mapped.push(id);
    }
    return [...new Set(mapped)];
  };

  switch (output.agent) {
    case "market-sizer":
      return {
        ...output,
        marketSize: { ...output.marketSize, sources: remap(output.marketSize.sources) },
        citations,
      };
    case "competitor-analyst":
      return {
        ...output,
        competitors: output.competitors.map((competitor) => ({
          ...competitor,
          citations: remap(competitor.citations),
        })),
        citations,
      };
    case "pain-detective":
      return {
        ...output,
        painPoints: output.painPoints.map((painPoint) => ({
          ...painPoint,
          citations: remap(painPoint.citations),
        })),
        citations,
      };
    default:
      return { ...output, citations };
  }
}

function compatibleCitationId(agentId: AgentId, citation: SourceCitation): string {
  const normalizedUrl = canonicalizeSafeExternalUrl(citation.url);
  return `citation_${agentId}_${stableHash(normalizedUrl || citation.id)}`;
}

function canonicalSourceId(normalizedUrl: string): string {
  return `source_${stableHash(normalizedUrl)}`;
}

function stableHash(value: string): string {
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193) >>> 0;
    second = Math.imul(second ^ code, 0x85ebca6b) >>> 0;
  }
  return first.toString(36).padStart(7, "0") + second.toString(36).padStart(7, "0");
}

function sanitizeNestedExternalUrls(
  output: AgentOutput,
  retrievedSources: readonly RetrievedSource[],
  requireAllowlist: boolean,
): AgentOutput {
  const allowlistedUrls = new Set(
    retrievedSources
      .map((source) => canonicalizeSafeExternalUrl(source.url))
      .filter((url): url is string => Boolean(url)),
  );
  const sanitizeUrl = (rawUrl: unknown): string | undefined => {
    const canonicalUrl = canonicalizeSafeExternalUrl(rawUrl);
    if (!canonicalUrl) return undefined;
    if (requireAllowlist && !allowlistedUrls.has(canonicalUrl)) return undefined;
    return canonicalUrl;
  };

  switch (output.agent) {
    case "competitor-analyst":
      return {
        ...output,
        competitors: output.competitors.map((competitor) =>
          withOptionalSafeUrl(competitor, sanitizeUrl(competitor.url))),
      };
    case "channel-scout":
      return {
        ...output,
        communityHubs: output.communityHubs.map((hub) =>
          withOptionalSafeUrl(hub, sanitizeUrl(hub.url))),
      };
    default:
      return output;
  }
}

function withOptionalSafeUrl<T extends { url?: string }>(
  value: T,
  safeUrl: string | undefined,
): T {
  const copy = { ...value };
  delete copy.url;
  if (safeUrl) copy.url = safeUrl;
  return copy;
}

function isIsoLike(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && Number.isFinite(Date.parse(value));
}

function createIdRemap(): Record<string, string> {
  return Object.create(null) as Record<string, string>;
}
