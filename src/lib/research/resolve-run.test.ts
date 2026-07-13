import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  fetchSession,
  getPersistentResearchRun,
  getResearchRun,
  recoveredRun,
  researchRunFromSession,
  storePersistentResearchRun,
} = vi.hoisted(() => {
  const recoveredRun = { id: "run-123", status: "cancelled" };
  return {
    fetchSession: vi.fn(),
    getPersistentResearchRun: vi.fn(),
    getResearchRun: vi.fn(),
    recoveredRun,
    researchRunFromSession: vi.fn(() => recoveredRun),
    storePersistentResearchRun: vi.fn(),
  };
});

vi.mock("./storage", () => ({ getResearchRun }));
vi.mock("./run-store", () => ({
  getPersistentResearchRun,
  researchRunFromSession,
  storePersistentResearchRun,
}));
vi.mock("./session-store", () => ({ fetchSession }));

import { resolveResearchRun } from "./resolve-run";

describe("resolveResearchRun", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getResearchRun.mockReturnValue(null);
    getPersistentResearchRun.mockResolvedValue(null);
    fetchSession.mockResolvedValue(null);
  });

  it("returns the local run without hitting remote stores", async () => {
    const local = { id: "run-123", status: "completed" };
    getResearchRun.mockReturnValue(local);

    await expect(resolveResearchRun("run-123")).resolves.toBe(local);
    expect(getPersistentResearchRun).not.toHaveBeenCalled();
    expect(fetchSession).not.toHaveBeenCalled();
  });

  it("returns the persisted run before consulting the session mirror", async () => {
    const persisted = { id: "run-123", status: "completed" };
    getPersistentResearchRun.mockResolvedValue(persisted);

    await expect(resolveResearchRun("run-123")).resolves.toBe(persisted);
    expect(fetchSession).not.toHaveBeenCalled();
  });

  it("recovers a terminal session and persists the derived run", async () => {
    const session = { id: "run-123", status: "cancelled" };
    fetchSession.mockResolvedValue(session);

    await expect(resolveResearchRun("run-123")).resolves.toBe(recoveredRun);
    expect(researchRunFromSession).toHaveBeenCalledWith(session);
    expect(storePersistentResearchRun).toHaveBeenCalledWith(recoveredRun);
  });

  it("does not expose a non-terminal session as a report", async () => {
    fetchSession.mockResolvedValue({ id: "run-123", status: "running" });

    await expect(resolveResearchRun("run-123")).resolves.toBeNull();
    expect(researchRunFromSession).not.toHaveBeenCalled();
  });
});
