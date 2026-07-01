/**
 * Research agent personas.
 * Different agent styles produce different research outputs with unique biases,
 * focuses, and risk appetites.
 */

export interface AgentPersona {
  id: string;
  name: string;
  description: string;
  icon: string;
  systemPrompt: string;
  // Style adjustments
  tone: "analytical" | "creative" | "pragmatic" | "skeptical" | "enthusiastic";
  riskBias: "conservative" | "neutral" | "aggressive"; // how risk-tolerant
  detailLevel: "concise" | "balanced" | "comprehensive";
  focusAreas: string[]; // what this agent prioritizes
  defaultOpportunityAdjustment: number; // -10 to +10
  defaultRiskAdjustment: number; // -10 to +10
  isCustom?: boolean;
}

export const DEFAULT_AGENTS: AgentPersona[] = [
  {
    id: "analyst",
    name: "资深分析师",
    description: "数据驱动、客观中立、深度分析",
    icon: "📊",
    systemPrompt: "你是一名资深行业分析师。你的风格是数据驱动、客观中立的。你会基于事实和数据进行分析，避免主观臆断。你会提供全面、深入的分析，覆盖机会和风险两个方面。",
    tone: "analytical",
    riskBias: "neutral",
    detailLevel: "comprehensive",
    focusAreas: ["市场规模", "竞争格局", "数据验证", "趋势分析"],
    defaultOpportunityAdjustment: 0,
    defaultRiskAdjustment: 0,
  },
  {
    id: "investor",
    name: "风险投资人",
    description: "寻找高回报机会，关注可扩展性和市场空间",
    icon: "💰",
    systemPrompt: "你是一名风险投资合伙人。你的风格是积极、有远见的。你会重点关注市场规模、增长潜力、可扩展性和投资回报。你会识别颠覆性机会，但也会注意关键风险因素。你偏向乐观，但也讲求实际。",
    tone: "enthusiastic",
    riskBias: "aggressive",
    detailLevel: "balanced",
    focusAreas: ["市场规模", "增长潜力", "投资回报", "竞争壁垒"],
    defaultOpportunityAdjustment: 8,
    defaultRiskAdjustment: -5,
  },
  {
    id: "skeptic",
    name: "怀疑论者",
    description: "挑战假设、识别风险、严谨验证",
    icon: "🔍",
    systemPrompt: "你是一名持怀疑态度的研究员。你的风格是严谨、批判性的。你会挑战假设，识别隐藏的风险和潜在的陷阱。你不会轻易接受表面的乐观预期，而是会深入挖掘潜在问题。你会对每一个主张提出质疑。",
    tone: "skeptical",
    riskBias: "conservative",
    detailLevel: "comprehensive",
    focusAreas: ["风险因素", "反方观点", "数据可靠性", "潜在陷阱"],
    defaultOpportunityAdjustment: -8,
    defaultRiskAdjustment: 10,
  },
  {
    id: "operator",
    name: "实战运营官",
    description: "注重落地执行、实操经验、成本收益",
    icon: "⚙️",
    systemPrompt: "你是一名有实战经验的运营官。你的风格是务实、注重执行的。你会重点关注可操作性、成本结构、资源需求和实际落地路径。你喜欢具体的行动计划，不喜欢空泛的理论。你会从执行的角度评估每一个机会。",
    tone: "pragmatic",
    riskBias: "neutral",
    detailLevel: "balanced",
    focusAreas: ["执行路径", "成本结构", "资源需求", "落地难度"],
    defaultOpportunityAdjustment: -2,
    defaultRiskAdjustment: 3,
  },
  {
    id: "innovator",
    name: "创新先锋",
    description: "发现前沿机会、跨界思维、想象力丰富",
    icon: "💡",
    systemPrompt: "你是一名富有创造力的创新先锋。你的风格是前瞻性、发散性的。你擅长发现跨界机会，连接不同领域的趋势，想象可能的未来场景。你会提供富有想象力但并非不切实际的见解。你关注前沿趋势和新兴技术。",
    tone: "creative",
    riskBias: "aggressive",
    detailLevel: "balanced",
    focusAreas: ["新兴趋势", "跨界机会", "技术创新", "未来场景"],
    defaultOpportunityAdjustment: 10,
    defaultRiskAdjustment: -3,
  },
  {
    id: "academic",
    name: "学术研究员",
    description: "严谨求证、引用充分、结构化分析",
    icon: "📚",
    systemPrompt: "你是一名学术背景的研究员。你的风格是严谨、系统化的。你会提供结构清晰、逻辑严密的分析。你重视证据质量，会明确区分事实和推论。你会引用多种来源，并说明信息的可信度。",
    tone: "analytical",
    riskBias: "conservative",
    detailLevel: "comprehensive",
    focusAreas: ["文献综述", "方法论", "证据强度", "结构化分析"],
    defaultOpportunityAdjustment: -3,
    defaultRiskAdjustment: 5,
  },
];

// Custom agents storage (localStorage)
const CUSTOM_AGENTS_KEY = "launchlens:custom-agents";

function isValidAgentPersona(v: unknown): v is AgentPersona {
  if (!v || typeof v !== "object") return false;
  const a = v as Record<string, unknown>;
  if (typeof a.id !== "string" || !a.id) return false;
  if (typeof a.name !== "string") return false;
  if (typeof a.description !== "string") return false;
  if (typeof a.icon !== "string") return false;
  if (typeof a.systemPrompt !== "string") return false;
  if (typeof a.tone !== "string") return false;
  if (typeof a.riskBias !== "string") return false;
  if (typeof a.detailLevel !== "string") return false;
  if (!Array.isArray(a.focusAreas) || !a.focusAreas.every((s) => typeof s === "string")) return false;
  if (typeof a.defaultOpportunityAdjustment !== "number" || !Number.isFinite(a.defaultOpportunityAdjustment)) return false;
  if (typeof a.defaultRiskAdjustment !== "number" || !Number.isFinite(a.defaultRiskAdjustment)) return false;
  if (a.isCustom !== undefined && typeof a.isCustom !== "boolean") return false;
  return true;
}

export function getCustomAgents(): AgentPersona[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(CUSTOM_AGENTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Defensively drop entries with the wrong shape so a partial
    // localStorage write cannot crash saveCustomAgent's .findIndex.
    return parsed.filter(isValidAgentPersona);
  } catch {
    return [];
  }
}

export function saveCustomAgent(agent: Omit<AgentPersona, "id" | "isCustom"> & { id?: string }): AgentPersona {
  const customAgents = getCustomAgents();
  
  const newAgent: AgentPersona = {
    ...agent,
    id: agent.id || "agent-" + Math.random().toString(36).slice(2, 10),
    isCustom: true,
  };

  if (agent.id) {
    // Update existing
    const idx = customAgents.findIndex((a) => a.id === agent.id);
    if (idx >= 0) {
      customAgents[idx] = newAgent;
    } else {
      customAgents.push(newAgent);
    }
  } else {
    customAgents.push(newAgent);
  }

  if (typeof localStorage !== "undefined") {
    localStorage.setItem(CUSTOM_AGENTS_KEY, JSON.stringify(customAgents));
  }

  return newAgent;
}

export function deleteCustomAgent(id: string): void {
  const customAgents = getCustomAgents().filter((a) => a.id !== id);
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(CUSTOM_AGENTS_KEY, JSON.stringify(customAgents));
  }
}

export function getAllAgents(): AgentPersona[] {
  return [...DEFAULT_AGENTS, ...getCustomAgents()];
}

export function getAgentById(id: string): AgentPersona | undefined {
  return getAllAgents().find((a) => a.id === id);
}

// Current selected agent
const SELECTED_AGENT_KEY = "launchlens:selected-agent";

export function getSelectedAgentId(): string {
  if (typeof localStorage === "undefined") return "analyst";
  return localStorage.getItem(SELECTED_AGENT_KEY) || "analyst";
}

export function setSelectedAgentId(id: string): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(SELECTED_AGENT_KEY, id);
}

/* ------------------------------------------------------------------ */
/*  Extended persona utilities (round 143)                             */
/* ------------------------------------------------------------------ */

export interface PersonaMatch {
  persona: AgentPersona;
  score: number;
  reasons: string[];
}

const TONE_KEYWORDS: Record<AgentPersona["tone"], string[]> = {
  analytical: ["data", "analysis", "research", "market", "evidence", "size", "trends", "report"],
  creative: ["future", "innovation", "imagine", "trends", "emerging", "disrupt", "new", "2030"],
  pragmatic: ["execute", "launch", "cost", "practical", "how to", "go-to-market", "build", "operate"],
  skeptical: ["risk", "challenge", "validate", "assumption", "pitfall", "downside", "weakness", "threat"],
  enthusiastic: ["opportunity", "growth", "scale", "upside", "potential", "invest", "hot", "boom"],
};

export function recommendPersonasForQuery(query: string, limit = 3): PersonaMatch[] {
  const q = query.toLowerCase();
  const matches: PersonaMatch[] = [];
  for (const p of getAllAgents()) {
    const reasons: string[] = [];
    let score = 0;
    for (const kw of TONE_KEYWORDS[p.tone]) {
      if (q.includes(kw)) { score += 1; reasons.push(kw); }
    }
    for (const fa of p.focusAreas) {
      if (q.includes(fa.toLowerCase())) { score += 2; reasons.push(fa); }
    }
    if (p.id === "analyst") score += 0.5; // slight default preference
    matches.push({ persona: p, score, reasons });
  }
  return matches.sort((a, b) => b.score - a.score).slice(0, limit);
}

export function adjustScoreByPersona(baseScore: number, persona: AgentPersona, kind: "opportunity" | "risk"): number {
  const adj = kind === "opportunity" ? persona.defaultOpportunityAdjustment : persona.defaultRiskAdjustment;
  return Math.max(0, Math.min(100, baseScore + adj));
}

export interface PersonaComparison {
  id: string;
  name: string;
  icon: string;
  adjustedOpportunity: number;
  adjustedRisk: number;
  perspective: string;
}

export function compareAcrossPersonas(baseOpportunity: number, baseRisk: number, personaIds?: string[]): PersonaComparison[] {
  const pool = personaIds ? personaIds.map(id => getAgentById(id)).filter(Boolean) as AgentPersona[] : DEFAULT_AGENTS;
  return pool.map(p => ({
    id: p.id,
    name: p.name,
    icon: p.icon,
    adjustedOpportunity: adjustScoreByPersona(baseOpportunity, p, "opportunity"),
    adjustedRisk: adjustScoreByPersona(baseRisk, p, "risk"),
    perspective: p.description,
  }));
}

export interface PersonaStats {
  totalAgents: number;
  defaultCount: number;
  customCount: number;
  toneBreakdown: Record<string, number>;
  riskBiasBreakdown: Record<string, number>;
}

export function getPersonaStats(): PersonaStats {
  const all = getAllAgents();
  const tones: Record<string, number> = {};
  const biases: Record<string, number> = {};
  let custom = 0;
  for (const p of all) {
    tones[p.tone] = (tones[p.tone] || 0) + 1;
    biases[p.riskBias] = (biases[p.riskBias] || 0) + 1;
    if (p.isCustom) custom++;
  }
  return {
    totalAgents: all.length,
    defaultCount: DEFAULT_AGENTS.length,
    customCount: custom,
    toneBreakdown: tones,
    riskBiasBreakdown: biases,
  };
}

export function personaToMarkdown(p: AgentPersona): string {
  const lines = [
    "# " + p.icon + " " + p.name,
    "",
    "> " + p.description,
    "",
    "- **Tone:** " + p.tone,
    "- **Risk bias:** " + p.riskBias,
    "- **Detail level:** " + p.detailLevel,
    "- **Opportunity adj:** " + (p.defaultOpportunityAdjustment > 0 ? "+" : "") + p.defaultOpportunityAdjustment,
    "- **Risk adj:** " + (p.defaultRiskAdjustment > 0 ? "+" : "") + p.defaultRiskAdjustment,
    "",
    "## Focus areas",
    "",
    ...p.focusAreas.map(fa => "- " + fa),
  ];
  return lines.join("\n");
}

export function exportPersonasJson(): string {
  return JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), agents: getAllAgents() }, null, 2);
}

export function validatePersona(p: Partial<AgentPersona>): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!p.name || p.name.trim().length === 0) errors.push("name is required");
  if (!p.description || p.description.trim().length === 0) errors.push("description is required");
  if (p.tone && !["analytical","creative","pragmatic","skeptical","enthusiastic"].includes(p.tone)) errors.push("invalid tone");
  if (p.riskBias && !["conservative","neutral","aggressive"].includes(p.riskBias)) errors.push("invalid riskBias");
  if (p.detailLevel && !["concise","balanced","comprehensive"].includes(p.detailLevel)) errors.push("invalid detailLevel");
  if (typeof p.defaultOpportunityAdjustment === "number" && (p.defaultOpportunityAdjustment < -10 || p.defaultOpportunityAdjustment > 10)) {
    errors.push("defaultOpportunityAdjustment must be between -10 and 10");
  }
  if (typeof p.defaultRiskAdjustment === "number" && (p.defaultRiskAdjustment < -10 || p.defaultRiskAdjustment > 10)) {
    errors.push("defaultRiskAdjustment must be between -10 and 10");
  }
  return { valid: errors.length === 0, errors };
}

export function clonePersona(id: string, overrides: Partial<AgentPersona> = {}): AgentPersona | undefined {
  const src = getAgentById(id);
  if (!src) return undefined;
  const copy: AgentPersona = {
    ...src,
    id: "agent-" + Math.random().toString(36).slice(2, 10),
    name: (overrides.name ?? src.name) + " (copy)",
    isCustom: true,
    ...overrides,
  };
  return copy;
}

export function consensusFromPersonas(
  scores: Array<{ persona: string; opportunity: number; risk: number }>
): { avgOpportunity: number; avgRisk: number; agreement: number } {
  if (scores.length === 0) return { avgOpportunity: 0, avgRisk: 0, agreement: 0 };
  const avgO = scores.reduce((a, s) => a + s.opportunity, 0) / scores.length;
  const avgR = scores.reduce((a, s) => a + s.risk, 0) / scores.length;
  const spreadO = scores.reduce((a, s) => a + Math.abs(s.opportunity - avgO), 0) / scores.length;
  const spreadR = scores.reduce((a, s) => a + Math.abs(s.risk - avgR), 0) / scores.length;
  const avgSpread = (spreadO + spreadR) / 2;
  const agreement = Math.max(0, Math.min(100, Math.round(100 - avgSpread)));
  return { avgOpportunity: Math.round(avgO), avgRisk: Math.round(avgR), agreement };
}

