import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  createResearchSession,
  getResearchSession,
  subscribeToSession,
  runResearchSession,
} from "@/lib/research/research-engine";

describe("research-engine", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  describe("createResearchSession", () => {
    it("creates a session with correct initial state", () => {
      const session = createResearchSession("test query", ["kw1", "kw2"]);
      expect(session.id).toBeTruthy();
      expect(session.query).toBe("test query");
      expect(session.keywords).toEqual(["kw1", "kw2"]);
      expect(["idle", "pending", "running"]).toContain(session.status);
      expect(Object.keys(session.agents)).toHaveLength(6);
      for (const agentId of Object.keys(session.agents)) {
        expect(session.agents[agentId as keyof typeof session.agents].status).toBe("idle");
        expect(session.agents[agentId as keyof typeof session.agents].progress).toBe(0);
      }
    });

    it("generates unique ids", () => {
      const a = createResearchSession("a", []);
      const b = createResearchSession("b", []);
      expect(a.id).not.toBe(b.id);
    });
  });

  describe("getResearchSession", () => {
    it("returns a created session", () => {
      const created = createResearchSession("x", []);
      const fetched = getResearchSession(created.id);
      expect(fetched?.id).toBe(created.id);
      expect(fetched?.query).toBe("x");
    });

    it("returns undefined for missing session", () => {
      expect(getResearchSession("nonexistent-id")).toBeUndefined();
    });
  });

  describe("subscribeToSession", () => {
    it("supports multiple listeners per session", () => {
      const session = createResearchSession("multi", []);
      const events1: string[] = [];
      const events2: string[] = [];
      const unsub1 = subscribeToSession(session.id, (e) => events1.push(e.type));
      const unsub2 = subscribeToSession(session.id, (e) => events2.push(e.type));
      expect(typeof unsub1).toBe("function");
      expect(typeof unsub2).toBe("function");

      // Both unsubscribes should work independently without throwing
      unsub1();
      expect(events1).toEqual([]);
      expect(events2).toEqual([]);
      unsub2();
    });

    it("both listeners receive identical events", async () => {
      const session = createResearchSession("unsub", []);
      const events1: string[] = [];
      const events2: string[] = [];
      subscribeToSession(session.id, (e) => events1.push(e.type));
      subscribeToSession(session.id, (e) => events2.push(e.type));

      runResearchSession(session.id, { speedMultiplier: 1000 });
      await vi.runAllTimersAsync();

      expect(events1.length).toBeGreaterThan(3);
      expect(events2.length).toBeGreaterThan(3);
      expect(events1).toEqual(events2);
    });
  });

  describe("runResearchSession", () => {
    it("eventually transitions session to completed", async () => {
      const session = createResearchSession("run-test", []);
      const statuses: string[] = [];
      subscribeToSession(session.id, (e) => {
        if (e.type === "status") statuses.push(e.message ?? "");
      });

      const promise = runResearchSession(session.id, { speedMultiplier: 1000 });
      await vi.runAllTimersAsync();
      await promise;

      const updated = getResearchSession(session.id);
      expect(updated?.status).toBe("completed");
    });

    it("completes all research agents", async () => {
      const session = createResearchSession("agents", []);
      runResearchSession(session.id, { speedMultiplier: 1000 });
      await vi.runAllTimersAsync();

      const updated = getResearchSession(session.id)!;
      const researchIds = ["market-sizer", "competitor-analyst", "pain-detective", "pricing-scout", "channel-scout"];
      for (const id of researchIds) {
        expect(updated.agents[id as keyof typeof updated.agents].status).toBe("done");
        expect(updated.agents[id as keyof typeof updated.agents].progress).toBe(100);
        expect(updated.agents[id as keyof typeof updated.agents].output).toBeTruthy();
      }
    });

    it("runs synthesis when enough research agents complete", async () => {
      const session = createResearchSession("synth", []);
      runResearchSession(session.id, { speedMultiplier: 1000 });
      await vi.runAllTimersAsync();

      const updated = getResearchSession(session.id)!;
      expect(updated.agents.synthesis.status).toBe("done");
      expect(updated.agents.synthesis.progress).toBe(100);
      expect(updated.agents.synthesis.output).toBeTruthy();
    });

    it("emits progress events during research", async () => {
      const session = createResearchSession("events", []);
      const eventTypes = new Set<string>();
      subscribeToSession(session.id, (e) => eventTypes.add(e.type));

      runResearchSession(session.id, { speedMultiplier: 1000 });
      await vi.runAllTimersAsync();

      expect(eventTypes.has("status")).toBe(true);
      expect(eventTypes.has("progress")).toBe(true);
      expect(eventTypes.has("output")).toBe(true);
      expect(eventTypes.has("complete")).toBe(true);
    });

    it("produces valid agent outputs with correct agent discriminator", async () => {
      const session = createResearchSession("discriminator", []);
      runResearchSession(session.id, { speedMultiplier: 1000 });
      await vi.runAllTimersAsync();

      const updated = getResearchSession(session.id)!;
      const marketOutput = updated.agents["market-sizer"].output;
      expect(marketOutput?.agent).toBe("market-sizer");
      expect("marketSize" in marketOutput!).toBe(true);

      const synthOutput = updated.agents.synthesis.output;
      expect(synthOutput?.agent).toBe("synthesis");
      expect("execSummary" in synthOutput!).toBe(true);
      expect("opportunityScore" in synthOutput!).toBe(true);
      expect("riskScore" in synthOutput!).toBe(true);
    });

    it("synthesis launchlensBrief contains the query", async () => {
      const query = "AI-powered underwater basket weaving tool";
      const session = createResearchSession(query, ["weaving", "ai"]);
      runResearchSession(session.id, { speedMultiplier: 1000 });
      await vi.runAllTimersAsync();

      const updated = getResearchSession(session.id)!;
      const synthOutput = updated.agents.synthesis.output as any;
      expect(synthOutput.launchlensBrief).toContain(query);
    });
  });
});
