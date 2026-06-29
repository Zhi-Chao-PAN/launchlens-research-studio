import {
  formatDuration,
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
});
