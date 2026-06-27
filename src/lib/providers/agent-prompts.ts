// Rich, schema-aware prompt builders for the real LLM providers.
//
// This module is the bridge between the LaunchLens agent schemas and the
// free-form text that an LLM produces. The previous provider prompts only
// asked the model to "match the LaunchLens AgentOutput schema" without ever
// showing the schema — so real LLM calls guessed the shape, failed
// validation, and silently fell back to the mock every time. With these
// builders the model receives the exact required fields, allowed enum
// values, and per-agent coaching, which makes the real-provider path
// actually produce usable structured output.
//
// Shared by openai-provider.ts and anthropic-provider.ts so the two stay
// in sync. Pure functions — safe to unit-test without any network.

import type { AgentId, AgentOutput } from "@/lib/schema/research-schema";

/**
 * A per-agent prompt spec: the role coaching the model should adopt, and a
 * compact TypeScript-ish shape it must return. Kept as plain strings so the
 * prompt stays readable and diffable rather than being generated from the
 * runtime types (which would balloon token usage and obscure intent).
 */
interface AgentPromptSpec {
  role: string;
  schema: string;
  coaching: string[];
}

const AGENT_SPECS: Record<AgentId, AgentPromptSpec> = {
  "market-sizer": {
    role:
      "You are a market-sizing analyst. Quantify the market opportunity for a product idea using TAM/SAM/SOM, growth trends, and customer segments. Use realistic, defensible numbers and cite the reasoning behind each estimate.",
    schema: `{
  "agent": "market-sizer",
  "summary": string,                      // 2-3 sentence overview of the market opportunity
  "marketSize": {
    "tam": number,                        // total addressable market, annual revenue in USD
    "sam": number,                        // serviceable addressable market, USD
    "som": number,                        // 3-year serviceable obtainable market, USD
    "currency": "USD",
    "growthRate": number,                 // annual growth rate as a percentage, e.g. 26.5
    "growthTrend": "accelerating" | "stable" | "declining",
    "unit": "users" | "revenue" | "businesses",
    "sources": string[],                  // citation ids that back these numbers
    "confidence": "low" | "medium" | "high"
  },
  "keyTrends": Array<{
    "trend": string,
    "impact": "positive" | "negative" | "neutral",
    "evidence": string                    // why this trend matters
  }>,
  "targetSegments": Array<{
    "name": string,
    "size": number,                       // approximate segment size (users or businesses)
    "description": string
  }>,
  "citations": Array<{                    // at least 2, every claim should trace to one
    "id": string,                         // e.g. "c1", referenced by marketSize.sources
    "title": string,
    "url": string,                        // real URL when known, else omit
    "snippet": string,                    // the relevant excerpt or reasoning
    "accessedAt": string,                 // ISO 8601 timestamp
    "confidence": "low" | "medium" | "high",
    "agent": "market-sizer"
  }>
}`,
    coaching: [
      "TAM/SAM/SOM must be positive numbers in USD. SAM must be <= TAM, SOM <= SAM.",
      "If you cannot verify a number, estimate conservatively and mark confidence as low or medium.",
      "Every figure in marketSize.sources must reference a citation id from the citations array.",
    ],
  },
  "competitor-analyst": {
    role:
      "You are a competitive-intelligence analyst. Map the competitive landscape for a product idea: identify direct and indirect competitors, benchmark them on a feature matrix, and surface market gaps.",
    schema: `{
  "agent": "competitor-analyst",
  "summary": string,
  "competitors": Array<{                  // 5-8 competitors
    "id": string,                         // e.g. "comp1"
    "name": string,
    "tagline": string,
    "url": string,
    "strengths": string[],                // 2-4 items
    "weaknesses": string[],               // 2-4 items
    "pricing": { "min": number, "max": number, "model": string, "currency": "USD" },
    "marketShare": number,                // 0-100, omit if unknown
    "positioning": "premium" | "mid-market" | "budget" | "niche",
    "differentiation": string,
    "citations": string[]                 // citation ids backing this competitor
  }>,
  "competitiveMatrix": Array<{
    "dimension": string,                  // e.g. "API quality", "Pricing transparency"
    "players": Array<{ "name": string, "score": number }>  // score 0-100
  }>,
  "gaps": Array<{                         // market gaps / white space
    "gap": string,
    "opportunity": string,
    "difficulty": "low" | "medium" | "high"
  }>,
  "citations": Array<{ "id": string, "title": string, "url": string, "snippet": string, "accessedAt": string, "confidence": "low" | "medium" | "high", "agent": "competitor-analyst" }>
}`,
    coaching: [
      "Score every player on every matrix dimension (0-100). Names in the matrix must match competitor names.",
      "Pricing min/max are in USD; max >= min. If pricing is unknown, use 0/0 and describe the model in the model field.",
      "Identify at least 3 gaps with a clear opportunity and realistic difficulty.",
    ],
  },
  "pain-detective": {
    role:
      "You are a user-research analyst specializing in voice-of-customer. Uncover real user pain points and unmet needs for a product idea, ranked by frequency and severity, with representative quotes.",
    schema: `{
  "agent": "pain-detective",
  "summary": string,
  "painPoints": Array<{
    "id": string,                         // e.g. "pain1"
    "pain": string,
    "frequency": "common" | "occasional" | "rare",
    "severity": "critical" | "significant" | "mild",
    "quotes": Array<{ "text": string, "source": string }>,  // paraphrased, source = where the sentiment is common
    "userSegments": string[],
    "citations": string[]
  }>,
  "unmetNeeds": Array<{
    "need": string,
    "whyUnmet": string,
    "opportunity": string
  }>,
  "userPersonas": Array<{
    "name": string,
    "role": string,
    "goals": string[],
    "frustrations": string[]
  }>,
  "citations": Array<{ "id": string, "title": string, "url": string, "snippet": string, "accessedAt": string, "confidence": "low" | "medium" | "high", "agent": "pain-detective" }>
}`,
    coaching: [
      "Rank painPoints by severity then frequency — critical/common first.",
      "Quotes may be paraphrased to avoid fabrication, but the source field must name where this sentiment commonly appears (e.g. 'r/SaaS', 'G2 reviews').",
      "Derive at least 2 user personas from the pain patterns.",
    ],
  },
  "pricing-scout": {
    role:
      "You are a pricing strategist. Analyze the pricing landscape for a product idea and recommend an optimal tiered pricing strategy grounded in competitor pricing and willingness-to-pay.",
    schema: `{
  "agent": "pricing-scout",
  "summary": string,
  "priceBands": Array<{                   // budget / mid-market / premium
    "name": string,
    "min": number, "max": number, "typical": number,
    "currency": "USD"
  }>,
  "competitorPricing": Array<{
    "competitor": string,
    "tiers": Array<{
      "tier": string,
      "price": number,
      "currency": "USD",
      "period": "monthly" | "yearly" | "one-time" | "usage",
      "features": string[],
      "target": string
    }>
  }>,
  "monetizationModels": Array<{
    "model": string,                      // e.g. "subscription", "usage-based", "freemium"
    "prevalence": number,                 // 0-100, how common in this category
    "examples": string[]
  }>,
  "willingnessToPay": Array<{
    "segment": string,
    "estimate": number,                   // USD per month
    "confidence": "low" | "medium" | "high"
  }>,
  "recommendations": Array<{
    "tier": string,
    "price": number,                      // USD per month
    "rationale": string
  }>,
  "citations": Array<{ "id": string, "title": string, "url": string, "snippet": string, "accessedAt": string, "confidence": "low" | "medium" | "high", "agent": "pricing-scout" }>
}`,
    coaching: [
      "All prices in USD. max >= min, typical between them.",
      "Provide at least 3 price bands and 2-3 tier recommendations.",
      "prevalence is 0-100; willingnessToPay.estimate is a monthly USD figure.",
    ],
  },
  "channel-scout": {
    role:
      "You are a go-to-market channel strategist. Identify the best acquisition channels and community hubs for reaching the target audience of a product idea, prioritized by expected ROI.",
    schema: `{
  "agent": "channel-scout",
  "summary": string,
  "channels": Array<{
    "name": string,
    "category": "social" | "community" | "content" | "paid" | "partnership" | "direct",
    "reach": "niche" | "moderate" | "broad",
    "cost": "low" | "medium" | "high",
    "effectiveness": "unknown" | "low" | "medium" | "high",
    "audience": string,
    "keyPlatforms": string[],
    "notes": string
  }>,
  "communityHubs": Array<{
    "name": string,                        // e.g. "r/SaaS", "Indie Hackers"
    "platform": string,
    "size": string,                        // e.g. "150k members"
    "focus": string,
    "url": string
  }>,
  "contentTopics": Array<{
    "topic": string,
    "searchVolume": "low" | "medium" | "high",
    "competition": "low" | "medium" | "high"
  }>,
  "recommendedChannels": Array<{
    "channel": string,
    "priority": "high" | "medium" | "low",
    "why": string
  }>,
  "citations": Array<{ "id": string, "title": string, "url": string, "snippet": string, "accessedAt": string, "confidence": "low" | "medium" | "high", "agent": "channel-scout" }>
}`,
    coaching: [
      "List 6-10 channels spanning at least 3 categories.",
      "Prioritize recommendedChannels by ROI — high priority first.",
      "For communityHubs, name real platforms when known; mark confidence honestly.",
    ],
  },
  synthesis: {
    role:
      "You are the synthesis agent. Cross-validate the findings from the five research agents (Market Sizer, Competitor Analyst, Pain Detective, Pricing Scout, Channel Scout) and produce a unified, actionable executive brief. Your upstream agent outputs are provided in the user message.",
    schema: `{
  "agent": "synthesis",
  "execSummary": string,                  // 2-3 paragraphs
  "opportunityScore": number,             // 0-100
  "riskScore": number,                    // 0-100
  "keyInsights": Array<{
    "insight": string,
    "supportingAgents": Array<"market-sizer" | "competitor-analyst" | "pain-detective" | "pricing-scout" | "channel-scout">,
    "confidence": "low" | "medium" | "high"
  }>,
  "topThreeOpportunities": Array<{ "title": string, "description": string, "rationale": string }>,
  "topThreeRisks": Array<{ "title": string, "description": string, "mitigation": string }>,
  "recommendedNextStep": string,          // single most impactful next action
  "launchlensBrief": string,              // a compact brief importable into launchlens-ai
  "citations": Array<{ "id": string, "title": string, "url": string, "snippet": string, "accessedAt": string, "confidence": "low" | "medium" | "high", "agent": "synthesis" }>
}`,
    coaching: [
      "Cross-validate: an insight is stronger when multiple agents support it — list them in supportingAgents.",
      "opportunityScore and riskScore are 0-100. Higher opportunity = more attractive; higher risk = harder to execute.",
      "Provide exactly 3 topThreeOpportunities and 3 topThreeRisks.",
      "The launchlensBrief should be a concise, self-contained paragraph a founder could act on.",
      "Upstream outputs are provided one JSON object per agent. If an output is marked [truncated], synthesize from the visible fields and do not treat missing fields as absent from the research — they were cut for length, not because they were empty.",
    ],
  },
};

/** Build the system prompt for an agent: role + schema + coaching. */
export function buildSystemPrompt(agentId: AgentId): string {
  const spec = AGENT_SPECS[agentId];
  return [
    spec.role,
    "",
    "You MUST respond with a single JSON object and nothing else — no prose, no markdown fences, no commentary.",
    "The JSON object MUST conform to this TypeScript shape (required fields, allowed enum values shown):",
    "```",
    spec.schema,
    "```",
    "",
    "Rules:",
    ...spec.coaching.map((c) => "- " + c),
    "- Use the current date for accessedAt (ISO 8601).",
    "- When you are unsure of a real source, prefer an honest confidence level of \"low\" over inventing a URL. A citation with reasoning in the snippet is acceptable; a fabricated URL is not.",
    "- Output ONLY the JSON object.",
  ].join("\n");
}

/**
 * Build the user prompt for an agent. Includes the product idea, keywords,
 * and — for the synthesis agent — the upstream agent outputs to synthesize.
 *
 * For synthesis the upstream payload is the five research agents' full
 * outputs. Naively JSON.stringify-ing the whole array and slicing would
 * cut a number/string mid-token and yield invalid JSON the model cannot
 * parse — silent data corruption. Instead we stringify each agent's output
 * individually (each stays valid JSON) and apply a per-agent budget, so a
 * truncated output is still parseable and is explicitly flagged as
 * "[truncated]" so the model knows it is seeing a subset.
 */
export function buildUserPrompt(agentId: AgentId, ctx: {
  query: string;
  keywords: string[];
  upstream?: AgentOutput[];
}): string {
  if (!ctx.upstream || ctx.upstream.length === 0) {
    return [
      "Product idea: " + ctx.query,
      "Keywords: " + (ctx.keywords && ctx.keywords.length ? ctx.keywords.join(", ") : "(none provided)"),
    ].join("\n");
  }
  // Budget the upstream section so the whole prompt stays well within a
  // typical model context window while giving every agent fair space.
  const PER_AGENT_BUDGET = 6000;
  const parts = ctx.upstream.map((out, i) => {
    const tag = out.agent || ("agent-" + i);
    const json = JSON.stringify(out);
    if (json.length <= PER_AGENT_BUDGET) {
      return "--- " + tag + " ---\n" + json;
    }
    // Truncate at the last safe boundary before the budget so the JSON
    // stays invalid-but-explicitly-truncated rather than misleadingly
    // whole. We close the object best-effort; the model is told it's a
    // truncation and coached (in the system prompt) to treat it as partial.
    return "--- " + tag + " [truncated, first " + PER_AGENT_BUDGET + " chars] ---\n" + json.slice(0, PER_AGENT_BUDGET) + " …";
  });
  return [
    "Product idea: " + ctx.query,
    "Keywords: " + (ctx.keywords && ctx.keywords.length ? ctx.keywords.join(", ") : "(none provided)"),
    "",
    "Upstream agent outputs to synthesize (one JSON object per agent; some may be marked [truncated]):",
    parts.join("\n\n"),
  ].join("\n");
}
