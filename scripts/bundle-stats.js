#!/usr/bin/env node
// Reports the size of the largest client chunks after a Next.js build.

const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();
const staticDir = path.join(root, ".next", "static");

if (!fs.existsSync(staticDir)) {
  console.error("No .next/static directory found. Run npm run build first.");
  process.exit(1);
}

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(p));
    else if (entry.isFile()) out.push(p);
  }
  return out;
}

const files = walk(staticDir).filter((f) => /\.(js|css)$/.test(f));
const sized = files.map((f) => ({ file: path.relative(root, f), bytes: fs.statSync(f).size }));
sized.sort((a, b) => b.bytes - a.bytes);

const totalJs = sized.filter((s) => s.file.endsWith(".js")).reduce((a, b) => a + b.bytes, 0);
const totalCss = sized.filter((s) => s.file.endsWith(".css")).reduce((a, b) => a + b.bytes, 0);

console.log("Top 15 client chunks:");
for (const s of sized.slice(0, 15)) {
  const kb = (s.bytes / 1024).toFixed(1).padStart(7);
  console.log("  " + kb + " KB  " + s.file);
}
console.log("");
console.log("Total JS:  " + (totalJs / 1024).toFixed(1) + " KB");
console.log("Total CSS: " + (totalCss / 1024).toFixed(1) + " KB");
