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
Iteration log updated through round 25.

## Round 26 - Pluggable storage + structured request log
src/lib/storage/storage.ts with in-memory and JSON file backends.
Telemetry ring and circuit breaker hydrate and persist via storage.
src/lib/telemetry/request-log.ts with privacy-conscious ip-hash.
POST /api/research logs every response with status, latency, ip-hash,
and UA snippet. /api/telemetry surfaces a new requests field.

## Round 27 - Query-driven mock variability
applyQueryVariability augments the canonical list-shaped fields with
extras drawn deterministically from a query-keyed variant pool.
Same query still produces the same output; distinct queries produce
visibly different shapes and citations.

## Round 28 - Visual regression harness
scripts/visual-regression.js with diff, update, and report modes. SHA-256
based screenshot comparison. Non-fatal by default with LAUNCHLENS_VISUAL_STRICT=1
opt-in. e2e locked to a stable en locale via addInitScript.

## Round 29 - /diagnostics dashboard
Server-rendered observability page reading summary, breaker snapshot,
request log, and recent telemetry. No new dependencies. Three summary
cards, provider breakdown bars, breaker table, requests table, and
agent generations table.

## Round 30 - Final regression sweep and record
Iteration log updated through round 30. README and docs remain current.
Health snapshot at end of round 30: 201 unit tests, 29 e2e tests, 0 lint
errors, 12 routes (4 static, 8 dynamic), build clean, ~720 KB total
client JS spread across many small chunks. npm run regression emits
lint + unit + build + bundle-stats in 32 s end-to-end.

## Round 31 - SSE reconnect + provider flip history
src/lib/utils/sse-reconnect.ts with readSseWithReconnect(), OpenAI and
Anthropic event parsers, RetriableSseError tag, and exponential-backoff
reconnect. Both provider adapters now use the reconnect helper for
streaming requests so transient mid-stream drops don't silently degrade
to mock. src/lib/utils/flip-history.ts ring buffer recording breaker
open/close and provider flip events, persisted through the storage
backend. /api/health returns a flipHistory field with the last 20
events. /diagnostics adds a "State transition history" table and a
third summary card showing total events.

## Round 32 - Visual regression freeze mode
src/lib/perf/use-freeze-mode.ts hook that reads ?freeze=1 from the URL
and disables all CSS animations and transitions globally for
deterministic screenshots. Home page calls useFreezeMode() at the root.
E2E test respects E2E_FREEZE=1 env var and navigates with ?freeze=1.
Visual regression harness enables freeze mode by default (opt out with
VISUAL_NO_FREEZE=1). Screenshots 2 and 3 get a brief stabilization wait
when freeze mode is on to ensure consistent frame timing.

## Round 33 - CSRF token on POST /api/research
src/lib/api/csrf.ts with double-submit cookie pattern, soft enforcement
by default (LAUNCHLENS_CSRF_STRICT=1 for hard 403s). /api/csrf endpoint
issues tokens via httpOnly cookie + JSON body. src/lib/api/csrf-client.ts
caches token client-side and provides fetchWithCsrf() helper.
use-research-studio.ts uses fetchWithCsrf for the research start POST.
All GET routes and the SSE stream are unaffected — CSRF only applies to
state-changing POST endpoints.

## Round 34 - Rate-limit bypass tokens / auth scaffold
src/lib/api/bypass-tokens.ts with SHA-256 hashed token store backed by
the storage backend. LAUNCHLENS_BYPASS_TOKENS env var for provisioning
tokens at startup. createBypassToken(), listBypassTokens(),
revokeBypassToken(), isBypassToken(), extractBearerToken(). POST
/api/research skips rate limiting and strict CSRF when a valid bearer
token is present. /api/admin/tokens REST endpoint for token management
(GET list, POST create, DELETE by hash) — protected by bearer token auth.
All tokens are hashed at rest so a leaked storage file is not usable.
