# Research Agents

This document describes each research agent in the LaunchLens Research Studio — their purpose, output schema, research steps, and how they fit together.

---

## Agent Overview

Research Studio uses a **5 + 1** agent architecture:

- **5 Research Agents** run in parallel, each specializing in one dimension of market intelligence
- **1 Synthesis Agent** runs after all research agents complete, cross-validates findings, and produces a unified executive brief

```
                    ┌─────────────────────────────────┐
                    │         Product Query           │
                    └─────────────────┬───────────────┘
                                      │
         ┌──────────────┬─────────────┼──────────────┬──────────────┬──────────────┐
         ▼              ▼             ▼              ▼              ▼              ▼
   ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐
   │  Market  │  │Competitor│  │   Pain   │  │ Pricing  │  │ Channel  │
   │  Sizer   │  │ Analyst  │  │ Detective│  │  Scout   │  │  Scout   │
   └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘
        │              │             │              │              │
        └──────────────┴─────────────┼──────────────┴──────────────┘
                                     ▼
                          ┌─────────────────────┐
                          │   Synthesis Agent   │
                          └──────────┬──────────┘
                                     ▼
                          ┌─────────────────────┐
                          │   Unified Report    │
                          │  + launchlens Brief │
                          └─────────────────────┘
```

---

## 1. Market Sizer 📊

**Purpose**: Quantify the market opportunity with TAM/SAM/SOM estimates and growth trends.

### Output Schema (`MarketSizerOutput`)

| Field | Type | Description |
|-------|------|-------------|
| `marketSize` | `MarketSizeEstimate` | TAM, SAM, SOM, growth rate, currency, confidence |
| `keyTrends` | `Trend[]` | Market trends with positive/negative/neutral impact |
| `targetSegments` | `Segment[]` | Key customer segments with size estimates |
| `citations` | `SourceCitation[]` | All sources with confidence levels |

### Research Steps

1. Defining market boundaries and scope
2. Gathering TAM data from industry reports
3. Calculating SAM and SOM with segmentation
4. Analyzing growth trends and market velocity
5. Cross-referencing data sources for confidence
6. Synthesizing market size estimates

---

## 2. Competitor Analyst 🏆

**Purpose**: Map the competitive landscape, identify gaps, and benchmark positioning.

### Output Schema (`CompetitorAnalystOutput`)

| Field | Type | Description |
|-------|------|-------------|
| `competitors` | `Competitor[]` | 5-8 key competitors with strengths/weaknesses |
| `competitiveMatrix` | `MatrixDimension[]` | Feature/positioning comparison matrix |
| `gaps` | `Gap[]` | Market gaps with opportunity and difficulty |
| `citations` | `SourceCitation[]` | All sources with confidence levels |

### Research Steps

1. Identifying direct and indirect competitors
2. Scraping competitor positioning and pricing
3. Building competitive feature matrix
4. Analyzing strengths and weaknesses
5. Mapping market gaps and white space
6. Validating findings across sources

---

## 3. Pain Detective 💬

**Purpose**: Uncover user pain points and unmet needs from real voice-of-customer data.

### Output Schema (`PainDetectiveOutput`)

| Field | Type | Description |
|-------|------|-------------|
| `painPoints` | `PainPoint[]` | Ranked pain points with frequency, severity, quotes |
| `unmetNeeds` | `UnmetNeed[]` | Unmet needs with opportunity analysis |
| `userPersonas` | `Persona[]` | User personas derived from pain patterns |
| `citations` | `SourceCitation[]` | All sources with confidence levels |

### Research Steps

1. Scanning forums and communities for discussions
2. Collecting user reviews and comments
3. Clustering pain points by frequency and severity
4. Extracting representative quotes
5. Identifying unmet needs and opportunity areas
6. Building user personas from pain point patterns

---

## 4. Pricing Scout 💰

**Purpose**: Analyze pricing landscape and recommend optimal pricing strategy.

### Output Schema (`PricingScoutOutput`)

| Field | Type | Description |
|-------|------|-------------|
| `priceBands` | `PriceBand[]` | Budget/mid-market/premium price ranges |
| `competitorPricing` | `CompetitorPricing[]` | Detailed competitor tier pricing |
| `monetizationModels` | `MonetizationModel[]` | Model prevalence and examples |
| `willingnessToPay` | `WTPEstimate[]` | WTP by segment with confidence |
| `recommendations` | `PricingRec[]` | Tiered pricing recommendations |
| `citations` | `SourceCitation[]` | All sources with confidence levels |

### Research Steps

1. Collecting competitor pricing pages
2. Mapping price bands and tier structures
3. Analyzing monetization model prevalence
4. Estimating willingness to pay by segment
5. Benchmarking against category norms
6. Formulating pricing recommendations

---

## 5. Channel Scout 🚀

**Purpose**: Identify the best acquisition channels and community hubs for reaching the target audience.

### Output Schema (`ChannelScoutOutput`)

| Field | Type | Description |
|-------|------|-------------|
| `channels` | `Channel[]` | All channels with reach, cost, effectiveness |
| `communityHubs` | `CommunityHub[]` | Forums, subreddits, Discord servers |
| `contentTopics` | `ContentTopic[]` | SEO topics with volume and competition |
| `recommendedChannels` | `ChannelRec[]` | Prioritized channel recommendations |
| `citations` | `SourceCitation[]` | All sources with confidence levels |

### Research Steps

1. Mapping acquisition channel landscape
2. Scanning community hubs and forums
3. Analyzing content topic search volume
4. Evaluating paid channel competitiveness
5. Assessing channel cost and effectiveness
6. Prioritizing channels by expected ROI

---

## 6. Synthesis Agent 🧠

**Purpose**: Cross-validate all research agent outputs and produce a unified, actionable report.

### What It Does

- Collects outputs from all 5 research agents
- Cross-validates findings (e.g., pain points ↔ competitor gaps)
- Assigns confidence levels based on multi-agent agreement
- Calculates opportunity score and risk score (0-100)
- Generates an executive summary
- Produces a `launchlensBrief` importable into launchlens-ai

### Output Schema (`SynthesisOutput`)

| Field | Type | Description |
|-------|------|-------------|
| `execSummary` | `string` | 2-3 paragraph executive summary |
| `opportunityScore` | `number (0-100)` | Overall opportunity attractiveness |
| `riskScore` | `number (0-100)` | Overall risk/execution difficulty |
| `keyInsights` | `Insight[]` | Top insights with supporting agents + confidence |
| `topThreeOpportunities` | `Opportunity[]` | Highest-leverage opportunities |
| `topThreeRisks` | `Risk[]` | Biggest risks with mitigation |
| `recommendedNextStep` | `string` | Single most impactful next action |
| `launchlensBrief` | `string` | Free-text brief (legacy, not importable). The structured, importable brief is derived by `toLaunchLensBrief()` in `src/lib/export/brief-mapper.ts`, which maps the six agents' outputs to launchlens-ai's five-field `LaunchLensInput` (`idea`/`audience`/`market`/`tone`/`constraints`, each ≤1200 chars). Available via the Export panel and `GET /api/research/[sessionId]/brief`. For Deep sessions, the mapper fail-closes when validation is absent/incomplete and gates synthesis prose/scores on evidence sufficiency. |
| `citations` | `SourceCitation[]` | All citations, deduplicated |

### Research Steps

1. Collecting outputs from all research agents
2. Cross-validating findings across agents
3. Identifying highest-confidence insights
4. Assessing opportunity and risk scores
5. Synthesizing executive summary
6. Generating importable launch brief

---

## Shared Concepts

### Source Citation System

Every claim in every agent output traces back to a `SourceCitation`:

```typescript
interface SourceCitation {
  id: string;           // unique citation ID
  title: string;        // source title
  url?: string;         // source URL (if online)
  snippet: string;      // relevant quote/excerpt
  accessedAt: string;   // ISO timestamp
  confidence: "low" | "medium" | "high";
  agent: AgentId;       // which agent found this
}
```

### Confidence Levels

- **High**: Multiple independent sources agree, data is recent and specific
- **Medium**: Single reliable source, or multiple sources with partial agreement
- **Low**: Anecdotal evidence, outdated data, or extrapolated estimates

### Agent Execution Order

1. Research agents **run in parallel** (Market Sizer, Competitor Analyst, Pain Detective, Pricing Scout, Channel Scout)
2. Synthesis agent **runs last**, with access to all research outputs
3. Total runtime: ~5-10 seconds with mock data, variable with real providers

