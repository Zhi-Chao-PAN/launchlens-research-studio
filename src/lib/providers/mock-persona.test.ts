import { describe, it, expect, beforeEach, vi, beforeAll } from "vitest";
import {
  DEFAULT_AGENTS,
  getAllAgents,
  getAgentById,
  saveCustomAgent,
  deleteCustomAgent,
  getCustomAgents,
  getSelectedAgentId,
  setSelectedAgentId,
} from "@/lib/research/agent-personas";

// Mock localStorage
const storage = new Map<string, string>();
beforeAll(() => {
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => storage.set(k, v),
    removeItem: (k: string) => storage.delete(k),
    clear: () => storage.clear(),
  });
});

describe("agent personas", () => {
  beforeEach(() => {
    storage.clear();
  });

  describe("DEFAULT_AGENTS", () => {
    it("has 6 built-in agents", () => {
      expect(DEFAULT_AGENTS).toHaveLength(6);
    });

    it("all agents have required fields", () => {
      for (const agent of DEFAULT_AGENTS) {
        expect(agent.id).toBeTruthy();
        expect(agent.name).toBeTruthy();
        expect(agent.description).toBeTruthy();
        expect(agent.icon).toBeTruthy();
        expect(agent.systemPrompt).toBeTruthy();
        expect(agent.tone).toBeTruthy();
        expect(agent.riskBias).toBeTruthy();
        expect(agent.detailLevel).toBeTruthy();
        expect(agent.focusAreas.length).toBeGreaterThan(0);
      }
    });

    it("has unique ids", () => {
      const ids = new Set(DEFAULT_AGENTS.map((a) => a.id));
      expect(ids.size).toBe(DEFAULT_AGENTS.length);
    });
  });

  describe("getAgentById", () => {
    it("finds a default agent by id", () => {
      const agent = getAgentById("analyst");
      expect(agent).toBeDefined();
      expect(agent?.name).toBe("资深分析师");
    });

    it("returns undefined for non-existent agent", () => {
      expect(getAgentById("nonexistent")).toBeUndefined();
    });
  });

  describe("custom agents", () => {
    it("starts with no custom agents", () => {
      expect(getCustomAgents()).toHaveLength(0);
    });

    it("saves a custom agent", () => {
      const agent = saveCustomAgent({
        name: "测试 Agent",
        description: "测试描述",
        icon: "🤖",
        systemPrompt: "你是一个测试 agent。",
        tone: "analytical",
        riskBias: "neutral",
        detailLevel: "balanced",
        focusAreas: ["测试"],
        defaultOpportunityAdjustment: 0,
        defaultRiskAdjustment: 0,
      });

      expect(agent.id).toBeTruthy();
      expect(agent.isCustom).toBe(true);
      expect(agent.name).toBe("测试 Agent");
    });

    it("lists custom agents in getAllAgents", () => {
      saveCustomAgent({
        name: "自定义 Agent",
        description: "",
        icon: "🎯",
        systemPrompt: "test",
        tone: "pragmatic",
        riskBias: "aggressive",
        detailLevel: "concise",
        focusAreas: ["测试"],
        defaultOpportunityAdjustment: 5,
        defaultRiskAdjustment: -5,
      });

      const all = getAllAgents();
      expect(all).toHaveLength(7); // 6 default + 1 custom
      expect(all.some((a) => a.name === "自定义 Agent")).toBe(true);
    });

    it("deletes a custom agent", () => {
      const agent = saveCustomAgent({
        name: "要删除的",
        description: "",
        icon: "🗑️",
        systemPrompt: "test",
        tone: "analytical",
        riskBias: "neutral",
        detailLevel: "balanced",
        focusAreas: [],
        defaultOpportunityAdjustment: 0,
        defaultRiskAdjustment: 0,
      });

      expect(getCustomAgents()).toHaveLength(1);
      deleteCustomAgent(agent.id);
      expect(getCustomAgents()).toHaveLength(0);
    });

    it("can find custom agent by id", () => {
      const saved = saveCustomAgent({
        name: "可查找",
        description: "",
        icon: "🔍",
        systemPrompt: "test",
        tone: "analytical",
        riskBias: "neutral",
        detailLevel: "balanced",
        focusAreas: [],
        defaultOpportunityAdjustment: 0,
        defaultRiskAdjustment: 0,
      });

      const found = getAgentById(saved.id);
      expect(found).toBeDefined();
      expect(found?.name).toBe("可查找");
    });
  });

  describe("selected agent", () => {
    it("defaults to analyst", () => {
      expect(getSelectedAgentId()).toBe("analyst");
    });

    it("saves and retrieves selected agent", () => {
      setSelectedAgentId("investor");
      expect(getSelectedAgentId()).toBe("investor");
    });
  });
});
