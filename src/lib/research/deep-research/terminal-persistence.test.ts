import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createResearchSession, deleteSession } from "@/lib/research/research-engine";
import type { ResearchRun } from "@/lib/research/storage";
import { createDeepWorkPlan, type DeepRunRecordV1 } from "./model";

const mocks = vi.hoisted(() => ({
  getPersistentResearchRun: vi.fn(),
  researchRunFromSession: vi.fn(),
  storePersistentResearchRun: vi.fn(),
  saveResearchRun: vi.fn(),
  releaseDeepResearchAdmission: vi.fn(),
}));

vi.mock("@/lib/research/run-store", () => ({
  getPersistentResearchRun: mocks.getPersistentResearchRun,
  researchRunFromSession: mocks.researchRunFromSession,
  storePersistentResearchRun: mocks.storePersistentResearchRun,
}));

vi.mock("@/lib/research/storage", () => ({
  saveResearchRun: mocks.saveResearchRun,
}));

vi.mock("./admission", () => ({
  releaseDeepResearchAdmission: mocks.releaseDeepResearchAdmission,
}));

import { persistDeepTerminalRecord } from "./terminal-persistence";

const sessionIds: string[] = [];

function record(lifecycle: DeepRunRecordV1["lifecycle"]): DeepRunRecordV1 {
  const session = createResearchSession("terminal persistence", [], undefined, { mode: "deep" });
  sessionIds.push(session.id);
  session.status = lifecycle === "active" ? "running" : lifecycle;
  return {
    version: 1,
    sessionId: session.id,
    revision: 1,
    lifecycle,
    currentWorkIndex: lifecycle === "completed" ? 10 : 0,
    work: createDeepWorkPlan(),
    session,
    createdAt: 1_000,
    updatedAt: 2_000,
    nextWakeAt: 2_000,
    totalAttempts: 1,
    executionProfile: {
      generationProviderId: "openai",
      retrievalProviderId: "tavily",
      reviewerProviderId: "openai",
    },
    ...(lifecycle === "active"
      ? {}
      : { terminal: { status: lifecycle, committedAt: "2026-07-13T00:00:00.000Z" } }),
  };
}

const materializedRun: ResearchRun = {
  id: "materialized-run",
  query: "terminal persistence",
  keywords: [],
  result: "result",
  provider: "openai",
  model: "gpt",
  createdAt: 1_000,
  durationMs: 1_000,
  status: "completed",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getPersistentResearchRun.mockResolvedValue(null);
  mocks.researchRunFromSession.mockReturnValue(materializedRun);
  mocks.storePersistentResearchRun.mockResolvedValue(undefined);
  mocks.releaseDeepResearchAdmission.mockResolvedValue(true);
});

afterEach(() => {
  for (const id of sessionIds.splice(0)) deleteSession(id);
});

describe("persistDeepTerminalRecord", () => {
  it("does nothing before the Deep record reaches an authoritative terminal", async () => {
    await persistDeepTerminalRecord(record("active"));

    expect(mocks.getPersistentResearchRun).not.toHaveBeenCalled();
    expect(mocks.saveResearchRun).not.toHaveBeenCalled();
    expect(mocks.releaseDeepResearchAdmission).not.toHaveBeenCalled();
  });

  it("materializes a terminal dossier into local and Redis history", async () => {
    const terminal = record("completed");

    await persistDeepTerminalRecord(terminal);

    expect(mocks.researchRunFromSession).toHaveBeenCalledWith(terminal.session);
    expect(mocks.saveResearchRun).toHaveBeenCalledWith(materializedRun);
    expect(mocks.storePersistentResearchRun).toHaveBeenCalledWith(materializedRun);
    expect(mocks.releaseDeepResearchAdmission).toHaveBeenCalledWith(terminal.sessionId);
  });

  it("reuses an already materialized run without rewriting Redis", async () => {
    const existing = { ...materializedRun, id: "existing" };
    mocks.getPersistentResearchRun.mockResolvedValue(existing);

    await persistDeepTerminalRecord(record("cancelled"));

    expect(mocks.researchRunFromSession).not.toHaveBeenCalled();
    expect(mocks.saveResearchRun).toHaveBeenCalledWith(existing);
    expect(mocks.storePersistentResearchRun).not.toHaveBeenCalled();
  });
});
