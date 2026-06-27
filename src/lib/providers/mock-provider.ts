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
): SynthesisOutput {
  return {
    agent: "synthesis",
    execSummary: personalizeSummary("The AI-powered go-to-market tool space is large (TAM ~$85B) and growing rapidly (26.5% CAGR). While the market is crowded with content-generation tools, there is a clear gap for strategic, evidence-based decision support tools that span the full GTM lifecycle. The strongest opportunity lies in serving solo founders and small SaaS teams who need sharp execution help before overbuilding. Main risks are market commoditization, distribution challenges, and rising quality expectations.", query, keywords, 5),
    opportunityScore: 72,
    riskScore: 58,
    keyInsights: [
      {
        insight: "Content AI is commoditized; strategic AI is wide open",
        supportingAgents: ["competitor-analyst", "pain-detective"],
        confidence: "high",
      },
      {
        insight: "Validation before building is the top unmet need for founders",
        supportingAgents: ["pain-detective", "market-sizer"],
        confidence: "medium",
      },
      {
        insight: "Pricing can undercut incumbents while maintaining quality signal",
        supportingAgents: ["pricing-scout", "competitor-analyst"],
        confidence: "medium",
      },
      {
        insight: "Community-led growth is the most viable GTM channel for AI tools",
        supportingAgents: ["channel-scout"],
        confidence: "high",
      },
    ],
    topThreeOpportunities: [
      {
        title: "Evidence-based strategic AI",
        description:
          "Move beyond generic content generation to decision support that cites sources, tracks evidence, and builds confidence over time.",
        rationale:
          "All agents confirm this gap. Competitors focus on content; users want strategy. High differentiation potential.",
      },
      {
        title: "Founder-focused workspace approach",
        description:
          "An integrated workspace covering research to strategy to execution, rather than another point tool.",
        rationale:
          "Tool fragmentation is a top pain point. A single GTM workspace creates lock-in and compounding value.",
      },
      {
        title: "Product-market fit validation layer",
        description:
          "A dedicated validation loop that helps founders test ideas before committing to building.",
        rationale:
          "The validation gap is severe and underserved. Saving founders months of building the wrong thing is highly valuable.",
      },
    ],
    topThreeRisks: [
      {
        title: "Market commoditization",
        description:
          "As base models improve and become cheaper, the bar for AI-powered features keeps rising.",
        mitigation:
          "Differentiate on workflow depth, evidence loop, and data flywheel - not raw generation quality.",
      },
      {
        title: "Distribution in a crowded market",
        description:
          "Hundreds of AI tools launch every week. Standing out is harder than building.",
        mitigation:
          "Double down on community-led growth, build-in-public, and niche content angles.",
      },
      {
        title: "Quality expectations outpacing capability",
        description:
          "Users expect AI to replace strategists, but current models can only augment them.",
        mitigation:
          "Set honest expectations. Position as a co-pilot, not a replacement. Lean into the evidence loop for gradual trust.",
      },
    ],
    recommendedNextStep:
      "Start with the research-to-brief workflow. Build a strong research studio that produces high-quality, well-sourced market intelligence, then feed it directly into the GTM workspace.",
    launchlensBrief: `# Market Research Brief

## Executive Summary
Generated by LaunchLens Research Studio - multi-agent market intelligence.

**Opportunity Score:** 72/100
**Risk Score:** 58/100

## Target Market
- TAM: ~$85.6B (AI in marketing, 2030 projection)
- SAM: ~$12.4B
- SOM: ~$180M (3-year target)
- Growth: 26.5% CAGR, accelerating

## Competitive Landscape
Crowded but fragmented. Key players: Jasper, Copy.ai, Notion AI.
Most focus on content generation, not strategic planning.

## Core User Pains
1. Generic, undifferentiated AI output
2. Tool fragmentation (7+ tools, no integration)
3. Difficulty validating ideas before building

## Pricing
- Pro tier benchmark: $49/month
- Team tier benchmark: $149/month
- Recommendation: Price at $39/$129 to undercut while signaling quality

## Recommended Channels
1. Product Hunt launch (high priority)
2. Build-in-public on Twitter/X (high priority)
3. Content marketing - niche angles (medium priority)
4. Indie Hackers community (medium priority)

## Key Differentiation
- Evidence-based decision support, not just content
- Full GTM lifecycle workspace
- Validation loop that builds confidence over time
`,
    citations: [
      withTimestamp("cite-market-1"),
      withTimestamp("cite-comp-1"),
      withTimestamp("cite-pain-1"),
      withTimestamp("cite-price-1"),
      withTimestamp("cite-channel-1"),
    ],
  };
}

export function generateMockAgentOutput(
  agentId: AgentId,
  query: string,
  keywords: string[],
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- reserved for future synthesis cross-agent reasoning
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
      return generateMockSynthesis(query, keywords);
  }
}
