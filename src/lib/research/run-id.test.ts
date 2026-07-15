// @vitest-environment node
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveResearchRunFilePath } from "./run-id";
import { isValidResearchRunId } from "./run-id-validation";

describe("research run id boundary", () => {
  it("keeps existing safe id formats readable", () => {
    expect(isValidResearchRunId("redis-run-1")).toBe(true);
    expect(isValidResearchRunId("sess_abc123")).toBe(true);
    expect(isValidResearchRunId("6cfc4db1-13f1-4dd3-a774-d36ad2135ebd")).toBe(true);
  });

  it.each([
    "../../package",
    "..%2F..%2Fpackage",
    "..%5C..%5Cpackage",
    "run.json",
    "run/child",
    "run\\child",
    "",
  ])("rejects traversal-capable id %s", (id) => {
    expect(isValidResearchRunId(id)).toBe(false);
  });

  it("resolves valid ids as direct children of the run directory", () => {
    const root = path.resolve("C:/safe/research/runs");
    expect(resolveResearchRunFilePath(root, "legacy-run_1"))
      .toBe(path.join(root, "legacy-run_1.json"));
    expect(resolveResearchRunFilePath(root, "../../package")).toBeNull();
  });
});
