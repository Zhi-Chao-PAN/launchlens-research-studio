# Changelog

All notable changes to LaunchLens Research Studio are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- Query-aware personalization in mock provider: each agent's summary now reflects the actual query and keywords (deterministic via FNV-1a hash)
- `lib/providers/seed.ts` — deterministic seed library (hash32, buildSeed, pickVariant, pickNumber, pickMany, pickBool)
- Lazy-loaded report sections (each report tab downloads independently, reducing initial JS payload)
- `ReportSectionSkeleton` loading state for lazy sections

### Changed
- `ReportView` uses `React.lazy` + `Suspense` for 6 report sections
- `MockProvider` summaries and synthesis execSummary now include query snippet + keyword focus

## [0.2.0] - 2026-06-16

### Added
- GitHub Actions CI workflow (lint, typecheck, test with coverage, build, smoke)
- GitHub Actions CodeQL workflow (weekly security scan)
- Mobile sidebar toggle with `aria-expanded` and `aria-controls`
- `aria-live="polite"` status region for screen reader users
- CHANGELOG.md, CODE_OF_CONDUCT.md, SECURITY.md
- Issue templates (bug, feature)
- 14 new accessibility tests (`src/app/a11y.test.ts`)
- CONTRIBUTING.md with full developer guide

### Changed
- README.md fully rewritten (258 lines) with features, screenshots-ready sections
- Mobile responsive: sidebar collapse on submit/Esc/reset
- Header brand title truncates on small screens

## [0.1.0] - 2026-06-16

### Added
- 6 research agents: Market Sizer, Competitor Analyst, Pain Detective, Pricing Scout, Channel Scout, Synthesis
- Parallel agent execution with SSE real-time progress
- Evidence/citation system with confidence levels (low/medium/high)
- Cross-agent synthesis with opportunity/risk scores
- 3 export formats: Markdown, JSON, CSV (per-domain bundles)
- Per-agent "Copy section" button
- Dark mode (light/dark/system) with localStorage persistence
- Recent research history (last 12 queries, click to re-run)
- Past research cache (last 8 completed sessions, localStorage)
- Shareable session links via URL hash (`#share:{sessionId}`)
- Keyboard shortcuts: `Ctrl/⌘+Enter`, `Esc`, `Ctrl/⌘+?`
- Print-friendly CSS (`@media print`)
- Reduced motion support
- 73 unit tests (validation, formatters, history, share, session-cache)
- Production smoke test (`scripts/smoke-test.js`)
- Error boundary (`error.tsx`), loading state (`loading.tsx`), 404 page (`not-found.tsx`)

### Security
- Input validation on POST /api/research (3-1000 char query, max 12 keywords, max 40 chars per keyword)
- Session ID format validation (alphanumeric only)
- Structured JSON error envelopes (error, field, details)
- Per-agent try/catch in research engine (partial results on failure)
- SSE heartbeat keepalive with proxy-friendly headers
- Agent error events surfaced to UI

---

## Versioning

- **Major** (X.0.0): Breaking changes to public API, output schemas, or UX
- **Minor** (0.X.0): New features, new agents, new exports, backward compatible
- **Patch** (0.0.X): Bug fixes, performance improvements, documentation

## Release cadence

We aim to ship a minor release every 2-3 weeks, with patch releases as needed for bug fixes.

[Unreleased]: https://github.com/Zhi-Chao-PAN/launchlens-research-studio/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/Zhi-Chao-PAN/launchlens-research-studio/releases/tag/v0.2.0
[0.1.0]: https://github.com/Zhi-Chao-PAN/launchlens-research-studio/releases/tag/v0.1.0
