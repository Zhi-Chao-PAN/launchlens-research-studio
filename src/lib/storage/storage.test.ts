/// <reference types="vitest/globals" />
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
    const b = getBackend({ LAUNCHLENS_STORAGE_DIR: dir } as unknown as NodeJS.ProcessEnv);
    expect(b.id.startsWith("file:")).toBe(true);
    b.write("breakers", { failures: 2 });
    setBackendForTests(null);
    const b2 = getBackend({ LAUNCHLENS_STORAGE_DIR: dir } as unknown as NodeJS.ProcessEnv);
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

  it("loadOrDefault returns stored falsy values as-is, not the fallback", () => {
    // 0 / false / "" are real values, not "missing", so they should be
    // returned as-is rather than replaced by the fallback. The previous
    // `v === null` check was correct, but the test only covered the
    // null and "hit" cases. Pin down the other falsy shapes so a future
    // refactor that flips `=== null` to `!v` would fail loudly.
    const b = getBackend({} as NodeJS.ProcessEnv);
    b.write("zero", 0);
    b.write("false", false);
    b.write("empty", "");
    expect(loadOrDefault("zero", 99)).toBe(0);
    expect(loadOrDefault("false", true)).toBe(false);
    expect(loadOrDefault("empty", "fallback")).toBe("");
  });

  it("file backend write does not throw when the target dir is gone", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ll-storage-"));
    setBackendForTests(null);
    const b = getBackend({ LAUNCHLENS_STORAGE_DIR: dir } as unknown as NodeJS.ProcessEnv);
    b.write("k", "first");
    // Remove the dir so the next write can't create a tmp file there.
    fs.rmSync(dir, { recursive: true, force: true });
    expect(() => b.write("k", "second")).not.toThrow();
    setBackendForTests(null);
  });
});
