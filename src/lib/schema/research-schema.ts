// Core research types and schemas
// All research agents conform to these output schemas so the synthesis layer
// can reason across agent outputs with confidence.

import type { ResearchModeId } from "@/lib/research/research-modes";

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

/** Outcome of the optional retrieval step for one agent. */
export type EvidenceRetrievalStatus =
  | "not_requested"
  | "not_configured"
  | "retrieved"
  | "unavailable";

/**
 * `grounded` means at least one model citation was allowlisted against a
 * source retrieved for this run. It is deliberately not a factual-validation
 * claim: source/claim agreement still requires a later validation pass.
 */
export type EvidenceGroundingStatus = "grounded" | "ungrounded";

export interface EvidenceAllowlistStats {
  policy: "compatible" | "strict";
  total: number;
  matched: number;
  rejected: number;
  missingUrl: number;
  retained: number;
}

/** Serializable subset of a retrieval result retained with the session. */
export interface EvidenceSource extends SourceCitation {
  retrievedAt?: string;
  score?: number;
}

export interface AgentEvidenceLedgerEntry {
  agentId: AgentId;
  retrieval: {
    status: EvidenceRetrievalStatus;
    /** Direct agent retrieval, a synthesis union, or no source input. */
    sourceOrigin: "agent_retrieval" | "specialist_union" | "none";
    providerId?: string;
    focusedQuery?: string;
    /** All focused queries used by a fanned-out Deep retrieval. */
    focusedQueries?: string[];
    sourceCount: number;
    sources: EvidenceSource[];
    unavailableReason?: string;
  };
  allowlist: EvidenceAllowlistStats;
  grounding: EvidenceGroundingStatus;
  updatedAt: string;
}

/** Additive, versioned evidence provenance retained on new sessions. */
export interface EvidenceLedger {
  version: 1;
  agents: Partial<Record<AgentId, AgentEvidenceLedgerEntry>>;
}

export interface ValidationStructuralSections {
  specialists: {
    expected: 5;
    completedWithOutput: number;
    failed: number;
    incomplete: number;
    status: "complete" | "partial" | "none";
  };
  urlAllowlist: {
    status: "not_run" | "matched" | "matched_with_rejections" | "no_matches";
    strictAgentCount: number;
    compatibleAgentCount: number;
    matched: number;
    rejected: number;
    missingUrl: number;
    groundedAgentCount: number;
    interpretation: "url_membership_only";
  };
  sourceDiversity: {
    status: "not_available" | "single_domain" | "multiple_domains";
    uniqueSourceCount: number;
    uniqueDomainCount: number;
    interpretation: "descriptive_only";
  };
  citationCoverage: {
    status: "not_available" | "complete" | "partial";
    outputsEvaluated: number;
    outputsWithCitations: number;
    topLevelCitations: number;
    citationsWithHttpUrl: number;
    nestedReferences: number;
    resolvedNestedReferences: number;
    unresolvedNestedReferences: number;
    interpretation: "structural_presence_and_id_resolution_only";
  };
  provenance: {
    status:
      | "none_observed"
      | "mock_outputs_present"
      | "degraded_outputs_present"
      | "mock_and_degraded_outputs_present";
    mockAgents: AgentId[];
    degradedAgents: AgentId[];
    interpretation: "execution_provenance_only";
  };
}

/**
 * The original structural evidence-integrity snapshot. Its semantics are
 * intentionally frozen: V1 proves structural/provenance properties only and
 * must never be interpreted as factual or claim-to-source validation.
 */
export interface ValidationLedgerV1 extends ValidationStructuralSections {
  version: 1;
  generatedAt: string;
  /** `pre_synthesis` is produced once all specialists have settled. */
  stage: "pre_synthesis" | "final";
  protocol: {
    requestedMode: ResearchModeId;
    /** Standard currently executes exactly one structural pass. */
    executedPasses: 1;
    passKind: "structural_evidence_integrity";
    /** Deep remains preview-only; no three-pass protocol is claimed here. */
    deepMultiPassExecuted: false;
  };
  semanticValidation: {
    status: "not_run";
    claimToSourceEntailment: false;
    factualAccuracy: false;
    sourceReliability: false;
    statement: string;
  };
  /** Compact, source-content-free context consumed by the synthesis prompt. */
  synthesisSummary: string;
}

export const DEEP_VALIDATION_PASS_KINDS = [
  "claim_source_entailment",
  "independent_corroboration_conflict",
  "adjudication",
] as const;

export type DeepValidationPassKind = (typeof DEEP_VALIDATION_PASS_KINDS)[number];
export type ClaimReviewPassKind = Exclude<DeepValidationPassKind, "adjudication">;

export type ResearchClaimKind =
  | "market_metric"
  | "competitor"
  | "pain"
  | "pricing"
  | "channel"
  | "recommendation";

/**
 * A stable, bounded claim extracted from one persisted specialist output.
 * `valueHash` lets later stages reject reviews of a claim whose value changed.
 */
export interface ResearchClaim {
  id: string;
  agentId: Exclude<AgentId, "synthesis">;
  fieldPath: string;
  text: string;
  kind: ResearchClaimKind;
  criticality: "decision_critical" | "material";
  sourceIds: string[];
  valueHash: string;
}

export type ClaimReviewSourceOrigin =
  | "agent_citation"
  | "retrieved_evidence"
  | "independent_retrieval";

/** A source admitted by a trusted retrieval/citation boundary for review. */
export interface ClaimReviewSource extends SourceCitation {
  origin: ClaimReviewSourceOrigin;
  /** Required for independently retrieved evidence; binds it to reviewed claims. */
  claimIds?: string[];
}

export interface ClaimReviewerIdentity {
  reviewerId: string;
  providerId: string;
  model?: string;
  promptVersion: string;
}

export type ClaimReviewVerdict =
  | "entailed"
  | "partially_entailed"
  | "not_entailed"
  | "corroborated"
  | "contradicted"
  | "mixed"
  | "insufficient_evidence";

export interface ClaimReviewFinding {
  claimId: string;
  /** Hash copied from the reviewed claim; stale findings are discarded. */
  claimValueHash: string;
  pass: ClaimReviewPassKind;
  reviewer: ClaimReviewerIdentity;
  verdict: ClaimReviewVerdict;
  confidence: ConfidenceLevel;
  supportingSourceIds: string[];
  contradictingSourceIds: string[];
  rationale: string;
}

export type ClaimDisposition =
  | "supported"
  | "partially_supported"
  | "conflicted"
  | "unsupported"
  | "insufficient_evidence";

export interface ClaimAdjudication {
  claimId: string;
  /** Hash copied from the adjudicated claim; stale results are discarded. */
  claimValueHash: string;
  reviewer: ClaimReviewerIdentity;
  disposition: ClaimDisposition;
  confidence: ConfidenceLevel;
  supportingSourceIds: string[];
  contradictingSourceIds: string[];
  reviewedPasses: DeepValidationPassKind[];
  /** Derived by the application; reviewer-provided values are not trusted. */
  synthesisEligible: boolean;
  limitations: string[];
}

export interface ClaimAdjudicationCounts {
  totalClaims: number;
  adjudicated: number;
  unreviewed: number;
  supported: number;
  partiallySupported: number;
  conflicted: number;
  unsupported: number;
  insufficientEvidence: number;
  synthesisEligible: number;
}

/**
 * Deep validation is a claim/evidence support review, not a guarantee that an
 * external-world fact is true. The explicit `not_established` value preserves
 * that boundary even after all three passes complete.
 */
export interface ValidationLedgerV2 extends ValidationStructuralSections {
  version: 2;
  generatedAt: string;
  stage: "pre_synthesis" | "final";
  protocol: {
    requestedMode: "deep";
    plannedPasses: 3;
    executedPasses: 0 | 1 | 2 | 3;
    passKinds: [
      "claim_source_entailment",
      "independent_corroboration_conflict",
      "adjudication",
    ];
    completedPassKinds: DeepValidationPassKind[];
    deepMultiPassExecuted: boolean;
  };
  claims: ResearchClaim[];
  reviewSources: ClaimReviewSource[];
  findings: ClaimReviewFinding[];
  adjudications: ClaimAdjudication[];
  adjudicationCounts: ClaimAdjudicationCounts;
  semanticValidation: {
    status: "pending" | "in_progress" | "completed" | "partial" | "failed";
    scope: "claim_evidence_support";
    totalPasses: 3;
    completedPasses: DeepValidationPassKind[];
    progress: number;
    reviewedClaimCount: number;
    adjudicatedClaimCount: number;
    reviewerDiversityCount: number;
    factualAccuracy: "not_established";
    sourceReliability: "not_assessed" | "assessed_not_proven";
    statement: string;
  };
  /** Compact, source-content-free context consumed by the synthesis prompt. */
  synthesisSummary: string;
  /**
   * Optional metadata about the targeted gap-fill pass that runs between
   * semantic_pass_1 and semantic_pass_2. Present only when the gap-fill
   * work unit actually executed and added targeted retrieval sources.
   * Older V2 ledgers persisted before this field shipped remain valid
   * verbatim because this field is purely additive.
   */
  gapFill?: {
    completedAt: string;
    targetedClaimIds: readonly string[];
    sourcesAdded: number;
    targetedClaimCount: number;
  };
}

/** Version is the discriminant; persisted V1 dossiers remain valid verbatim. */
export type ValidationLedger = ValidationLedgerV1 | ValidationLedgerV2;

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
  recommendations: {
    tier: string;
    price: number;
    rationale: string;
    // R214: PricingScoutReport reads `rec.period` to label the price line
    // (e.g. "per user / month"). Previously the field existed only in the
    // UI; the schema didn't expose it and the normalizer didn't produce it,
    // so every run fell through to the hardcoded "per user / month" label.
    period?: "monthly" | "yearly" | "one-time" | "usage";
  }[];
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
  /** R203: which provider actually produced this agent's output. Differs from
   *  the requested provider when the breaker flipped to mock or the real
   *  provider call failed. UI uses this to surface a "demo data" badge. */
  resolvedProviderId?: string;
  /** R203: true if the real provider was bypassed and the output is
   *  illustrative (mock or breaker-fallback). The data is still useful for
   *  demos, but the user should know it's not authoritative. */
  degraded?: boolean;
  /** R203: short human-readable reason for the degradation.
   *  - "provider_fallback" / "breaker_open": R203 reasons (outer engine path).
   *  - "http_error" / "network_error" / "parse_error" / "validation_error" /
   *    "empty_response": R204 reasons reported by the provider's own
   *    onFallback callback when it silently degrades to mock internally. */
  degradedReason?:
    | "provider_fallback"
    | "breaker_open"
    | "http_error"
    | "network_error"
    | "parse_error"
    | "validation_error"
    | "empty_response";
}

export interface ResearchSession {
  id: string;
  query: string;
  keywords: string[];
  /** Research protocol selected when the session was created.
   *  Optional only for snapshots persisted before mode support shipped. */
  mode?: ResearchModeId;
  /** Persona/agent style ID that shapes all research outputs */
  personaId?: string;
  /** Optional privacy-safe user-test labels used to connect Stage 2 funnel evidence.
   *  Values are short pseudonymous labels such as P01 / pilot-1; analytics sinks
   *  hash them before persistence and must not store names, emails, or contact data. */
  stage2Tracking?: {
    stage2Participant?: string;
    stage2Batch?: string;
  };
  /** Provider id used for the run ("mock", "openai", "anthropic").
   *  Captured at run start so history records the actual provider, not a
   *  hardcoded "mock" placeholder. */
  providerId?: string;
  /** Model id used by the provider, when the provider exposes one. */
  providerModel?: string;
  createdAt: string;
  updatedAt: string;
  status: "pending" | "running" | "completed" | "error" | "cancelled";
  agents: Record<AgentId, AgentState>;
  citations: SourceCitation[];
  /** Optional so sessions persisted before evidence capture remain readable. */
  evidence?: EvidenceLedger;
  /** Optional so sessions persisted before structural validation remain readable. */
  validation?: ValidationLedger;
}

export interface ResearchEvent {
  type: "status" | "progress" | "step" | "output" | "error" | "complete" | "cancelled" | "closed";
  agentId?: AgentId;
  timestamp: string;
  data?: unknown;
  message?: string;
  /** Optional machine-readable reason for terminal/closed events. */
  reason?: "completed" | "cancelled" | "error" | "deleted" | "not-found";
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
