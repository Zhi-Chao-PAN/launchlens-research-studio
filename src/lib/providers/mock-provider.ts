import type {
  AgentId,
  MarketSizerOutput,
  CompetitorAnalystOutput,
  PainDetectiveOutput,
  PricingScoutOutput,
  ChannelScoutOutput,
  SynthesisOutput,
  SourceCitation,
  AgentOutput,
} from "@/lib/schema/research-schema";
import { buildSeed, pickVariant } from "@/lib/providers/seed";

// Mock provider returns deterministic research outputs for demo purposes.
// Real providers (search + LLM) would be wired in through the same interface.



// --- query-aware personalization helpers ---
const QUERY_PHRASES = [
  "Based on the {q} landscape, the analysis below is generated as a research preview.",
  "For the {q} context, the analysis surfaces market patterns observed across the space.",
  "The research synthesizes a {q} market view across six specialized agents.",
  "Drawing on the {q} context, here is a structured research preview.",
];

function querySnippet(query: string, maxLen: number = 40): string {
  const t = (query || "").trim();
  if (!t) return "this market";
  if (t.length <= maxLen) return t;
  return t.slice(0, maxLen - 1).trimEnd() + "…";
}

function keywordList(keywords: string[], max: number = 4): string {
  const k = (keywords || []).map((x) => x.trim()).filter(Boolean).slice(0, max);
  if (k.length === 0) return "";
  return k.join(", ");
}

function personalizeSummary(baseSummary: string, query: string, keywords: string[], offset: number = 0): string {
  const seed = buildSeed(query, keywords);
  const snippet = querySnippet(query);
  const kws = keywordList(keywords);
  const phrase = pickVariant(seed, QUERY_PHRASES, offset);
  const prefix = phrase.replace(/\{q\}/g, snippet);
  const tail = kws ? " Focus areas: " + kws + "." : "";
  return prefix + " " + baseSummary + tail;
}

const baseCitations: Record<string, Omit<SourceCitation, "accessedAt">> = {
  "cite-market-1": {
    id: "cite-market-1",
    title: "Grand View Research: AI in Marketing 2026",
    url: "https://example.com/report/ai-marketing-2026",
    snippet: "Global AI in marketing market projected to reach $85.6B by 2030, CAGR 26.5%",
    confidence: "medium",
    agent: "market-sizer",
  },
  "cite-market-2": {
    id: "cite-market-2",
    title: "Gartner: Marketing Technology Spending Forecast",
    url: "https://example.com/gartner/martech-forecast",
    snippet: "Global martech spend will exceed $500B in 2026; AI tools growing fastest",
    confidence: "high",
    agent: "market-sizer",
  },
  "cite-comp-1": {
    id: "cite-comp-1",
    title: "G2 Crowd: AI Marketing Tools Category",
    url: "https://example.com/g2/ai-marketing",
    snippet: "Top players: Jasper, Copy.ai, Writesonic; 100+ tools in category",
    confidence: "high",
    agent: "competitor-analyst",
  },
  "cite-pain-1": {
    id: "cite-pain-1",
    title: "Reddit r/marketing: What tools are you missing?",
    url: "https://example.com/reddit/missing-tools",
    snippet: "Biggest pain: AI generates generic content - I rewrite 80% of it",
    confidence: "medium",
    agent: "pain-detective",
  },
  "cite-pain-2": {
    id: "cite-pain-2",
    title: "Product Hunt comments on AI SaaS launches",
    url: "https://example.com/ph/ai-saas-comments",
    snippet: "Too many tools, no integration. 7 AI tools and none talk to each other",
    confidence: "medium",
    agent: "pain-detective",
  },
  "cite-price-1": {
    id: "cite-price-1",
    title: "Pricing survey: B2B SaaS AI tools",
    url: "https://example.com/pricing/survey",
    snippet: "Median AI marketing SaaS: $49/mo pro, $149/mo team tiers",
    confidence: "medium",
    agent: "pricing-scout",
  },
  "cite-channel-1": {
    id: "cite-channel-1",
    title: "Indie Hackers: Top launch channels for AI tools",
    url: "https://example.com/indie-hackers/launch-channels",
    snippet: "Product Hunt, Twitter/X, LinkedIn are top 3 launch channels for AI SaaS",
    confidence: "high",
    agent: "channel-scout",
  },
};

function withTimestamp(id: string): SourceCitation {
  const base = baseCitations[id];
  return { ...base, accessedAt: new Date().toISOString() };
}

export function generateMockMarketSizer(query: string, keywords: string[]): MarketSizerOutput {
  return {
    agent: "market-sizer",
    summary: personalizeSummary("The market is large and rapidly growing, driven by AI adoption. TAM is substantial but competitive, with clear room for differentiated players targeting specific niches.", query, keywords, 0),
    marketSize: {
      tam: 85600000000,
      sam: 12400000000,
      som: 180000000,
      currency: "USD",
      growthRate: 26.5,
      growthTrend: "accelerating",
      unit: "revenue",
      sources: ["cite-market-1", "cite-market-2"],
      confidence: "medium",
    },
    keyTrends: [
      { trend: "AI-native workflow integration", impact: "positive", evidence: "Users demand end-to-end pipelines, not isolated point tools" },
      { trend: "Enterprise security requirements rising", impact: "negative", evidence: "SOC 2 and data residency becoming table stakes for B2B" },
      { trend: "Model commoditization", impact: "neutral", evidence: "Base model quality converging; UX and workflow depth differentiate" },
    ],
    targetSegments: [
      { name: "Solo founders and indie hackers", size: 5000000, description: "Building products fast, need go-to-market help" },
      { name: "Small SaaS teams (2-20 people)", size: 800000, description: "Limited marketing resources, high efficiency needs" },
      { name: "Technical product managers", size: 1200000, description: "Need evidence-based decisions before building" },
    ],
    citations: [withTimestamp("cite-market-1"), withTimestamp("cite-market-2")],
  };
}

export function generateMockCompetitorAnalyst(query: string, keywords: string[]): CompetitorAnalystOutput {
  return {
    agent: "competitor-analyst",
    summary: personalizeSummary("The competitive landscape is crowded but fragmented. Most players focus on content generation rather than strategic go-to-market planning. Key gaps exist in evidence-based validation and cross-workspace integration.", query, keywords, 1),
    competitors: [
      {
        id: "comp-1",
        name: "Jasper",
        tagline: "AI content platform for marketing teams",
        url: "https://example.com/jasper",
        strengths: ["Strong brand recognition", "Wide feature set", "Enterprise customers"],
        weaknesses: ["Expensive", "Generic output", "No strategic planning"],
        pricing: { min: 49, max: 125, model: "subscription", currency: "USD" },
        positioning: "mid-market",
        differentiation: "Brand, breadth of features",
        citations: ["cite-comp-1"],
      },
      {
        id: "comp-2",
        name: "Copy.ai",
        tagline: "AI writing tool for marketers",
        url: "https://example.com/copyai",
        strengths: ["Affordable", "Good UX", "Large user base"],
        weaknesses: ["Shallow features", "No workflow depth", "Quality inconsistent"],
        pricing: { min: 49, max: 249, model: "subscription", currency: "USD" },
        positioning: "mid-market",
        differentiation: "Lower price point",
        citations: ["cite-comp-1"],
      },
      {
        id: "comp-3",
        name: "Notion AI",
        tagline: "AI built into your workspace",
        url: "https://example.com/notion-ai",
        strengths: ["Massive user base", "Deeply integrated", "Familiar interface"],
        weaknesses: ["Generic AI", "No GTM-specific features", "Surface-level"],
        pricing: { min: 8, max: 15, model: "per-seat-add-on", currency: "USD" },
        positioning: "mid-market",
        differentiation: "Distribution",
        citations: [],
      },
    ],
    competitiveMatrix: [
      { dimension: "Content quality", players: [{ name: "Jasper", score: 7 }, { name: "Copy.ai", score: 6 }, { name: "Notion AI", score: 5 }] },
      { dimension: "Strategic depth", players: [{ name: "Jasper", score: 4 }, { name: "Copy.ai", score: 3 }, { name: "Notion AI", score: 2 }] },
      { dimension: "Value for money", players: [{ name: "Jasper", score: 5 }, { name: "Copy.ai", score: 7 }, { name: "Notion AI", score: 8 }] },
    ],
    gaps: [
      { gap: "Evidence-based decision support", opportunity: "Most tools generate content, not strategic guidance with citations", difficulty: "medium" },
      { gap: "Go-to-market planning workspace", opportunity: "No tool covers full GTM strategy from idea to execution plan", difficulty: "high" },
      { gap: "Validation loop integration", opportunity: "Founders want to track assumptions against real user evidence", difficulty: "medium" },
    ],
    citations: [withTimestamp("cite-comp-1")],
  };
}

export function generateMockPainDetective(query: string, keywords: string[]): PainDetectiveOutput {
  return {
    agent: "pain-detective",
    summary: personalizeSummary("Founders and builders consistently report three core pain points: generic AI output, tool fragmentation, and difficulty validating ideas before building. The validation gap - knowing whether an idea is worth pursuing - is the most underserved.", query, keywords, 2),
    painPoints: [
      {
        id: "pain-1",
        pain: "AI generates generic, undifferentiated output",
        frequency: "common",
        severity: "significant",
        quotes: [
          { text: "I still rewrite 80% of what AI generates. Structure right, substance wrong.", source: "Reddit r/marketing" },
          { text: "Every AI tool sounds the same. My content does not stand out.", source: "Twitter survey" },
        ],
        userSegments: ["content marketers", "founders", "freelancers"],
        citations: ["cite-pain-1"],
      },
      {
        id: "pain-2",
        pain: "Too many tools, no integration",
        frequency: "common",
        severity: "significant",
        quotes: [
          { text: "I have 7 different AI tools open. None share context.", source: "Product Hunt comments" },
        ],
        userSegments: ["small marketing teams", "solo founders"],
        citations: ["cite-pain-2"],
      },
      {
        id: "pain-3",
        pain: "Hard to validate ideas before building",
        frequency: "occasional",
        severity: "critical",
        quotes: [
          { text: "I built three products nobody wanted. Need to test ideas faster.", source: "Indie Hackers" },
        ],
        userSegments: ["indie hackers", "aspiring founders"],
        citations: [],
      },
    ],
    unmetNeeds: [
      { need: "Strategic AI that thinks, not just writes", whyUnmet: "Most AI tools optimize for content volume, not strategic quality", opportunity: "A planning-focused AI that gives structure and evidence" },
      { need: "Single source of truth for GTM work", whyUnmet: "Founders use Notion + docs + spreadsheets + AI tools separately", opportunity: "An integrated workspace spanning strategy to execution" },
      { need: "Idea validation without building", whyUnmet: "Validation tools are either manual or do not integrate with planning", opportunity: "Research + validation loop baked into strategy tooling" },
    ],
    userPersonas: [
      {
        name: "Solo Sam",
        role: "Indie hacker, 3-5 side projects/year",
        goals: ["Validate ideas fast", "Launch quickly", "Get first 100 customers"],
        frustrations: ["Wasting time on wrong ideas", "Generic AI output", "Tool fragmentation"],
      },
      {
        name: "Startup Sarah",
        role: "Founder of 5-person SaaS startup",
        goals: ["Scale GTM", "Hire efficiently", "Hit ARR targets"],
        frustrations: ["Marketing is a black box", "Cannot afford a CMO", "Agencies are expensive"],
      },
    ],
    citations: [withTimestamp("cite-pain-1"), withTimestamp("cite-pain-2")],
  };
}

export function generateMockPricingScout(query: string, keywords: string[]): PricingScoutOutput {
  return {
    agent: "pricing-scout",
    summary: personalizeSummary("The dominant pricing model for AI SaaS tools is freemium with monthly subscriptions. Pro tiers cluster around $49/month, team tiers around $149/month. Usage-based pricing is emerging but not yet mainstream for marketing-focused tools.", query, keywords, 3),
    priceBands: [
      { name: "Free / Freemium", min: 0, max: 0, typical: 0, currency: "USD" },
      { name: "Starter / Pro", min: 19, max: 79, typical: 49, currency: "USD" },
      { name: "Team / Business", min: 99, max: 299, typical: 149, currency: "USD" },
      { name: "Enterprise", min: 500, max: 5000, typical: 1000, currency: "USD" },
    ],
    competitorPricing: [
      {
        competitor: "Jasper",
        tiers: [
          { tier: "Creator", price: 49, currency: "USD", period: "monthly", features: ["50k words", "50+ templates", "1 user"], target: "Individuals" },
          { tier: "Teams", price: 125, currency: "USD", period: "monthly", features: ["Unlimited words", "Brand voice", "5 users"], target: "Small teams" },
        ],
      },
      {
        competitor: "Copy.ai",
        tiers: [
          { tier: "Pro", price: 49, currency: "USD", period: "monthly", features: ["Unlimited words", "90+ tools", "1 user"], target: "Individuals" },
          { tier: "Enterprise", price: 249, currency: "USD", period: "monthly", features: ["All features", "API access", "5 seats"], target: "Teams" },
        ],
      },
    ],
    monetizationModels: [
      { model: "Freemium + subscription", prevalence: 75, examples: ["Jasper", "Copy.ai", "Notion AI"] },
      { model: "Usage-based credits", prevalence: 15, examples: ["Various API-first tools"] },
      { model: "One-time purchase", prevalence: 5, examples: ["Lifetime deals on AppSumo"] },
      { model: "Pay-per-result", prevalence: 5, examples: ["Emerging, not yet mainstream"] },
    ],
    willingnessToPay: [
      { segment: "Solo founders", estimate: 29, confidence: "medium" },
      { segment: "Small teams", estimate: 99, confidence: "medium" },
      { segment: "Enterprise", estimate: 500, confidence: "low" },
    ],
    recommendations: [
      { tier: "Free", price: 0, rationale: "Let users experience the product flow with a limited demo or mock provider" },
      { tier: "Pro", price: 39, rationale: "Undercut established players while signaling quality. Focus on indie hackers and solo builders" },
      { tier: "Team", price: 129, rationale: "Team workspace with shared research, multiple workstreams, priority support" },
    ],
    citations: [withTimestamp("cite-price-1")],
  };
}

export function generateMockChannelScout(query: string, keywords: string[]): ChannelScoutOutput {
  return {
    agent: "channel-scout",
    summary: personalizeSummary("AI SaaS products primarily launch through Product Hunt, Twitter/X, and LinkedIn. Long-term, content marketing and community building provide the most sustainable growth. Paid acquisition is competitive and expensive in this category.", query, keywords, 4),
    channels: [
      {
        name: "Product Hunt",
        category: "community",
        reach: "broad",
        cost: "low",
        effectiveness: "high",
        audience: "Early adopters, makers, tech enthusiasts",
        keyPlatforms: ["producthunt.com"],
        notes: "Essential launch channel. Timing and maker network matter most.",
      },
      {
        name: "Twitter/X",
        category: "social",
        reach: "broad",
        cost: "medium",
        effectiveness: "medium",
        audience: "Founders, builders, tech workers",
        keyPlatforms: ["twitter.com", "x.com"],
        notes: "Build in public is effective for AI tools. High signal for B2B SaaS.",
      },
      {
        name: "LinkedIn",
        category: "social",
        reach: "broad",
        cost: "medium",
        effectiveness: "medium",
        audience: "Business professionals, startup founders, PMs",
        keyPlatforms: ["linkedin.com"],
        notes: "Stronger for B2B than Twitter. AI + productivity content performs well.",
      },
      {
        name: "Indie Hackers",
        category: "community",
        reach: "niche",
        cost: "low",
        effectiveness: "medium",
        audience: "Indie hackers, solo founders, bootstrappers",
        keyPlatforms: ["indiehackers.com"],
        notes: "Great for product feedback and early adopters.",
      },
      {
        name: "Content Marketing / SEO",
        category: "content",
        reach: "broad",
        cost: "medium",
        effectiveness: "high",
        audience: "People searching for solutions",
        keyPlatforms: ["Blog", "YouTube", "SEO"],
        notes: "Long-term compounding. Niche angles work better for AI tools.",
      },
      {
        name: "Paid Ads",
        category: "paid",
        reach: "broad",
        cost: "high",
        effectiveness: "unknown",
        audience: "Broad targeting",
        keyPlatforms: ["Google Ads", "LinkedIn Ads", "Twitter Ads"],
        notes: "CAC is high for AI tools due to competition. Test small.",
      },
    ],
    communityHubs: [
      { name: "r/marketing", platform: "Reddit", size: "~1.2M members", focus: "Marketing professionals", url: "https://reddit.com/r/marketing" },
      { name: "r/Entrepreneur", platform: "Reddit", size: "~2.5M members", focus: "Startup founders", url: "https://reddit.com/r/entrepreneur" },
      { name: "Indie Hackers", platform: "Forum", size: "~500k members", focus: "Bootstrapped SaaS", url: "https://indiehackers.com" },
      { name: "Hacker News", platform: "Forum", size: "~10M monthly", focus: "Tech and startups", url: "https://news.ycombinator.com" },
    ],
    contentTopics: [
      { topic: "AI go-to-market strategy", searchVolume: "medium", competition: "medium" },
      { topic: "How to validate startup idea", searchVolume: "high", competition: "high" },
      { topic: "AI marketing tools comparison", searchVolume: "high", competition: "high" },
      { topic: "SaaS pricing strategy", searchVolume: "medium", competition: "medium" },
      { topic: "Launch SaaS product checklist", searchVolume: "medium", competition: "low" },
    ],
    recommendedChannels: [
      { channel: "Product Hunt + Twitter launch", priority: "high", why: "Highest ROI for initial launch with minimal budget" },
      { channel: "Build-in-public on Twitter/X", priority: "high", why: "Compounds over time, attracts early adopters and feedback" },
      { channel: "Content marketing (niche angles)", priority: "medium", why: "Sustainable long-term traffic if you pick underserved topics" },
      { channel: "Indie Hackers community", priority: "medium", why: "Quality early users and direct founder feedback" },
    ],
    citations: [withTimestamp("cite-channel-1")],
  };
}

export function generateMockSynthesis(
  query: string,
  keywords: string[],
  agentOutputs: AgentOutput[],
): SynthesisOutput {
  // Pull typed outputs from the upstream results. If an agent is missing
  // (e.g. due to an upstream failure) we fall back to the static mock so
  // synthesis still produces a structurally complete report.
  const market = agentOutputs.find((o) => o.agent === "market-sizer") as MarketSizerOutput | undefined;
  const competitors = agentOutputs.find((o) => o.agent === "competitor-analyst") as CompetitorAnalystOutput | undefined;
  const pain = agentOutputs.find((o) => o.agent === "pain-detective") as PainDetectiveOutput | undefined;
  const pricing = agentOutputs.find((o) => o.agent === "pricing-scout") as PricingScoutOutput | undefined;
  const channels = agentOutputs.find((o) => o.agent === "channel-scout") as ChannelScoutOutput | undefined;

  const snippet = querySnippet(query, 60);
  const kwStr = keywordList(keywords, 6);

  // --- Derive opportunity/risk scores from upstream evidence --------------
  // Opportunity is boosted by high growth, large TAM, positive trends,
  // "common" pain points, and competitor gaps. Risk is boosted by many
  // competitors, "high" difficulty gaps, negative trends, and crowded channels.
  const growth = market?.marketSize.growthRate ?? 20;
  const confidenceCount = agentOutputs.filter(
    (o) => "citations" in o && (o as { citations: SourceCitation[] }).citations.length >= 2,
  ).length;
  const severePains = pain?.painPoints.filter((p) => p.severity === "critical").length ?? 0;
  const commonPains = pain?.painPoints.filter((p) => p.frequency === "common").length ?? 0;
  const numGaps = competitors?.gaps.length ?? 0;
  const hardGaps = competitors?.gaps.filter((g) => g.difficulty !== "high").length ?? 0;
  const positiveTrends = market?.keyTrends.filter((t) => t.impact === "positive").length ?? 0;
  const negativeTrends = market?.keyTrends.filter((t) => t.impact === "negative").length ?? 0;
  const numCompetitors = competitors?.competitors.length ?? 3;
  const highEffChannels = channels?.channels.filter((c) => c.effectiveness === "high").length ?? 0;
  const highCostChannels = channels?.channels.filter((c) => c.cost === "high").length ?? 0;

  let opportunityScore = 40;
  opportunityScore += Math.min(25, growth * 0.8); // up to ~25 from growth
  opportunityScore += Math.min(15, numGaps * 4 + hardGaps * 2);
  opportunityScore += Math.min(10, severePains * 4 + commonPains * 2);
  opportunityScore += Math.min(5, positiveTrends * 2);
  opportunityScore += Math.min(5, confidenceCount);
  opportunityScore += Math.min(5, highEffChannels * 2);
  opportunityScore = Math.max(10, Math.min(95, Math.round(opportunityScore)));

  let riskScore = 30;
  riskScore += Math.min(20, numCompetitors * 3);
  riskScore += Math.min(15, negativeTrends * 5);
  riskScore += Math.min(15, Math.max(0, numGaps - hardGaps) * 5);
  riskScore += Math.min(10, highCostChannels * 3);
  riskScore += Math.min(10, keywords.length === 0 ? 10 : 0);
  riskScore = Math.max(10, Math.min(95, Math.round(riskScore)));

  // --- Build exec summary dynamically from findings ----------------------
  const tam = market?.marketSize.tam ?? 85_600_000_000;
  const sam = market?.marketSize.sam ?? 12_400_000_000;
  const som = market?.marketSize.som ?? 180_000_000;
  const growthRate = market?.marketSize.growthRate ?? growth;
  const currency = market?.marketSize.currency ?? "USD";
  const topCompetitor = competitors?.competitors[0]?.name ?? "established players";
  const topPain = pain?.painPoints[0]?.pain ?? "generic, undifferentiated output";
  const recChannel = channels?.recommendedChannels[0]?.channel ?? "Product Hunt + Twitter/X launch";
  const proTier = pricing?.recommendations.find((r) => /pro/i.test(r.tier))?.price ?? 39;
  const teamTier = pricing?.recommendations.find((r) => /team/i.test(r.tier))?.price ?? 129;

  function shortMoney(v: number, c: string = "USD"): string {
    const sym = c === "USD" ? "$" : c === "EUR" ? "€" : c === "GBP" ? "£" : c === "JPY" || c === "CNY" ? "¥" : c + " ";
    if (v >= 1_000_000_000) return `${sym}${(v / 1_000_000_000).toFixed(1)}B`;
    if (v >= 1_000_000) return `${sym}${(v / 1_000_000).toFixed(1)}M`;
    if (v >= 1_000) return `${sym}${(v / 1_000).toFixed(0)}K`;
    return `${sym}${v.toFixed(0)}`;
  }

  const execSummary = personalizeSummary(
    `The market for "${snippet}" shows strong signals: TAM estimated at ${shortMoney(tam, currency)} with ${growthRate.toFixed(1)}% annual growth, ` +
    `and research uncovered ${severePains} critical and ${commonPains} common pain points, including "${topPain}". ` +
    `The competitive landscape includes ${numCompetitors} tracked players (led by ${topCompetitor}), ` +
    `with ${numGaps} identifiable gaps${hardGaps < numGaps ? " (some requiring significant execution)" : ""}. ` +
    `Opportunity is scored ${opportunityScore}/100 with a risk profile of ${riskScore}/100. ` +
    `Recommended entry: price around ${shortMoney(proTier, currency)}/${shortMoney(teamTier, currency)} for pro/team tiers, ` +
    `launch via ${recChannel}.${kwStr ? " Focus areas: " + kwStr + "." : ""}`,
    query,
    keywords,
    5,
  );

  // --- Build opportunity/risk/insight lists -----------------------------
  const gapItems = (competitors?.gaps ?? []).slice(0, 3);
  const painItems = (pain?.painPoints ?? []).slice(0, 3);
  const trendItems = (market?.keyTrends ?? []).slice(0, 3);

  const topOpportunities: { title: string; description: string; rationale: string }[] = [];
  if (gapItems.length > 0) {
    topOpportunities.push({
      title: gapItems[0].gap,
      description: gapItems[0].opportunity,
      rationale: `Competitor gap identified (difficulty: ${gapItems[0].difficulty}). Addressing this creates immediate differentiation.`,
    });
  }
  if (painItems.length > 0) {
    topOpportunities.push({
      title: `Solve: ${painItems[0].pain.slice(0, 80)}`,
      description: painItems[0].quotes?.[0]?.text ?? "Key user pain identified across multiple sources.",
      rationale: `${painItems[0].frequency}/${painItems[0].severity} pain point with ${painItems[0].quotes?.length ?? 0} supporting quotes.`,
    });
  }
  if (pricing?.recommendations?.[0]) {
    const r = pricing.recommendations[0];
    topOpportunities.push({
      title: `Launch with ${r.tier} tier at ${shortMoney(r.price, pricing.priceBands?.[0]?.currency ?? "USD")}`,
      description: r.rationale,
      rationale: `Pricing recommendation benchmarked against ${pricing.competitorPricing.length} competitor pricing pages.`,
    });
  }
  while (topOpportunities.length < 3) {
    topOpportunities.push({
      title: "Evidence-based strategic AI",
      description: "Build decision support that cites sources and tracks evidence over time.",
      rationale: "Content AI is commoditized; strategic decision support remains underserved.",
    });
  }

  const topRisks: { title: string; description: string; mitigation: string }[] = [];
  if (negativeTrends > 0) {
    const t = trendItems.find((x) => x.impact === "negative");
    topRisks.push({
      title: "Headwind: " + (t?.trend ?? "Market headwinds"),
      description: t?.evidence ?? "Negative trend detected in market analysis.",
      mitigation: "Plan a moat that does not rely on this trend reversing; monitor quarterly.",
    });
  }
  topRisks.push({
    title: `Competition from ${numCompetitors}+ existing players`,
    description: `The category already has ${topCompetitor} and ${Math.max(0, numCompetitors - 1)} other tracked competitors.`,
    mitigation: `Differentiate through evidence-based outputs, tighter workflow, and the ${recChannel} community channels.`,
  });
  if (numCompetitors > 4) {
    topRisks.push({
      title: "Crowded category risk",
      description: "High competitor density makes organic discovery difficult.",
      mitigation: "Invest early in community-led growth and niche content; avoid paid acquisition until product-market fit is validated.",
    });
  } else {
    topRisks.push({
      title: "Quality expectations outpacing capability",
      description: "Users expect AI to replace analysts, but current models can only augment them.",
      mitigation: "Position as a co-pilot, not a replacement. Cite sources and be transparent about confidence.",
    });
  }

  const keyInsights = [
    {
      insight: growth >= 20
        ? `Market is growing rapidly (${growthRate.toFixed(1)}% CAGR) — favorable entry window`
        : `Market growth at ${growthRate.toFixed(1)}% suggests a mature category requiring sharp differentiation`,
      supportingAgents: ["market-sizer"] as AgentId[],
      confidence: (market?.citations.length ?? 0) >= 2 ? "high" as const : "medium" as const,
    },
    {
      insight: `${numCompetitors} competitors analyzed; ${numGaps} market gaps identified`,
      supportingAgents: ["competitor-analyst"] as AgentId[],
      confidence: "medium" as const,
    },
    {
      insight: `${severePains} critical, ${commonPains} common user pain points surface in voice-of-customer data`,
      supportingAgents: ["pain-detective"] as AgentId[],
      confidence: (pain?.citations.length ?? 0) >= 2 ? "high" as const : "medium" as const,
    },
    {
      insight: `Recommended pricing anchors around ${shortMoney(proTier, currency)} pro / ${shortMoney(teamTier, currency)} team`,
      supportingAgents: ["pricing-scout", "competitor-analyst"] as AgentId[],
      confidence: "medium" as const,
    },
  ];

  const recommendedNextStep =
    `Start with a focused ${recChannel.split(" ")[0]} launch targeting the "${painItems[0]?.pain?.slice(0, 60) ?? topPain}" pain point, ` +
    `priced at ${shortMoney(proTier, currency)}/mo, then iterate based on early-adopter feedback collected via the Research Studio evidence loop.`;

  const topCompList = (competitors?.competitors ?? []).slice(0, 3).map((c) => c.name).join(", ") || "existing tools";
  const citedPains = painItems.slice(0, 3).map((p, i) => `${i + 1}. ${p.pain}`).join("\n");
  const topChannels = (channels?.recommendedChannels ?? []).slice(0, 4).map((c, i) => `${i + 1}. ${c.channel} (${c.priority} priority)`).join("\n");
  const topGaps = gapItems.slice(0, 3).map((g, i) => `${i + 1}. ${g.gap}`).join("\n");

  const launchlensBrief = `# Market Research Brief

## Research Query
**Product idea:** ${query || "(none provided)"}
${kwStr ? `**Keywords:** ${kwStr}` : ""}

## Executive Summary
Generated by LaunchLens Research Studio — multi-agent market intelligence.

**Opportunity Score:** ${opportunityScore}/100
**Risk Score:** ${riskScore}/100

## Target Market
- TAM: ~${shortMoney(tam, currency)}
- SAM: ~${shortMoney(sam, currency)}
- SOM (3yr): ~${shortMoney(som, currency)}
- Growth: ${growthRate.toFixed(1)}% CAGR, ${market?.marketSize.growthTrend ?? "growing"}

## Competitive Landscape
Tracked competitors: ${topCompList}.
${numGaps > 0 ? "Identified gaps:\n" + topGaps : "The market is well-served by existing players."}

## Core User Pains
${citedPains || "1. Generic, undifferentiated output\n2. Tool fragmentation\n3. Idea validation gap"}

## Pricing
- Observed pro tier benchmark: ~${shortMoney(pricing?.priceBands?.[1]?.typical ?? 49, currency)}/month
- Observed team tier benchmark: ~${shortMoney(pricing?.priceBands?.[2]?.typical ?? 149, currency)}/month
- Recommendation: anchor at ${shortMoney(proTier, currency)}/${shortMoney(teamTier, currency)} pro/team

## Recommended Channels
${topChannels || "1. Product Hunt launch (high priority)\n2. Build-in-public (high priority)\n3. Content marketing (medium priority)"}

## Key Differentiation
- Evidence-based decision support with cited sources
- Cross-agent validation reduces hallucination risk
- Structured brief ready for GTM strategy import
`;

  const allCitations: SourceCitation[] = [];
  const seenIds = new Set<string>();
  for (const o of agentOutputs) {
    if ("citations" in o) {
      for (const c of (o as { citations: SourceCitation[] }).citations) {
        if (!seenIds.has(c.id)) {
          seenIds.add(c.id);
          allCitations.push(c);
        }
      }
    }
  }
  if (allCitations.length === 0) {
    allCitations.push(
      withTimestamp("cite-market-1"),
      withTimestamp("cite-comp-1"),
      withTimestamp("cite-pain-1"),
      withTimestamp("cite-price-1"),
      withTimestamp("cite-channel-1"),
    );
  }

  return {
    agent: "synthesis",
    execSummary,
    opportunityScore,
    riskScore,
    keyInsights,
    topThreeOpportunities: topOpportunities,
    topThreeRisks: topRisks,
    recommendedNextStep,
    launchlensBrief,
    citations: allCitations,
  };
}

export function generateMockAgentOutput(
  agentId: "market-sizer",
  query: string,
  keywords: string[],
  agentOutputs?: AgentOutput[],
): MarketSizerOutput;
export function generateMockAgentOutput(
  agentId: "competitor-analyst",
  query: string,
  keywords: string[],
  agentOutputs?: AgentOutput[],
): CompetitorAnalystOutput;
export function generateMockAgentOutput(
  agentId: "pain-detective",
  query: string,
  keywords: string[],
  agentOutputs?: AgentOutput[],
): PainDetectiveOutput;
export function generateMockAgentOutput(
  agentId: "pricing-scout",
  query: string,
  keywords: string[],
  agentOutputs?: AgentOutput[],
): PricingScoutOutput;
export function generateMockAgentOutput(
  agentId: "channel-scout",
  query: string,
  keywords: string[],
  agentOutputs?: AgentOutput[],
): ChannelScoutOutput;
export function generateMockAgentOutput(
  agentId: "synthesis",
  query: string,
  keywords: string[],
  agentOutputs?: AgentOutput[],
): SynthesisOutput;
export function generateMockAgentOutput(
  agentId: AgentId,
  query: string,
  keywords: string[],
  agentOutputs?: AgentOutput[],
): AgentOutput;
export function generateMockAgentOutput(
  agentId: AgentId,
  query: string,
  keywords: string[],
  agentOutputs?: AgentOutput[],
): AgentOutput {
  switch (agentId) {
    case "market-sizer":
      return generateMockMarketSizer(query, keywords);
    case "competitor-analyst":
      return generateMockCompetitorAnalyst(query, keywords);
    case "pain-detective":
      return generateMockPainDetective(query, keywords);
    case "pricing-scout":
      return generateMockPricingScout(query, keywords);
    case "channel-scout":
      return generateMockChannelScout(query, keywords);
    case "synthesis":
      return generateMockSynthesis(query, keywords, agentOutputs || []);
  }
}
