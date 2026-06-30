import {
  formatDuration,
  historyRunFromLocalEntry,
  mergeServerRunsWithLocalHistory,
  sortHistoryRuns,
  summarizeHistoryRuns,
  type HistoryRunForView,
} from "./history-page-utils";

function run(
  id: string,
  overrides: Partial<HistoryRunForView> = {},
): HistoryRunForView {
  return {
    id,
    query: `query ${id}`,
    status: "completed",
    createdAt: 1_700_000_000_000,
    durationMs: 10_000,
    provider: "test",
    model: "mock",
    ...overrides,
  };
}

describe("history page utilities", () => {
  it("formats durations for the history list", () => {
    expect(formatDuration(120)).toBe("120 ms");
    expect(formatDuration(8_500)).toBe("8.5 sec");
    expect(formatDuration(12_000)).toBe("12 sec");
    expect(formatDuration(125_000)).toBe("2 min 5 sec");
    expect(formatDuration(0)).toBe("Not recorded");
  });

  it("sorts runs without mutating the source array", () => {
    const source = [
      run("a", { createdAt: 100, durationMs: 5_000 }),
      run("b", { createdAt: 300, durationMs: 2_000 }),
      run("c", { createdAt: 200, durationMs: 9_000 }),
    ];

    expect(sortHistoryRuns(source, "newest").map((item) => item.id)).toEqual(["b", "c", "a"]);
    expect(sortHistoryRuns(source, "oldest").map((item) => item.id)).toEqual(["a", "c", "b"]);
    expect(sortHistoryRuns(source, "fastest").map((item) => item.id)).toEqual(["b", "a", "c"]);
    expect(sortHistoryRuns(source, "slowest").map((item) => item.id)).toEqual(["c", "a", "b"]);
    expect(source.map((item) => item.id)).toEqual(["a", "b", "c"]);
  });

  it("summarizes visible runs for dashboard cards", () => {
    const summary = summarizeHistoryRuns(
      [
        run("ok", { status: "completed", hasSources: true }),
        run("fail", { status: "failed" }),
        run("stop", { status: "cancelled", hasSources: true }),
        run("live", { status: "running" }),
      ],
      10,
    );

    expect(summary).toMatchObject({
      total: 10,
      visible: 4,
      completed: 1,
      failed: 1,
      cancelled: 1,
      running: 1,
      withSources: 2,
      completionRate: 33,
    });
  });

  it("merges local completed session links when server history misses them", () => {
    const merged = mergeServerRunsWithLocalHistory(
      [run("server-1", { query: "Server report" })],
      [
        {
          id: "session-only-1",
          query: "Session only report",
          keywords: ["redis"],
          createdAt: "2026-06-30T08:00:00.000Z",
          status: "completed",
        },
      ],
    );

    expect(merged.map((item) => item.id)).toEqual(["server-1", "session-only-1"]);
    expect(merged[1]).toMatchObject({
      provider: "browser",
      model: "local recovery",
      recoverySource: "local",
      status: "completed",
    });
  });

  it("keeps authoritative server runs when local history has the same id", () => {
    const merged = mergeServerRunsWithLocalHistory(
      [run("same-id", { provider: "minimax", model: "MiniMax-M3", hasSources: true })],
      [
        {
          id: "same-id",
          query: "Local duplicate",
          keywords: ["local"],
          createdAt: "2026-06-30T08:00:00.000Z",
          status: "completed",
        },
      ],
    );

    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({
      id: "same-id",
      provider: "minimax",
      recoverySource: "server",
      hasSources: true,
    });
  });

  it("does not expose still-running local records as openable report rows", () => {
    const merged = mergeServerRunsWithLocalHistory([], [
      {
        id: "running-session",
        query: "Still running",
        keywords: [],
        createdAt: "2026-06-30T08:00:00.000Z",
        status: "running",
      },
    ]);

    expect(merged).toEqual([]);
  });

  it("filters local history entries with the same search/status rules as server rows", () => {
    const merged = mergeServerRunsWithLocalHistory(
      [],
      [
        {
          id: "match",
          query: "AI diligence",
          keywords: ["saas"],
          createdAt: "2026-06-30T08:00:00.000Z",
          status: "completed",
        },
        {
          id: "wrong-status",
          query: "AI diligence failed",
          keywords: ["saas"],
          createdAt: "2026-06-30T08:00:00.000Z",
          status: "failed",
        },
      ],
      { query: "saas", status: "completed" },
    );

    expect(merged.map((item) => item.id)).toEqual(["match"]);
  });

  it("converts a local history entry into a recovery row", () => {
    expect(
      historyRunFromLocalEntry({
        id: "local-1",
        query: "Local report",
        keywords: ["local"],
        createdAt: "2026-06-30T08:00:00.000Z",
        status: "cancelled",
      }),
    ).toMatchObject({
      id: "local-1",
      status: "cancelled",
      createdAt: Date.parse("2026-06-30T08:00:00.000Z"),
      recoverySource: "local",
    });
  });
});
