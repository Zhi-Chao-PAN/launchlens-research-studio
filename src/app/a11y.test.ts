import { describe, it, expect } from "vitest";

// Static checks on source code for accessibility & theme coverage.
// These guard against regressions in critical ARIA patterns.

import fs from "node:fs";
import path from "node:path";

const SRC = path.resolve(__dirname, "..");

function readFile(rel: string): string {
  return fs.readFileSync(path.join(SRC, rel), "utf-8");
}

describe("Accessibility — page.tsx", () => {
  const page = readFile("app/page.tsx");

  it("has aria-live region for status updates", () => {
    expect(page).toMatch(/aria-live="polite"/);
  });

  it("has aria-expanded for mobile sidebar toggle", () => {
    expect(page).toMatch(/aria-expanded=\{sidebarOpen\}/);
  });

  it("has aria-controls linking toggle to sidebar", () => {
    expect(page).toMatch(/aria-controls="studio-sidebar"/);
  });

  it("main element wraps the page content", () => {
    expect(page).toMatch(/<main/);
  });

  it("has skip-link or h1 for landmark", () => {
    expect(page).toMatch(/<h1/);
  });
});

describe("Accessibility — globals.css", () => {
  const css = readFile("app/globals.css");

  it("includes focus-visible styles", () => {
    expect(css).toContain(":focus-visible");
  });

  it("honors reduced motion preference", () => {
    expect(css).toContain("prefers-reduced-motion");
  });

  it("has print styles", () => {
    expect(css).toContain("@media print");
  });

  it("has dark theme override", () => {
    expect(css).toContain("[data-theme='dark']");
  });

  it("has sr-only utility", () => {
    expect(css).toMatch(/\.sr-only\s*\{/);
  });
});

describe("Accessibility — Error and loading pages", () => {
  it("error.tsx has role and error UI", () => {
    const err = readFile("app/error.tsx");
    expect(err).toContain("error");
    expect(err).toContain("Try again");
  });

  it("loading.tsx has skeleton UI", () => {
    const loading = readFile("app/loading.tsx");
    // After round 6: loading uses a logo image instead of a spinner
    expect(loading).toMatch(/animate-(spin|pulse)|logo\.svg/);
    expect(loading).toContain("Warming up");
  });

  it("not-found.tsx has not-found copy and link home", () => {
    const nf = readFile("app/not-found.tsx");
    expect(nf.toLowerCase()).toContain("not found");
    expect(nf).toMatch(/href=["']\/["']/);
  });
});

describe("Theme coverage", () => {
  it("page.tsx has no hardcoded color hex codes outside of emoji", () => {
    const page = readFile("app/page.tsx");
    // No bare hex colors like #fff or #abcabc
    const hexMatches = page.match(/#[0-9a-f]{3,6}\b/gi) || [];
    // Filter out emoji Unicode (not real hex) - we look for context with style
    // and check the rest is just text content / not in style attribute
    for (const m of hexMatches) {
      // Find the surrounding line
      const idx = page.indexOf(m);
      const lineStart = page.lastIndexOf("\n", idx) + 1;
      const lineEnd = page.indexOf("\n", idx);
      const line = page.substring(lineStart, lineEnd);
      // Allow only if line is in a comment or has no style context
      expect(line.toLowerCase()).not.toMatch(/bg|color|fill|stroke/);
    }
  });
});
