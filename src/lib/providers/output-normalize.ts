/**
 * Defensive normalization layer that sits between `validateAgentOutput` and
 * the UI renderer. Real LLM output frequently returns structurally valid
 * but *incomplete* JSON: arrays omitted, nested fields set to undefined,
 * enum-like values that don't match the schema, numbers that are NaN, etc.
 * The validator only checks top-level field presence (round 209 fix) and
 * a couple of deep checks, so without this layer the UI receives objects
 * with missing sub-fields and crashes on `undefined.toFixed()`,
 * `config[undefined].bg`, or `arr.length` on `undefined`.
 *
 * Strategy: fill in safe defaults for any field the UI reads, coerce
 * enum-like fields to one of the allowed values, and guarantee every
 * array the UI iterates is a real array. The mock provider returns
 * already-complete data so this is a no-op for the demo path.
 *
 * This module mutates a shallow copy of the validated object — providers
 * should pass the result of `validateAgentOutput` and use the returned
 * normalized object instead.
 */
import type { AgentOutput } from "@/lib/schema/research-schema";
import type { AgentId } from "@/lib/schema/research-schema";
import type { ConfidenceLevel } from "@/lib/schema/research-schema";
import { canonicalizeSafeExternalUrl } from "@/lib/security/safe-external-url";

const VALID_CONFIDENCE: ConfidenceLevel[] = ["low", "medium", "high"];

function asString(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

function firstNonEmptyString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim() !== "") return value.trim();
  }
  return "";
}

function truncateForTitle(value: string): string {
  const clean = value.replace(/\s+/g, " ").trim();
  if (clean.length <= 120) return clean;
  return clean.slice(0, 117).trimEnd() + "...";
}

function asNumber(v: unknown, fallback = 0): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function asArray<T = unknown>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

/**
 * R214: coerce every element of an array to a string. Real LLMs sometimes
 * smuggle objects, numbers, or `null` into string-typed arrays; without this
 * the UI renders `[object Object]` or `null` verbatim. Plain `asArray<string>`
 * only checks Array.isArray — it doesn't touch the elements.
 */
function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => (typeof x === "string" ? x : x == null ? "" : String(x)));
}

function asObject<T = Record<string, unknown>>(v: unknown): T {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as T) : ({} as T);
}

function coerceConfidence(v: unknown): ConfidenceLevel {
  return VALID_CONFIDENCE.includes(v as ConfidenceLevel) ? (v as ConfidenceLevel) : "low";
}

function normalizeCitation(c: unknown, index = 0, agentId?: AgentId) {
  if (typeof c === "string") {
    const evidence = c.trim();
    return {
      id: "c" + (index + 1),
      title: evidence ? truncateForTitle(evidence) : "Untitled source",
      snippet: evidence,
      accessedAt: new Date().toISOString(),
      confidence: "low" as const,
      agent: agentId ?? "",
    };
  }
  const o = asObject<Record<string, unknown>>(c);
  const snippet = firstNonEmptyString(
    o.snippet,
    o.evidence,
    o.excerpt,
    o.quote,
    o.text,
    o.description,
    o.reasoning,
    o.source,
    o.title,
    o.url,
  );
  const title = firstNonEmptyString(o.title, o.name, o.source, snippet, o.url);
  const safeUrl = canonicalizeSafeExternalUrl(o.url);
  return {
    id: asString(o.id, "c" + (index + 1)),
    title: title ? truncateForTitle(title) : "Untitled source",
    snippet,
    accessedAt: asString(o.accessedAt, new Date().toISOString()),
    confidence: coerceConfidence(o.confidence),
    agent: asString(o.agent, agentId ?? ""),
    ...(safeUrl ? { url: safeUrl } : {}),
  };
}

function isFallbackCitationCandidate(item: unknown): boolean {
  if (item && typeof item === "object" && !Array.isArray(item)) return true;
  if (typeof item !== "string") return false;
  const clean = item.trim();
  if (clean.length === 0) return false;
  if (/^https?:\/\//i.test(clean)) return true;
  // Filter out bare citation ids such as "c1" or "source_2"; those are
  // pointers, not evidence snippets. A longer string is likely a source title,
  // URL + note, or reasoning sentence and can safely become a low-confidence
  // snippet.
  return clean.length >= 16;
}

function fallbackCitationItems(values: unknown[]): unknown[] {
  for (const value of values) {
    const candidates = asArray(value).filter(isFallbackCitationCandidate);
    if (candidates.length > 0) return candidates;
  }
  return [];
}

function citationItemsFromPainQuotes(value: unknown): unknown[] {
  return asArray(value).flatMap((painPoint) => {
    const p = asObject<Record<string, unknown>>(painPoint);
    return asArray(p.quotes)
      .map((quote) => {
        const q = asObject<Record<string, unknown>>(quote);
        const snippet = firstNonEmptyString(q.text, q.quote, q.snippet, q.evidence);
        if (!snippet) return null;
        return {
          title: firstNonEmptyString(q.source, p.pain, "Voice-of-customer quote"),
          snippet,
          confidence: "low" as const,
        };
      })
      .filter((item) => item !== null);
  });
}

function normalizeCitations(v: unknown, agentId: AgentId, ...fallbacks: unknown[]) {
  const primary = asArray(v);
  const items = primary.length > 0 ? primary : fallbackCitationItems(fallbacks);
  return items.map((c, index) => normalizeCitation(c, index, agentId));
}

/** Normalize the output of any agent. Always returns a valid object the
 *  UI can render without defensive checks. */
export function normalizeAgentOutput(agentId: AgentId, raw: unknown): AgentOutput {
  const o = asObject<Record<string, unknown>>(raw);
  o.agent = agentId;
  switch (agentId) {
    case "market-sizer":
      return normalizeMarketSizer(o) as AgentOutput;
    case "competitor-analyst":
      return normalizeCompetitorAnalyst(o) as AgentOutput;
    case "pain-detective":
      return normalizePainDetective(o) as AgentOutput;
    case "pricing-scout":
      return normalizePricingScout(o) as AgentOutput;
    case "channel-scout":
      return normalizeChannelScout(o) as AgentOutput;
    case "synthesis":
      return normalizeSynthesis(o) as AgentOutput;
  }
}

function normalizeMarketSizer(o: Record<string, unknown>) {
  const ms = asObject<Record<string, unknown>>(o.marketSize);
  return {
    agent: "market-sizer" as const,
    summary: asString(o.summary),
    marketSize: {
      // Clamp TAM/SAM/SOM to safe defaults (NaN, undefined → 0) and
      // guarantee SAM ≤ TAM, SOM ≤ SAM at the cost of the LLM's numbers
      // — preferable to a NaN rendering that hides the value entirely.
      tam: asNumber(ms.tam),
      sam: Math.min(asNumber(ms.sam), asNumber(ms.tam) || Number.POSITIVE_INFINITY),
      som: Math.min(asNumber(ms.som), asNumber(ms.sam) || Number.POSITIVE_INFINITY),
      currency: asString(ms.currency, "USD"),
      growthRate: asNumber(ms.growthRate),
      // R214: enum-coerce growthTrend (was a free-form string before, which
      // could yield "Growing" rendering or a missed colour branch).
      growthTrend:
        ms.growthTrend === "accelerating" || ms.growthTrend === "stable" || ms.growthTrend === "declining"
          ? ms.growthTrend
          : "stable",
      unit: asString(ms.unit, "USD"),
      sources: asStringArray(ms.sources),
      confidence: coerceConfidence(ms.confidence),
    },
    keyTrends: asArray(o.keyTrends).map((t) => {
      const x = asObject<Record<string, unknown>>(t);
      const impact = x.impact;
      return {
        trend: asString(x.trend),
        impact: impact === "positive" || impact === "negative" || impact === "neutral" ? impact : "neutral",
        evidence: asString(x.evidence),
      };
    }),
    targetSegments: asArray(o.targetSegments).map((s) => {
      const x = asObject<Record<string, unknown>>(s);
      return {
        name: asString(x.name, "Unnamed segment"),
        size: asNumber(x.size),
        description: asString(x.description),
      };
    }),
    citations: normalizeCitations(o.citations, "market-sizer", o.references, o.sources, ms.sources),
  };
}

function normalizeCompetitorAnalyst(o: Record<string, unknown>) {
  return {
    agent: "competitor-analyst" as const,
    summary: asString(o.summary),
    competitors: asArray(o.competitors).map((c) => {
      const x = asObject<Record<string, unknown>>(c);
      const pr = asObject<Record<string, unknown>>(x.pricing);
      const positioning = x.positioning;
      const safeUrl = canonicalizeSafeExternalUrl(x.url);
      return {
        id: asString(x.id, "comp"),
        name: asString(x.name, "Unnamed competitor"),
        tagline: asString(x.tagline),
        ...(safeUrl ? { url: safeUrl } : {}),
        strengths: asStringArray(x.strengths),
        weaknesses: asStringArray(x.weaknesses),
        pricing: {
          min: asNumber(pr.min),
          max: asNumber(pr.max),
          model: asString(pr.model, "unknown"),
          currency: asString(pr.currency, "USD"),
        },
        ...(typeof x.marketShare === "number" && Number.isFinite(x.marketShare)
          ? { marketShare: x.marketShare }
          : {}),
        positioning:
          positioning === "premium" || positioning === "mid-market" || positioning === "budget" || positioning === "niche"
            ? positioning
            : "niche",
        differentiation: asString(x.differentiation),
        citations: asArray<string>(x.citations),
      };
    }),
    competitiveMatrix: asArray(o.competitiveMatrix).map((m) => {
      const x = asObject<Record<string, unknown>>(m);
      return {
        dimension: asString(x.dimension, "Unnamed dimension"),
        players: asArray<Record<string, unknown>>(x.players).map((p) => ({
          name: asString(p.name, "Unknown"),
          score: asNumber(p.score),
        })),
      };
    }),
    gaps: asArray(o.gaps).map((g) => {
      const x = asObject<Record<string, unknown>>(g);
      const difficulty = x.difficulty;
      return {
        gap: asString(x.gap),
        opportunity: asString(x.opportunity),
        difficulty:
          difficulty === "low" || difficulty === "medium" || difficulty === "high" ? difficulty : "medium",
      };
    }),
    citations: normalizeCitations(o.citations, "competitor-analyst", o.references, o.sources),
  };
}

function normalizePainDetective(o: Record<string, unknown>) {
  return {
    agent: "pain-detective" as const,
    summary: asString(o.summary),
    painPoints: asArray(o.painPoints).map((p) => {
      const x = asObject<Record<string, unknown>>(p);
      const frequency = x.frequency;
      const severity = x.severity;
      return {
        id: asString(x.id, "pain"),
        pain: asString(x.pain, "Unnamed pain point"),
        frequency: frequency === "common" || frequency === "occasional" || frequency === "rare" ? frequency : "occasional",
        severity:
          severity === "critical" || severity === "significant" || severity === "mild" ? severity : "mild",
        quotes: asArray<Record<string, unknown>>(x.quotes).map((q) => ({
          text: asString(q.text),
          source: asString(q.source),
        })),
        userSegments: asStringArray(x.userSegments),
        citations: asStringArray(x.citations),
      };
    }),
    unmetNeeds: asArray(o.unmetNeeds).map((n) => {
      const x = asObject<Record<string, unknown>>(n);
      return {
        need: asString(x.need),
        whyUnmet: asString(x.whyUnmet),
        opportunity: asString(x.opportunity),
      };
    }),
    userPersonas: asArray(o.userPersonas).map((p) => {
      const x = asObject<Record<string, unknown>>(p);
      return {
        name: asString(x.name, "Unnamed persona"),
        role: asString(x.role),
        goals: asStringArray(x.goals),
        frustrations: asStringArray(x.frustrations),
      };
    }),
    citations: normalizeCitations(o.citations, "pain-detective", o.references, o.sources, citationItemsFromPainQuotes(o.painPoints)),
  };
}

function normalizePricingScout(o: Record<string, unknown>) {
  return {
    agent: "pricing-scout" as const,
    summary: asString(o.summary),
    priceBands: asArray(o.priceBands).map((b) => {
      const x = asObject<Record<string, unknown>>(b);
      return {
        name: asString(x.name, "Unnamed band"),
        min: asNumber(x.min),
        max: asNumber(x.max),
        typical: asNumber(x.typical),
        currency: asString(x.currency, "USD"),
      };
    }),
    competitorPricing: asArray(o.competitorPricing).map((cp) => {
      const x = asObject<Record<string, unknown>>(cp);
      return {
        competitor: asString(x.competitor, "Unnamed competitor"),
        tiers: asArray<Record<string, unknown>>(x.tiers).map((t) => {
          const y = asObject<Record<string, unknown>>(t);
          const period = y.period;
          return {
            tier: asString(y.tier, "Tier"),
            price: asNumber(y.price),
            currency: asString(y.currency, "USD"),
            period:
              period === "monthly" || period === "yearly" || period === "one-time" || period === "usage"
                ? period
                : "monthly",
            features: asStringArray(y.features),
            target: asString(y.target),
          };
        }),
      };
    }),
    monetizationModels: asArray(o.monetizationModels).map((m) => {
      const x = asObject<Record<string, unknown>>(m);
      return {
        model: asString(x.model, "Unknown model"),
        prevalence: asNumber(x.prevalence),
        examples: asStringArray(x.examples),
      };
    }),
    willingnessToPay: asArray(o.willingnessToPay).map((w) => {
      const x = asObject<Record<string, unknown>>(w);
      return {
        segment: asString(x.segment, "Unnamed segment"),
        estimate: asNumber(x.estimate),
        confidence: coerceConfidence(x.confidence),
      };
    }),
    recommendations: asArray(o.recommendations).map((r) => {
      const x = asObject<Record<string, unknown>>(r);
      const period = x.period;
      return {
        tier: asString(x.tier, "Tier"),
        price: asNumber(x.price),
        rationale: asString(x.rationale),
        // R214: the PricingScoutReport.tsx UI reads `rec.period` to label
        // its pricing line ("per user / month" etc.) but the schema had no
        // `period` field on recommendations. The schema is the contract;
        // we mirror the competitor-tier period enum here so the UI label
        // becomes meaningful for real runs.
        period:
          period === "monthly" || period === "yearly" || period === "one-time" || period === "usage"
            ? period
            : "monthly",
      };
    }),
    citations: normalizeCitations(o.citations, "pricing-scout", o.references, o.sources),
  };
}

function normalizeChannelScout(o: Record<string, unknown>) {
  return {
    agent: "channel-scout" as const,
    summary: asString(o.summary),
    channels: asArray(o.channels).map((c) => {
      const x = asObject<Record<string, unknown>>(c);
      const category = x.category;
      const reach = x.reach;
      const cost = x.cost;
      const effectiveness = x.effectiveness;
      return {
        name: asString(x.name, "Unnamed channel"),
        category:
          category === "social" ||
          category === "community" ||
          category === "content" ||
          category === "paid" ||
          category === "partnership" ||
          category === "direct"
            ? category
            : "direct",
        reach: reach === "niche" || reach === "moderate" || reach === "broad" ? reach : "moderate",
        cost: cost === "low" || cost === "medium" || cost === "high" ? cost : "medium",
        effectiveness:
          effectiveness === "unknown" || effectiveness === "low" || effectiveness === "medium" || effectiveness === "high"
            ? effectiveness
            : "unknown",
        audience: asString(x.audience),
        keyPlatforms: asStringArray(x.keyPlatforms),
        notes: asString(x.notes),
      };
    }),
    communityHubs: asArray(o.communityHubs).map((h) => {
      const x = asObject<Record<string, unknown>>(h);
      const safeUrl = canonicalizeSafeExternalUrl(x.url);
      return {
        name: asString(x.name, "Unnamed hub"),
        platform: asString(x.platform),
        size: asString(x.size),
        focus: asString(x.focus),
        ...(safeUrl ? { url: safeUrl } : {}),
      };
    }),
    contentTopics: asArray(o.contentTopics).map((t) => {
      const x = asObject<Record<string, unknown>>(t);
      const searchVolume = x.searchVolume;
      const competition = x.competition;
      return {
        topic: asString(x.topic, "Unnamed topic"),
        searchVolume:
          searchVolume === "low" || searchVolume === "medium" || searchVolume === "high" ? searchVolume : "medium",
        competition:
          competition === "low" || competition === "medium" || competition === "high" ? competition : "medium",
      };
    }),
    recommendedChannels: asArray(o.recommendedChannels).map((r) => {
      const x = asObject<Record<string, unknown>>(r);
      const priority = x.priority;
      return {
        channel: asString(x.channel, "Unnamed channel"),
        priority: priority === "high" || priority === "medium" || priority === "low" ? priority : "medium",
        why: asString(x.why),
      };
    }),
    citations: normalizeCitations(o.citations, "channel-scout", o.references, o.sources),
  };
}

function normalizeSynthesis(o: Record<string, unknown>) {
  // Clamp scores to 0-100 (validator already does this, but normalize must
  // be independently robust — a future schema change or skipped validator
  // path must not let a NaN donut render).
  const opp = Math.max(0, Math.min(100, asNumber(o.opportunityScore)));
  const risk = Math.max(0, Math.min(100, asNumber(o.riskScore)));
  return {
    agent: "synthesis" as const,
    execSummary: asString(o.execSummary),
    opportunityScore: opp,
    riskScore: risk,
    keyInsights: asArray(o.keyInsights).map((k) => {
      const x = asObject<Record<string, unknown>>(k);
      return {
        insight: asString(x.insight),
        supportingAgents: asStringArray(x.supportingAgents),
        confidence: coerceConfidence(x.confidence),
      };
    }),
    topThreeOpportunities: asArray(o.topThreeOpportunities).map((op) => {
      const x = asObject<Record<string, unknown>>(op);
      return {
        title: asString(x.title, "Untitled opportunity"),
        description: asString(x.description),
        rationale: asString(x.rationale),
      };
    }),
    topThreeRisks: asArray(o.topThreeRisks).map((r) => {
      const x = asObject<Record<string, unknown>>(r);
      return {
        title: asString(x.title, "Untitled risk"),
        description: asString(x.description),
        mitigation: asString(x.mitigation),
      };
    }),
    recommendedNextStep: asString(o.recommendedNextStep),
    launchlensBrief: asString(o.launchlensBrief),
    citations: normalizeCitations(o.citations, "synthesis", o.references, o.sources),
  };
}
