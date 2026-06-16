import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { getBackend, setBackendForTests, loadOrDefault } from "./storage";

describe("storage backends", () => {
  beforeEach(() => setBackendForTests(null));
  afterEach(() => setBackendForTests(null));

  it("uses in-memory backend by default", () => {
    const b = getBackend({} as NodeJS.ProcessEnv);
    expect(b.id).toBe("memory");
    b.write("k", { a: 1 });
    expect(b.read("k")).toEqual({ a: 1 });
    expect(b.list()).toContain("k");
    b.remove("k");
    expect(b.read("k")).toBeNull();
  });

  it("uses file backend when LAUNCHLENS_STORAGE_DIR is set", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ll-storage-"));
    setBackendForTests(null);
    const b = getBackend({ LAUNCHLENS_STORAGE_DIR: dir } as NodeJS.ProcessEnv);
    expect(b.id.startsWith("file:")).toBe(true);
    b.write("breakers", { failures: 2 });
    setBackendForTests(null);
    const b2 = getBackend({ LAUNCHLENS_STORAGE_DIR: dir } as NodeJS.ProcessEnv);
    expect(b2.read("breakers")).toEqual({ failures: 2 });
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("loadOrDefault returns fallback when key missing", () => {
    const b = getBackend({} as NodeJS.ProcessEnv);
    expect(loadOrDefault("nope", { default: true })).toEqual({ default: true });
    b.write("hit", { default: false });
    expect(loadOrDefault("hit", { default: true })).toEqual({ default: false });
  });

  it("list filters by prefix", () => {
    const b = getBackend({} as NodeJS.ProcessEnv);
    b.write("p:1", 1);
    b.write("p:2", 2);
    b.write("q:1", 3);
    expect(b.list("p:").sort()).toEqual(["p:1", "p:2"]);
  });
});
