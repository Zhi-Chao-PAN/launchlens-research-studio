import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("root theme contract", () => {
  const layout = fs.readFileSync(path.resolve(__dirname, "layout.tsx"), "utf8");

  it("uses the data-theme attribute consumed by globals.css", () => {
    expect(layout).toContain('attribute="data-theme"');
    expect(layout).not.toContain('attribute="class"');
  });

  it("keeps the existing LaunchLens theme preference key", () => {
    expect(layout).toContain('storageKey="launchlens:theme"');
  });
});
