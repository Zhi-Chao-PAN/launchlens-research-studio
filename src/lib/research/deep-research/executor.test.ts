import { afterEach, describe, expect, it, vi } from "vitest";
import { mockResearchProvider } from "@/lib/providers/mock-provider-adapter";
import type { RetrievalProvider } from "@/lib/providers/retrieval.types";
import {
  createResearchSession,
  deleteSession,
  ResearchAgentStageError,
} from "@/lib/research/research-engine";
import { createDeepWorkPlan, type DeepRunRecordV1 } from "./model";
import { ProductionDeepWorkExecutor } from "./executor";

const ids: string[] = [];

function record(workIndex = 0): DeepRunRecordV1 {
  const session = createResearchSession("deep executor", [], undefined, { mode: "deep" });
  ids.push(session.id);
  return {
    version: 1,
    sessionId: session.id,
    revision: 1,
    lifecycle: "active",
    currentWorkIndex: workIndex,
    work: createDeepWorkPlan(),
    session,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    nextWakeAt: Date.now(),
    totalAttempts: 1,
    executionProfile: {
      generationProviderId: "live-model",
      retrievalProviderId: "search",
      reviewerProviderId: "reviewer",
    },
  };
}

function stubRetrieval(): RetrievalProvider {
  return {
    id: "search",
    displayName: "Stub retrieval",
    isMock: false,
    async search() {
      return [];
    },
  };
}

function executor(overrides: Record<string, unknown> = {}) {
  const semanticReviewer = { runPass: vi.fn(async (session) => structuredClone(session)) };
  return {
    semanticReviewer,
    executor: new ProductionDeepWorkExecutor({
      generationProviderId: "live-model",
      retrievalProviderId: "search",
      reviewerProviderId: "reviewer",
      semanticReviewer,
      retrieval: stubRetrieval(),
      ...overrides,
    }),
  };
}

afterEach(() => {
  for (const id of ids.splice(0)) deleteSession(id);
});

describe("ProductionDeepWorkExecutor", () => {
  it("runs a specialist against the fenced snapshot and returns its isolated projection", async () => {
    const initial = record(0);
    const output = await mockResearchProvider.generate("pricing-scout", {
      query: initial.session.query,
      keywords: [],
    });
    const specialistRunner = vi.fn(async (_sessionId, agentId, options) => {
      const session = structuredClone(options.sessionSnapshot!);
      session.agents[agentId] = {
        ...session.agents[agentId],
        status: "done",
        progress: 100,
        currentStep: "Complete",
        output,
      };
      return { output, session };
    });
    const { executor: workExecutor } = executor({ specialistRunner });

    const result = await workExecutor.execute({
      record: initial,
      work: initial.work[0],
    });

    expect(specialistRunner).toHaveBeenCalledWith(
      initial.sessionId,
      "pricing-scout",
      expect.objectContaining({
        strict: true,
        minimumRetrievedSources: 3,
        sessionSnapshot: initial.session,
      }),
    );
    expect(result.agents["pricing-scout"].status).toBe("done");
    expect(initial.session.agents["pricing-scout"].status).toBe("idle");
  });

  it("maps strict stage failures into bounded durable retry semantics", async () => {
    const initial = record(0);
    const specialistRunner = vi.fn(async () => {
      throw new ResearchAgentStageError(
        "retrieval_insufficient",
        "Not enough sources.",
      );
    });
    const { executor: workExecutor } = executor({ specialistRunner });

    await expect(workExecutor.execute({ record: initial, work: initial.work[0] }))
      .rejects.toMatchObject({
        code: "specialist_retrieval_insufficient",
        retryable: true,
      });
  });

  it("preserves the safe provider degradation reason for durable diagnostics", async () => {
    const initial = record(0);
    const specialistRunner = vi.fn(async () => {
      throw new ResearchAgentStageError(
        "provider_degraded",
        "Provider output failed validation.",
        "validation_error",
      );
    });
    const { executor: workExecutor } = executor({ specialistRunner });

    await expect(workExecutor.execute({ record: initial, work: initial.work[0] }))
      .rejects.toMatchObject({
        code: "specialist_provider_validation_error",
        retryable: true,
      });
  });

  it("routes semantic work by fixed pass and rejects provider profile drift", async () => {
    const initial = record(5);
    const { executor: workExecutor, semanticReviewer } = executor();
    await workExecutor.execute({ record: initial, work: initial.work[5] });
    expect(semanticReviewer.runPass).toHaveBeenCalledWith(
      initial.session,
      "claim_source_entailment",
      undefined,
    );

    initial.executionProfile.reviewerProviderId = "changed-reviewer";
    await expect(workExecutor.execute({ record: initial, work: initial.work[5] }))
      .rejects.toMatchObject({ code: "execution_profile_changed", retryable: false });
  });
});
