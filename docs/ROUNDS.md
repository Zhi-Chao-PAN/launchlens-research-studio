# Iteration log

LaunchLens Research Studio is built through an open-ended iteration loop.
Each round adds one self-contained slice of capability and ends with the
unit, e2e, build, and lint harnesses passing.

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
WebVitalsReporter measuring LCP/CLS/INP, scripts/bundle-stats.js.

## Round 9 - Internationalization foundation
Flat dictionary for English, Simplified Chinese, Japanese; LocaleProvider
with localStorage persistence and navigator.language autodetect; header
LanguageSwitcher; first-pass translation of hero, status, errors, header.

## Round 10 - Regression sweep and stability
Regression orchestrator (scripts/regression.js).

## Round 11 - Lint debt cleanup
Lint goes from 62 errors to 0.

## Round 12 - Pluggable provider architecture
ResearchProvider interface; mock + OpenAI-compatible adapter; registry.

## Round 13 - Deeper i18n through agent labels
22 new dictionary keys covering all 6 agent names/descriptions, status
pills, sidebar header, footer, keyboard hints.

## Round 14 - Dynamic imports + a11y polish
Each agent report section lazy-loads via next/dynamic. Report region
exposes role, aria-label, aria-busy.

## Round 15 - Full regression sweep + record consolidation
Lint integrated into npm run regression.

## Round 16 - Output validator + Anthropic adapter
Per-agent shape validation. Anthropic Messages API adapter. Registry
rewritten with clean precedence rule.

## Round 17 - Provider streaming with onProgress
ProviderContext gains onProgress. OpenAI adapter requests stream:true,
forwards SSE deltas to engine progress events with step + partial.

## Round 18 - Health endpoint, telemetry ring buffer
/api/health, /api/telemetry, 200-entry ring buffer recording every
agent generation.

## Round 19 - Backoff retry + per-IP rate limit
retryWithBackoff, OpenAI 5xx/429 retry, /api/research per-IP token
bucket.

## Round 20 - Closing the second-tier sweep
docs/ROUNDS.md and docs/FEATURES.md.

## Round 21 - Anthropic streaming + circuit breaker
Anthropic SSE content_block_delta forwarding. Per-provider circuit
breaker with half-open trial. Health and telemetry expose breaker
snapshots.

## Round 22 - Provider/breaker pill in header
ProviderPill polls /api/health and shows live provider id, streaming
flag, and breaker state. i18n keys for mock / breakerOpen / streaming.

## Round 23 - Translated crash and 404 screens
error.tsx and not-found.tsx read from the locale dictionary. Crash
screen offers a copy-trace button and posts a breadcrumb to /api/vitals.

## Round 24 - CHANGELOG sync + operations guide
CHANGELOG.md updated through round 23. docs/OPERATIONS.md covering
provider selection, diagnostics, breaker, rate limit, retry, tuning.

## Round 25 - Final regression sweep
Iteration log updated through round 25. Health snapshot at end of round
25: 190 unit tests, 27 e2e tests, 0 lint errors, 11 routes, build clean,
~720 KB total client JS.
