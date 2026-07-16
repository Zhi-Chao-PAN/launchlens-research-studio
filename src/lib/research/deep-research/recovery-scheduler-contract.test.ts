// @vitest-environment node
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "../../../../");
const readJson = (relativePath: string) =>
  JSON.parse(readFileSync(path.join(ROOT, relativePath), "utf8"));

describe("production recovery scheduler contract", () => {
  it("has exactly one external scheduler authority", () => {
    expect(existsSync(path.join(ROOT, ".github/workflows/deep-recovery.yml"))).toBe(false);
    expect(readJson("vercel.json")).not.toHaveProperty("crons");
  });

  it("pins the production QStash schedule and delivery budget", () => {
    expect(readJson("scripts/qstash-deep-recovery.schedule.json")).toEqual({
      version: 1,
      scheduleId: "launchlens-deep-recovery-production-v1",
      label: "launchlens-deep-recovery-production",
      destination: "https://launchlens-research-studio.vercel.app/api/cron/scheduler",
      cron: "*/5 * * * *",
      method: "POST",
      timeout: "55s",
      retries: 2,
      contentType: "application/json",
      body: { version: 1, kind: "deep-recovery" },
    });
  });

  it("checks in repeatable configure and verification commands", () => {
    expect(existsSync(path.join(ROOT, "scripts/configure-qstash-recovery.mjs"))).toBe(true);
    expect(existsSync(path.join(ROOT, "scripts/verify-qstash-recovery.mjs"))).toBe(true);
  });
});
