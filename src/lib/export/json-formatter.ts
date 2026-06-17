// JSON formatter for research reports
// Produces a stable, versioned export schema suitable for downstream tooling,
// persistence, and re-import.

import type {
  AgentId,
  AgentOutput,
  ResearchSession,
  SourceCitation,
} from "@/lib/schema/research-schema";

export const EXPORT_SCHEMA_VERSION = "1.0.0";

export interface ResearchExport {
  schemaVersion: string;
  exportedAt: string;
  source: "launchlens-research-studio";
  session: {
    id: string;
    query: string;
    keywords: string[];
    createdAt: string;
    updatedAt: string;
    status: ResearchSession["status"];
    agentStatuses: Record<AgentId, { status: string; progress: number; hasOutput: boolean; currentStep: string }>;
  };
  meta: {
    completedAgents: AgentId[];
    totalCitations: number;
    highConfidenceCitations: number;
    mediumConfidenceCitations: number;
    lowConfidenceCitations: number;
  };
  notes?: {
    personalNote: string;
    tags: string[];
    rating: number;
    isStarred: boolean;
    isArchived: boolean;
    updatedAt?: number;
    lastOpenedAt?: number;
  };
  outputs: Record<AgentId, AgentOutput | null>;
  citations: SourceCitation[];
}

export function buildResearchExport(
  session: Pick<ResearchSession, "id" | "query" | "keywords" | "createdAt" | "updatedAt" | "status" | "agents" | "citations">,
  outputs: Record<AgentId, AgentOutput | null>,
  notes?: {
    personalNote: string;
    tags: string[];
    rating: number;
    isStarred: boolean;
    isArchived: boolean;
    updatedAt?: number;
    lastOpenedAt?: number;
  },
): ResearchExport {
  const completedAgents: AgentId[] = [];
  const agentStatuses: ResearchExport["session"]["agentStatuses"] = {} as ResearchExport["session"]["agentStatuses"];

  for (const [id, state] of Object.entries(session.agents) as [AgentId, ResearchSession["agents"][AgentId]][]) {
    agentStatuses[id] = {
      status: state.status,
      progress: state.progress,
      hasOutput: !!state.output,
      currentStep: state.currentStep,
    };
    if (state.status === "done" && state.output) {
      completedAgents.push(id);
    }
  }

  const allCitations: SourceCitation[] = [];
  for (const id of completedAgents) {
    const output = outputs[id];
    if (output?.citations) {
      allCitations.push(...output.citations);
    }
  }

  // Deduplicate citations by ID
  const seen = new Set<string>();
  const uniqueCitations: SourceCitation[] = [];
  for (const c of allCitations) {
    if (seen.has(c.id)) continue;
    seen.add(c.id);
    uniqueCitations.push(c);
  }

  const high = uniqueCitations.filter((c) => c.confidence === "high").length;
  const medium = uniqueCitations.filter((c) => c.confidence === "medium").length;
  const low = uniqueCitations.filter((c) => c.confidence === "low").length;

  return {
    schemaVersion: EXPORT_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    source: "launchlens-research-studio",
    session: {
      id: session.id,
      query: session.query,
      keywords: session.keywords,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      status: session.status,
      agentStatuses,
    },
    meta: {
      completedAgents,
      totalCitations: uniqueCitations.length,
      highConfidenceCitations: high,
      mediumConfidenceCitations: medium,
      lowConfidenceCitations: low,
    },
    notes,
    outputs,
    citations: uniqueCitations,
  };
}

export function serializeJSON(exportData: ResearchExport, pretty = true): string {
  return JSON.stringify(exportData, null, pretty ? 2 : 0);
}
