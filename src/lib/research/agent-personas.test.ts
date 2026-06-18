// Auto-generated test file for agent-personas (round 143 - mojibake cleanup)
import { describe, it, expect, beforeAll } from "vitest";
import {
  DEFAULT_AGENTS,
  getAllAgents,
  getAgentById,
  saveCustomAgent,
  deleteCustomAgent,
  getCustomAgents,
  getSelectedAgentId,
  setSelectedAgentId,
  recommendPersonasForQuery,
  adjustScoreByPersona,
  compareAcrossPersonas,
  getPersonaStats,
  personaToMarkdown,
  exportPersonasJson,
  validatePersona,
  clonePersona,
  consensusFromPersonas,
} from "@/lib/research/agent-personas";

const storage = new Map<string, string>();
beforeAll(() => {
  (globalThis as any).localStorage = {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => storage.set(k, v),
    removeItem: (k: string) => storage.delete(k),
    clear: () => storage.clear(),
  };
  storage.clear();
});

describe("DEFAULT_AGENTS", () => {
  const NAMES = ["资深分析师", "风险投资人", "怀疑论者", "实战运营官", "创新先锋", "学术研究员"];
  it("has 6 default agents", () => {
    expect(DEFAULT_AGENTS).toHaveLength(6);
  });
  it("has correct Chinese names without mojibake", () => {
    for (let i = 0; i < 6; i++) {
      expect(DEFAULT_AGENTS[i].name).toBe(NAMES[i]);
    }
  });
  it("each has required fields", () => {
    for (const a of DEFAULT_AGENTS) {
      expect(a.id).toBeTruthy();
      expect(a.name).toBeTruthy();
      expect(a.description).toBeTruthy();
      expect(["analytical","creative","pragmatic","skeptical","enthusiastic"]).toContain(a.tone);
      expect(["conservative","neutral","aggressive"]).toContain(a.riskBias);
      expect(["concise","balanced","comprehensive"]).toContain(a.detailLevel);
      expect(a.focusAreas.length).toBeGreaterThan(0);
      expect(a.defaultOpportunityAdjustment).toBeGreaterThanOrEqual(-10);
      expect(a.defaultOpportunityAdjustment).toBeLessThanOrEqual(10);
      expect(a.defaultRiskAdjustment).toBeGreaterThanOrEqual(-10);
      expect(a.defaultRiskAdjustment).toBeLessThanOrEqual(10);
    }
  });
});

describe("getAgentById", () => {
  it("finds a default agent by id", () => {
    const a = getAgentById("analyst");
    expect(a).toBeDefined();
    expect(a!.id).toBe("analyst");
  });
  it("returns undefined for missing id", () => {
    expect(getAgentById("nonexistent")).toBeUndefined();
  });
});

describe("custom agents", () => {
  it("starts empty", () => {
    expect(getCustomAgents()).toHaveLength(0);
  });
  it("saves a custom agent", () => {
    const saved = saveCustomAgent({
      name: "Test Agent",
      description: "test desc",
      icon: "T",
      systemPrompt: "test",
      tone: "analytical",
      riskBias: "neutral",
      detailLevel: "balanced",
      focusAreas: ["test"],
      defaultOpportunityAdjustment: 0,
      defaultRiskAdjustment: 0,
    });
    expect(saved.id).toMatch(/^agent-/);
    expect(saved.isCustom).toBe(true);
    expect(getAllAgents().some(a => a.id === saved.id)).toBe(true);
  });
  it("lists custom agents in getAllAgents", () => {
    expect(getAllAgents().length).toBe(7);
  });
  it("deletes a custom agent", () => {
    const saved = saveCustomAgent({
      name: "To Delete",
      description: "",
      icon: "X",
      systemPrompt: "test",
      tone: "pragmatic",
      riskBias: "neutral",
      detailLevel: "balanced",
      focusAreas: [],
      defaultOpportunityAdjustment: 0,
      defaultRiskAdjustment: 0,
    });
    const before = getAllAgents().length;
    deleteCustomAgent(saved.id);
    expect(getAllAgents().length).toBe(before - 1);
  });
});

describe("selected agent", () => {
  it("defaults to analyst", () => {
    expect(getSelectedAgentId()).toBe("analyst");
  });
  it("updates selected agent id", () => {
    setSelectedAgentId("investor");
    expect(getSelectedAgentId()).toBe("investor");
    setSelectedAgentId("analyst");
  });
});

describe("recommendPersonasForQuery", () => {
  it("recommends skeptical for risk-focused queries", () => {
    const r = recommendPersonasForQuery("what are the key risks and downside", 3);
    expect(r[0].persona.id).toBe("skeptic");
  });
  it("returns at most limit items", () => {
    expect(recommendPersonasForQuery("anything", 2)).toHaveLength(2);
  });
});

describe("adjustScoreByPersona", () => {
  it("clamps to 0..100", () => {
    expect(adjustScoreByPersona(95, getAgentById("innovator")!, "opportunity")).toBe(100);
    expect(adjustScoreByPersona(5, getAgentById("skeptic")!, "opportunity")).toBe(0);
  });
  it("applies adjustment linearly", () => {
    expect(adjustScoreByPersona(50, getAgentById("investor")!, "opportunity")).toBe(58);
  });
});

describe("compareAcrossPersonas", () => {
  it("returns one entry per default agent", () => {
    const r = compareAcrossPersonas(60, 40);
    expect(r.length).toBe(DEFAULT_AGENTS.length);
    expect(r.find(p => p.id === "investor")!.adjustedOpportunity).toBe(68);
  });
  it("accepts filtered id list", () => {
    expect(compareAcrossPersonas(60, 40, ["skeptic"])).toHaveLength(1);
  });
});

describe("getPersonaStats", () => {
  it("counts agents and distributions", () => {
    const s = getPersonaStats();
    expect(s.defaultCount).toBe(6);
    expect(s.totalAgents).toBeGreaterThanOrEqual(6);
    expect(Object.keys(s.toneBreakdown).length).toBeGreaterThan(0);
    expect(Object.keys(s.riskBiasBreakdown).length).toBeGreaterThan(0);
  });
});

describe("personaToMarkdown", () => {
  it("contains name and focus areas section", () => {
    const md = personaToMarkdown(DEFAULT_AGENTS[0]);
    expect(md).toContain("资深分析师");
    expect(md).toContain("Focus areas");
  });
});

describe("exportPersonasJson", () => {
  it("produces parseable JSON", () => {
    const parsed = JSON.parse(exportPersonasJson());
    expect(parsed.version).toBe(1);
    expect(Array.isArray(parsed.agents)).toBe(true);
  });
});

describe("validatePersona", () => {
  it("accepts a valid payload", () => {
    const v = validatePersona({ name: "X", description: "Y", tone: "analytical", riskBias: "neutral", detailLevel: "balanced", defaultOpportunityAdjustment: 0, defaultRiskAdjustment: 0 });
    expect(v.valid).toBe(true);
  });
  it("rejects missing name", () => {
    expect(validatePersona({ description: "Y" }).valid).toBe(false);
  });
  it("rejects out-of-range adjustment", () => {
    expect(validatePersona({ name: "X", description: "Y", defaultOpportunityAdjustment: 20 }).valid).toBe(false);
  });
  it("rejects invalid tone", () => {
    expect(validatePersona({ name: "X", description: "Y", tone: "angry" as any }).valid).toBe(false);
  });
});

describe("clonePersona", () => {
  it("returns custom copy with new id", () => {
    const c = clonePersona("analyst");
    expect(c!.id).not.toBe("analyst");
    expect(c!.isCustom).toBe(true);
    expect(c!.name).toContain("copy");
  });
  it("applies overrides", () => {
    const c = clonePersona("analyst", { name: "Mine" });
    expect(c!.name).toBe("Mine");
  });
  it("returns undefined for unknown", () => {
    expect(clonePersona("nope")).toBeUndefined();
  });
});

describe("consensusFromPersonas", () => {
  it("averages scores", () => {
    const c = consensusFromPersonas([
      { persona: "a", opportunity: 60, risk: 40 },
      { persona: "b", opportunity: 70, risk: 30 },
      { persona: "c", opportunity: 80, risk: 20 },
    ]);
    expect(c.avgOpportunity).toBe(70);
    expect(c.avgRisk).toBe(30);
    expect(c.agreement).toBeGreaterThanOrEqual(0);
    expect(c.agreement).toBeLessThanOrEqual(100);
  });
  it("is 100 agreement when identical", () => {
    expect(consensusFromPersonas([{persona:"a", opportunity:50, risk:50},{persona:"b", opportunity:50, risk:50}]).agreement).toBe(100);
  });
  it("returns zeros for empty", () => {
    expect(consensusFromPersonas([])).toEqual({ avgOpportunity:0, avgRisk:0, agreement:0 });
  });
});
