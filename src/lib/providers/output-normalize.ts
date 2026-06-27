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

const VALID_CONFIDENCE: ConfidenceLevel[] = ["low", "medium", "high"];

function asString(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

function asNumber(v: unknown, fallback = 0): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function asArray<T = unknown>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

function asObject<T = Record<string, unknown>>(v: unknown): T {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as T) : ({} as T);
}

function coerceConfidence(v: unknown): ConfidenceLevel {
  return VALID_CONFIDENCE.includes(v as ConfidenceLevel) ? (v as ConfidenceLevel) : "low";
}

function normalizeCitation(c: unknown) {
  const o = asObject<Record<string, unknown>>(c);
  return {
    id: asString(o.id, "c"),
    title: asString(o.title, "Untitled source"),
    snippet: asString(o.snippet, ""),
    accessedAt: asString(o.accessedAt, new Date().toISOString()),
    confidence: coerceConfidence(o.confidence),
    agent: asString(o.agent, ""),
    ...(typeof o.url === "string" && o.url ? { url: o.url } : {}),
  };
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
      growthTrend: asString(ms.growthTrend, "stable"),
      unit: asString(ms.unit, "USD"),
      sources: asArray<string>(ms.sources),
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
    citations: asArray(o.citations).map(normalizeCitation),
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
      return {
        id: asString(x.id, "comp"),
        name: asString(x.name, "Unnamed competitor"),
        tagline: asString(x.tagline),
        ...(typeof x.url === "string" && x.url ? { url: x.url } : {}),
        strengths: asArray<string>(x.strengths),
        weaknesses: asArray<string>(x.weaknesses),
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
    citations: asArray(o.citations).map(normalizeCitation),
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
        userSegments: asArray<string>(x.userSegments),
        citations: asArray<string>(x.citations),
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
        goals: asArray<string>(x.goals),
        frustrations: asArray<string>(x.frustrations),
      };
    }),
    citations: asArray(o.citations).map(normalizeCitation),
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
            features: asArray<string>(y.features),
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
        examples: asArray<string>(x.examples),
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
      return {
        tier: asString(x.tier, "Tier"),
        price: asNumber(x.price),
        rationale: asString(x.rationale),
      };
    }),
    citations: asArray(o.citations).map(normalizeCitation),
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
        keyPlatforms: asArray<string>(x.keyPlatforms),
        notes: asString(x.notes),
      };
    }),
    communityHubs: asArray(o.communityHubs).map((h) => {
      const x = asObject<Record<string, unknown>>(h);
      return {
        name: asString(x.name, "Unnamed hub"),
        platform: asString(x.platform),
        size: asString(x.size),
        focus: asString(x.focus),
        ...(typeof x.url === "string" && x.url ? { url: x.url } : {}),
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
    citations: asArray(o.citations).map(normalizeCitation),
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
        supportingAgents: asArray<string>(x.supportingAgents),
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
    citations: asArray(o.citations).map(normalizeCitation),
  };
}
