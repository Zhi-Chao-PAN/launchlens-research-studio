// Core research types and schemas
// All research agents conform to these output schemas so the synthesis layer
// can reason across agent outputs with confidence.

export type AgentId =
  | "market-sizer"
  | "competitor-analyst"
  | "pain-detective"
  | "pricing-scout"
  | "channel-scout"
  | "synthesis";

export type AgentStatus = "idle" | "running" | "done" | "error";

export type ConfidenceLevel = "low" | "medium" | "high";

export interface SourceCitation {
  id: string;
  title: string;
  url?: string;
  snippet: string;
  accessedAt: string;
  confidence: ConfidenceLevel;
  agent: AgentId;
}

// ---------- Market Sizer ----------

export interface MarketSizeEstimate {
  tam: number; // total addressable market, USD/yr
  sam: number; // serviceable addressable market
  som: number; // serviceable obtainable market (3yr)
  currency: string;
  growthRate: number; // annual %
  growthTrend: "accelerating" | "stable" | "declining";
  unit: "users" | "revenue" | "businesses";
  sources: string[]; // citation ids
  confidence: ConfidenceLevel;
}

export interface MarketSizerOutput {
  agent: "market-sizer";
  summary: string;
  marketSize: MarketSizeEstimate;
  keyTrends: { trend: string; impact: "positive" | "negative" | "neutral"; evidence: string }[];
  targetSegments: { name: string; size: number; description: string }[];
  citations: SourceCitation[];
}

// ---------- Competitor Analyst ----------

export interface Competitor {
  id: string;
  name: string;
  tagline: string;
  url?: string;
  strengths: string[];
  weaknesses: string[];
  pricing: { min: number; max: number; model: string; currency: string };
  marketShare?: number;
  positioning: "premium" | "mid-market" | "budget" | "niche";
  differentiation: string;
  citations: string[];
}

export interface CompetitorAnalystOutput {
  agent: "competitor-analyst";
  summary: string;
  competitors: Competitor[];
  competitiveMatrix: { dimension: string; players: { name: string; score: number }[] }[];
  gaps: { gap: string; opportunity: string; difficulty: "low" | "medium" | "high" }[];
  citations: SourceCitation[];
}

// ---------- Pain Detective ----------

export interface PainPoint {
  id: string;
  pain: string;
  frequency: "common" | "occasional" | "rare";
  severity: "critical" | "significant" | "mild";
  quotes: { text: string; source: string }[];
  userSegments: string[];
  citations: string[];
}

export interface PainDetectiveOutput {
  agent: "pain-detective";
  summary: string;
  painPoints: PainPoint[];
  unmetNeeds: { need: string; whyUnmet: string; opportunity: string }[];
  userPersonas: { name: string; role: string; goals: string[]; frustrations: string[] }[];
  citations: SourceCitation[];
}

// ---------- Pricing Scout ----------

export interface PricePoint {
  tier: string;
  price: number;
  currency: string;
  period: "monthly" | "yearly" | "one-time" | "usage";
  features: string[];
  target: string;
}

export interface PricingScoutOutput {
  agent: "pricing-scout";
  summary: string;
  priceBands: { name: string; min: number; max: number; typical: number; currency: string }[];
  competitorPricing: { competitor: string; tiers: PricePoint[] }[];
  monetizationModels: { model: string; prevalence: number; examples: string[] }[];
  willingnessToPay: { segment: string; estimate: number; confidence: ConfidenceLevel }[];
  recommendations: { tier: string; price: number; rationale: string }[];
  citations: SourceCitation[];
}

// ---------- Channel Scout ----------

export interface Channel {
  name: string;
  category: "social" | "community" | "content" | "paid" | "partnership" | "direct";
  reach: "niche" | "moderate" | "broad";
  cost: "low" | "medium" | "high";
  effectiveness: "unknown" | "low" | "medium" | "high";
  audience: string;
  keyPlatforms: string[];
  notes: string;
}

export interface ChannelScoutOutput {
  agent: "channel-scout";
  summary: string;
  channels: Channel[];
  communityHubs: { name: string; platform: string; size: string; focus: string; url?: string }[];
  contentTopics: { topic: string; searchVolume: "low" | "medium" | "high"; competition: "low" | "medium" | "high" }[];
  recommendedChannels: { channel: string; priority: "high" | "medium" | "low"; why: string }[];
  citations: SourceCitation[];
}

// ---------- Synthesis ----------

export interface SynthesisOutput {
  agent: "synthesis";
  execSummary: string;
  opportunityScore: number; // 0-100
  riskScore: number; // 0-100
  keyInsights: { insight: string; supportingAgents: AgentId[]; confidence: ConfidenceLevel }[];
  topThreeOpportunities: { title: string; description: string; rationale: string }[];
  topThreeRisks: { title: string; description: string; mitigation: string }[];
  recommendedNextStep: string;
  launchlensBrief: string; // can be imported into launchlens-ai
  citations: SourceCitation[];
}

// ---------- Research Session ----------

export type AgentOutput =
  | MarketSizerOutput
  | CompetitorAnalystOutput
  | PainDetectiveOutput
  | PricingScoutOutput
  | ChannelScoutOutput
  | SynthesisOutput;

export interface AgentState {
  id: AgentId;
  status: AgentStatus;
  progress: number; // 0-100
  currentStep: string;
  startedAt?: string;
  completedAt?: string;
  error?: string;
  output?: AgentOutput;
}

export interface ResearchSession {
  id: string;
  query: string;
  keywords: string[];
  /** Persona/agent style ID that shapes all research outputs */
  personaId?: string;
  createdAt: string;
  updatedAt: string;
  status: "pending" | "running" | "completed" | "error" | "cancelled";
  agents: Record<AgentId, AgentState>;
  citations: SourceCitation[];
}

export interface ResearchEvent {
  type: "status" | "progress" | "step" | "output" | "error" | "complete";
  agentId: AgentId;
  timestamp: string;
  data?: unknown;
  message?: string;
}

export const AGENT_METADATA: Record<AgentId, { name: string; icon: string; description: string; order: number }> = {
  "market-sizer": {
    name: "Market Sizer",
    icon: "📊",
    description: "TAM/SAM/SOM estimates, growth trends, market segments",
    order: 0,
  },
  "competitor-analyst": {
    name: "Competitor Analyst",
    icon: "🏆",
    description: "Competitive landscape, gaps, positioning matrix",
    order: 1,
  },
  "pain-detective": {
    name: "Pain Detective",
    icon: "💬",
    description: "User pain points, unmet needs, real voice-of-customer",
    order: 2,
  },
  "pricing-scout": {
    name: "Pricing Scout",
    icon: "💰",
    description: "Price bands, monetization models, willingness to pay",
    order: 3,
  },
  "channel-scout": {
    name: "Channel Scout",
    icon: "🚀",
    description: "Acquisition channels, community hubs, content topics",
    order: 4,
  },
  synthesis: {
    name: "Synthesis",
    icon: "🧠",
    description: "Cross-agent validation, executive summary, importable brief",
    order: 5,
  },
};

export const RESEARCH_AGENTS: AgentId[] = [
  "market-sizer",
  "competitor-analyst",
  "pain-detective",
  "pricing-scout",
  "channel-scout",
];


// ---------- Pure runtime helpers (side-effect free) ----------

const AGENT_ID_SET: ReadonlySet<string> = new Set<string>([
  "market-sizer",
  "competitor-analyst",
  "pain-detective",
  "pricing-scout",
  "channel-scout",
  "synthesis",
]);

const CONFIDENCE_SET: ReadonlySet<string> = new Set<string>(["low", "medium", "high"]);

export function isAgentId(value: unknown): value is AgentId {
  return typeof value === "string" && AGENT_ID_SET.has(value);
}

export function isConfidenceLevel(value: unknown): value is ConfidenceLevel {
  return typeof value === "string" && CONFIDENCE_SET.has(value);
}

export const CONFIDENCE_LEVELS: readonly ConfidenceLevel[] = ["low", "medium", "high"] as const;

/** Returns a stable ordering comparator for AgentId based on AGENT_METADATA.order. */
export function compareAgentsByOrder(a: AgentId, b: AgentId): number {
  return AGENT_METADATA[a].order - AGENT_METADATA[b].order;
}

/** AgentId values in declared execution order (synthesis last). */
export function agentIdsByOrder(): AgentId[] {
  return (Object.keys(AGENT_METADATA) as AgentId[]).slice().sort(compareAgentsByOrder);
}

/** Research-only agent ids (excludes synthesis). */
export function researchAgentIds(): AgentId[] {
  return RESEARCH_AGENTS.slice().sort(compareAgentsByOrder);
}

export function createEmptyAgentState(id: AgentId): AgentState {
  return {
    id,
    status: "idle",
    progress: 0,
    currentStep: "",
  };
}

/** Create an empty agents record keyed by every AgentId. */
export function createEmptyAgentsRecord(): Record<AgentId, AgentState> {
  const out = {} as Record<AgentId, AgentState>;
  for (const id of Object.keys(AGENT_METADATA) as AgentId[]) {
    out[id] = createEmptyAgentState(id);
  }
  return out;
}

export interface SessionSummary {
  totalAgents: number;
  completed: number;
  running: number;
  errored: number;
  idle: number;
  progressPercent: number; // 0..100, average progress across agents
  isFinished: boolean;
}

export function summarizeSession(session: Pick<ResearchSession, "agents" | "status">): SessionSummary {
  const ids = Object.keys(session.agents) as AgentId[];
  let done = 0;
  let running = 0;
  let errored = 0;
  let idle = 0;
  let progressSum = 0;
  for (const id of ids) {
    const a = session.agents[id];
    progressSum += Math.max(0, Math.min(100, a.progress || 0));
    if (a.status === "done") done++;
    else if (a.status === "running") running++;
    else if (a.status === "error") errored++;
    else idle++;
  }
  const total = ids.length;
  return {
    totalAgents: total,
    completed: done,
    running,
    errored,
    idle,
    progressPercent: total === 0 ? 0 : Math.round(progressSum / total),
    isFinished: session.status === "completed" || session.status === "error" || session.status === "cancelled",
  };
}

/** Map an opportunityScore 0..100 to a bucket label. */
export function scoreLabel(score: number): "poor" | "fair" | "good" | "strong" {
  if (!Number.isFinite(score)) return "poor";
  if (score < 35) return "poor";
  if (score < 60) return "fair";
  if (score < 80) return "good";
  return "strong";
}

/** Type guard for SourceCitation shape (structural, not deep). */
export function isSourceCitation(value: unknown): value is SourceCitation {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    typeof v.title === "string" &&
    typeof v.snippet === "string" &&
    typeof v.accessedAt === "string" &&
    isConfidenceLevel(v.confidence) &&
    isAgentId(v.agent)
  );
}

/** Clamp a progress value to integer 0..100. */
export function clampProgress(p: number): number {
  if (!Number.isFinite(p)) return 0;
  if (p < 0) return 0;
  if (p > 100) return 100;
  return Math.round(p);
}
