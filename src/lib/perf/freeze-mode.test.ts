/// <reference types="vitest/globals" />
import { describe, it, expect } from "vitest";
import { hasFreezeParam } from "@/lib/perf/use-freeze-mode";

describe("hasFreezeParam (round 177)", () => {
  it("returns true when freeze=1", () => {
    expect(hasFreezeParam("?freeze=1")).toBe(true);
  });
  it("returns false when freeze param is missing", () => {
    expect(hasFreezeParam("")).toBe(false);
    expect(hasFreezeParam("?x=1")).toBe(false);
  });
  it("returns false for other freeze values", () => {
    expect(hasFreezeParam("?freeze=0")).toBe(false);
    expect(hasFreezeParam("?freeze=true")).toBe(false);
  });
  it("tolerates other query params around it", () => {
    expect(hasFreezeParam("?a=b&freeze=1&c=d")).toBe(true);
  });
});
