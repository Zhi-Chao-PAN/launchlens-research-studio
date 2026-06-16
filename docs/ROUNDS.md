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

## Round 13 - Deeper i18n through agent labels
22 new dictionary keys covering all 6 agent names/descriptions, status
pills (Waiting, Researching, Complete, Error), studio sidebar header,
"Powered by 6 research agents" caption, keyboard shortcut hints, and
the footer tagline. AgentCard reads translated labels with English
fallback. e2e selectors localized.

## Round 14 - Dynamic imports + a11y polish
Each agent report section now lazy-loads via next/dynamic with a stable
SectionFallback. ReportView region exposes role, aria-label, and
aria-busy for screen readers.

## Round 15 - Full regression sweep + record consolidation
Regression script extended to lint + unit + build + bundle-stats with
status table emitted to regression-report.md.

## Round 16 - Runtime output validator + Anthropic Messages adapter
output-validator.ts asserts AgentOutput shape per agent and patches a
wrong discriminator. Anthropic Messages adapter (x-api-key header,
anthropic-version, mock fallback). Provider registry rewritten with a
clean precedence rule: forced override -> Anthropic key -> OpenAI key
-> mock.

## Round 17 - Provider streaming with onProgress
ProviderContext gains an optional onProgress callback. Mock synthesizes
4 progress checkpoints. OpenAI adapter requests stream:true when
onProgress is provided, decodes SSE deltas, and forwards partial text
plus a fraction estimate. Engine forwards provider progress as SSE
progress events with step + partial fields.

## Round 18 - Health endpoint, telemetry ring buffer
/api/health reports status, version, uptime, and live provider info.
src/lib/telemetry/telemetry.ts records the last 200 agent generations
with provider id, duration, ok flag, and error. /api/telemetry exposes
a summary plus the most recent N entries. Engine writes a telemetry
record per agent generation regardless of success.

## Round 19 - Backoff retry + per-IP rate limit
src/lib/utils/retry.ts provides retryWithBackoff with exponential
backoff, jitter, AbortSignal cooperation, and a shouldRetry guard.
The OpenAI adapter retries 5xx and 429 up to 3 times then falls back
to the mock; 4xx errors degrade immediately. src/lib/api/rate-limit.ts
adds a per-key token bucket. POST /api/research is rate-limited per
X-Forwarded-For with default 10 requests / 60 seconds.

## Round 20 - Closing the second-tier sweep
Iteration log updated through round 20. README feature inventory and
runtime variable matrix added so newcomers can see the full surface
at a glance. Health snapshot at end of round 20: 182 unit tests,
26 e2e tests, 0 lint errors, 11 routes, build clean, 720 KB total
client JS spread across many small chunks.
