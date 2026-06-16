# Iteration log

LaunchLens Research Studio is built through an open-ended iteration loop.
Each round adds one self-contained slice of capability and ends with the
unit, e2e, build, and smoke harnesses passing.

## Round 1 - Foundation
Multi-agent skeleton, mock SSE pipeline, baseline UI, schema definitions.

## Round 2 - Report depth
Per-agent rich report sections, copy-to-clipboard, recent queries memory.

## Round 3 - Persistence and ergonomics
Unit test infrastructure, session cache via localStorage, hash-based share
links, dark mode toggle with system preference fallback, print stylesheet.

## Round 4 - Hardening
GitHub Actions CI workflow with lint, typecheck, test, build, smoke jobs.
Mobile sidebar with aria-expanded, accessibility tests, full docs sweep.

## Round 5 - Determinism and governance
Query-aware FNV-1a hashing in the mock provider, lazy report sections,
governance docs (CONTRIBUTING, CODE_OF_CONDUCT, SECURITY).

## Round 6 - End-to-end coverage
Playwright e2e suite, branded logo SVG, skip-link for keyboard users,
fix for the session-bridge crash on completion.

## Round 7 - SEO and discoverability
robots.txt, sitemap.xml, manifest.webmanifest, OpenGraph card, Twitter
card, JSON-LD WebApplication structured data, viewport theme color.

## Round 8 - Performance and observability
Bucketed progress helper to stabilize re-renders, React.memo on AgentCard,
WebVitalsReporter measuring LCP/CLS/INP via PerformanceObserver, no-op
/api/vitals beacon endpoint, scripts/bundle-stats.js.

## Round 9 - Internationalization foundation
Flat dictionary for English, Simplified Chinese, Japanese; LocaleProvider
with localStorage persistence and navigator.language autodetect; header
LanguageSwitcher; first-pass translation of hero, status, errors, header.

## Round 10 - Regression sweep and stability
Regression orchestrator (scripts/regression.js) that runs unit + build +
bundle stats and emits a Markdown report. Iteration log consolidated here.

## Round 11 - Lint debt cleanup
Lint goes from 62 errors to 0. Configured eslint to allow CommonJS in
scripts/e2e and any in tests; documented intent for legacy hooks via
file-level disables; switched <a href="/"> to next/link; escaped quotes;
removed unused imports.

## Round 12 - Pluggable provider architecture
ResearchProvider interface; mock-provider-adapter; OpenAI-compatible
adapter (configurable baseUrl/model, falls back to mock on failure);
provider-registry with env-based selection (OPENAI_API_KEY,
LAUNCHLENS_PROVIDER); engine wired through the registry; .env.example.
9 new unit tests bring the total to 148.

## Round 13 - Deeper i18n through agent labels
22 new dictionary keys covering all 6 agent names/descriptions, status
pills (Waiting, Researching, Complete, Error), studio sidebar header,
"Powered by 6 research agents" caption, keyboard shortcut hints, and
the footer tagline. AgentCard reads translated labels with English
fallback. e2e selectors localized.

## Round 14 - Dynamic imports + a11y polish
Each agent report section now lazy-loads via next/dynamic with a stable
SectionFallback. ReportView region exposes role, aria-label, and
aria-busy for screen readers. Bundle stats show many small per-section
chunks replacing the previous 146 KB blob.

## Round 15 - Full regression sweep + record consolidation
Regression script extended to lint + unit + build + bundle-stats with
status table emitted to regression-report.md. Iteration log updated
through round 15. Health snapshot at round 15: 148 unit / 24 e2e / 0
lint errors / 16 lint warnings / 9 routes / build clean.
