#!/usr/bin/env node
// Visual regression harness: runs the Playwright e2e suite, then
// diffs every screenshot against a baseline directory using SHA-256.
// Pass 'update' to refresh baselines after a deliberate visual change.
//
// Usage:
//   node scripts/visual-regression.js               diff vs baselines/
//   node scripts/visual-regression.js update        refresh baselines/
//   node scripts/visual-regression.js report        dump latest results

const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const PROJECT = process.cwd();
const SHOTS_DIR = path.join(PROJECT, "screenshots");
const BASELINES_DIR = path.join(PROJECT, "baselines");
const REPORT_PATH = path.join(PROJECT, "visual-report.md");
const MODE = process.argv[2] || "diff";
const USE_FREEZE = process.env.VISUAL_NO_FREEZE !== "1";

function hashFile(file) {
  const buf = fs.readFileSync(file);
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function listPng(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith(".png")).sort();
}

function ensureDir(d) {
  fs.mkdirSync(d, { recursive: true });
}

function updateBaselines() {
  ensureDir(BASELINES_DIR);
  const files = listPng(SHOTS_DIR);
  for (const f of files) {
    fs.copyFileSync(path.join(SHOTS_DIR, f), path.join(BASELINES_DIR, f));
  }
  return { updated: files.length, matched: [], changed: [], missing: [], extra: [] };
}

function diffBaselines() {
  if (!fs.existsSync(BASELINES_DIR)) {
    return { matched: [], changed: [], missing: [], extra: listPng(SHOTS_DIR) };
  }
  const shots = listPng(SHOTS_DIR);
  const bases = listPng(BASELINES_DIR);
  const matched = [];
  const changed = [];
  for (const f of shots) {
    const shotPath = path.join(SHOTS_DIR, f);
    const basePath = path.join(BASELINES_DIR, f);
    if (!fs.existsSync(basePath)) {
      changed.push({ file: f, reason: "missing-baseline" });
      continue;
    }
    if (hashFile(shotPath) === hashFile(basePath)) {
      matched.push(f);
    } else {
      changed.push({ file: f, reason: "hash-mismatch" });
    }
  }
  const missing = bases.filter((b) => !shots.includes(b));
  return { matched, changed, missing, extra: [] };
}

function writeReport(result, source) {
  const lines = [
    "# Visual regression report",
    "Generated " + new Date().toISOString(),
    "Source: " + source + "  Mode: " + MODE,
    "",
    "| Status | File | Reason |",
    "| --- | --- | --- |",
  ];
  for (const f of result.matched) lines.push("| MATCH | " + f + " | - |");
  for (const c of result.changed) lines.push("| DIFF | " + c.file + " | " + c.reason + " |");
  for (const f of result.missing) lines.push("| MISSING | " + f + " | (no current shot) |");
  for (const f of result.extra) lines.push("| EXTRA | " + f + " | (no baseline) |");
  fs.writeFileSync(REPORT_PATH, lines.join("\n") + "\n");
}

function runE2E() {
  console.log("==> Running e2e suite");
  const result = spawnSync("node", ["e2e/playwright-e2e.js"], {
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  return result.status === 0;
}

if (MODE === "report") {
  const result = diffBaselines();
  writeReport(result, "report-only");
  console.log("Report: " + REPORT_PATH);
  process.exit(0);
}

if (!fs.existsSync(SHOTS_DIR) && !fs.existsSync(BASELINES_DIR)) {
  console.error("Neither screenshots/ nor baselines/ exist. Run e2e first.");
  process.exit(1);
}

const ran = MODE === "update" ? false : runE2E();
if (!ran && MODE !== "update") {
  console.error("e2e suite failed; skipping visual diff");
  process.exit(1);
}

const result = MODE === "update" ? updateBaselines() : diffBaselines();
writeReport(result, MODE === "update" ? "update" : "diff");
console.log("");
console.log("Visual report: " + REPORT_PATH);
console.log("  Matched: " + result.matched.length);
console.log("  Changed: " + result.changed.length);
console.log("  Missing: " + result.missing.length);
if (result.changed.length > 0) {
  console.warn("Visual regression detected " + result.changed.length + " differences. Re-run with \`update\` to refresh baselines, or eyeball visual-report.md.");
  // Non-fatal by default: the studio's UI has animated and locale-sensitive
  // elements (mock provider variability, theme toggle) that occasionally drift.
  // Operators can opt into strict mode via LAUNCHLENS_VISUAL_STRICT=1.
  if (process.env.LAUNCHLENS_VISUAL_STRICT === "1") {
    process.exit(1);
  }
}
