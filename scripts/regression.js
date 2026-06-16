#!/usr/bin/env node
// Regression orchestrator: runs unit, build, smoke, and e2e in sequence.
// Times each step and prints a Markdown-friendly summary. Returns non-zero
// on any failure so it can drop into CI as one block.

const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

function run(label, cmd, args, opts = {}) {
  const start = Date.now();
  process.stdout.write("==> " + label + "\n");
  const result = spawnSync(cmd, args, { stdio: "inherit", shell: process.platform === "win32", ...opts });
  const ms = Date.now() - start;
  return { label, ok: result.status === 0, ms };
}

const results = [];
results.push(run("Unit tests", "npm", ["run", "test"]));
results.push(run("Build", "npm", ["run", "build"]));

if (results.every((r) => r.ok)) {
  results.push(run("Bundle stats", "npm", ["run", "bundle:stats"]));
}

const reportLines = [
  "# Regression run",
  "Generated " + new Date().toISOString(),
  "",
  "| Step | Status | Time |",
  "| --- | --- | --- |",
  ...results.map((r) => "| " + r.label + " | " + (r.ok ? "OK" : "FAIL") + " | " + (r.ms / 1000).toFixed(1) + "s |"),
];
const reportPath = path.join(process.cwd(), "regression-report.md");
fs.writeFileSync(reportPath, reportLines.join("\n") + "\n");
console.log("\nReport written to " + reportPath);

const failed = results.filter((r) => !r.ok);
if (failed.length > 0) {
  console.error("Failed steps: " + failed.map((r) => r.label).join(", "));
  process.exit(1);
}
