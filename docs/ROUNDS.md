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
All GET routes and the SSE stream are unaffected 鈥?CSRF only applies to
state-changing POST endpoints.

## Round 34 - Rate-limit bypass tokens / auth scaffold
src/lib/api/bypass-tokens.ts with SHA-256 hashed token store backed by
the storage backend. LAUNCHLENS_BYPASS_TOKENS env var for provisioning
tokens at startup. createBypassToken(), listBypassTokens(),
revokeBypassToken(), isBypassToken(), extractBearerToken(). POST
/api/research skips rate limiting and strict CSRF when a valid bearer
token is present. /api/admin/tokens REST endpoint for token management
(GET list, POST create, DELETE by hash) 鈥?protected by bearer token auth.
All tokens are hashed at rest so a leaked storage file is not usable.

## Round 35 - Regression sweep and consolidation
Full regression sweep (lint + unit + build + bundle-stats) all green.
Lint fixes across csrf.ts, bypass-tokens.ts, admin tokens route 鈥?moved
from require() to top-level node:crypto imports, removed unused imports,
replaced `any` with typed body. Research route restored with proper CSRF
check after bypass token gate. Regression report regenerated. Health
snapshot at end of round 35: 233 unit tests, 16 routes, 0 lint errors,
795 KB total client JS.

## Round 36 - Token scopes + admin endpoint rate limiting
Token scope system: "bypass" (skips rate limits) and "admin" (full admin
API access + bypass). Bypass tokens can't call /api/admin/*. Env tokens:
LAUNCHLENS_BYPASS_TOKENS for bypass-scope, LAUNCHLENS_ADMIN_TOKENS for
admin-scope. checkAdminRateLimit() limits admin endpoints by both IP
(30/min) and token hash (100/min) to prevent abuse of a leaked admin
token. Token info now tracks lastIp alongside lastUsedAt and usageCount.
Admin endpoints return X-RateLimit-Remaining headers. 239 unit tests,
build clean, 16 routes.

## Round 37 - Authentication audit log
src/lib/api/auth-audit.ts with 100-event ring buffer of security events:
token_created, token_revoked, auth_success, auth_failed, csrf_failed,
rate_limited, admin_action. Events include ipHash, tokenHash, scope,
detail, and userAgent. Persisted via the storage backend.

Wired into all security touchpoints:
- /api/research: csrf_failed, rate_limited, auth_success (bypass)
- bypass-tokens.ts: token_created, token_revoked, auth_success/failed
- /api/admin/tokens: admin_action, auth_failed
- /api/admin/tokens/[hash]: admin_action (revoke), auth_failed

New /api/admin/audit endpoint (admin scope required) returns recent
events with configurable limit (default 50, max 100).
245 unit tests, build clean, 17 routes, 0 lint errors.

## Round 38 - Security e2e tests + admin e2e tests
Two new e2e test suites covering the security surface:

- e2e/security-e2e.js (10 tests): CSRF endpoint, soft enforcement,
  mismatched token 403, rate limiting activation, admin endpoint auth
  rejection (no auth + fake token), audit endpoint auth rejection.

- e2e/admin-e2e.js (21 tests): env-provisioned admin token, token CRUD
  via admin API (bypass + admin scopes), bypass-scope isolation (can't
  call admin), bypass token actually skips rate limits, audit log
  queries with event type verification, limit parameter, token
  revocation verification, admin endpoint rate limiting.

Regression script updated to run both suites. Security tests run in
under 2s; admin tests run in under 2s. Total e2e security coverage:
31 tests, all passing.
245 unit tests, build clean, 17 routes, 0 lint errors.

## Round 39 - Visual regression stabilization + baseline refresh
Fixed three sources of e2e flakiness and refreshed visual baselines:

1. Fixed `gotoUrl is not defined` crash in mobile viewport test (renamed
   to BASE_URL, pre-existing bug).
2. Replaced flaky "Research Agents" heading waitForSelector with
   `button[aria-controls="studio-sidebar"]` 鈥?a far more reliable
   signal that the studio layout has mounted.
3. Added `settle(page, ms)` helper for freeze mode: scroll-to-top,
   injects `transition: none !important; animation: none !important`
   style tag, and waits for visual stability. Applied to all 8
   screenshot points with context-appropriate wait times.
4. Removed duplicated security tests from the main browser e2e suite
   (now covered by dedicated security-e2e.js and admin-e2e.js).
5. Refreshed all 8 baseline screenshots under freeze mode. Verified
   8/8 pixel-perfect match on re-run (0 drift).

245 unit tests + 31 security/admin e2e + 29 browser e2e = 305 total
automated tests. Build clean, 17 routes, 0 lint errors.

## Round 40 - Full regression sweep + 5-round cycle report
Full regression suite passes end-to-end: lint, unit tests, build,
bundle stats, browser E2E, security E2E, and admin E2E 鈥?all green.

Fixed e2e ordering in regression script (browser E2E before API E2E) to
prevent rate-limit starvation of the browser test flow.

Published cycle 08 summary (Rounds 36-40) at docs/cycle-08-r36-40.md
covering the security hardening cycle: token scopes, admin rate
limiting, audit log, 31 security e2e tests, and visual regression
stabilization down to 0 drift in freeze mode.

Stats at end of R40: 305 automated tests (245 unit + 31 security/admin
e2e + 29 browser e2e), 17 API routes, 0 lint errors, build clean,
8/8 visual baselines pixel-perfect in freeze mode.

## Round 41 - CORS hardening + strict mode
CORS security layer for all API endpoints, with two modes:

- **Permissive mode** (default): `Access-Control-Allow-Origin: *`
  for local development and open deployments.

- **Strict mode** (enabled via `LAUNCHLENS_CORS_ORIGINS` env var):
  comma-separated allowlist of origins. Only listed origins are
  allowed; responses include origin-specific ACAO, `Vary: Origin`,
  and `Access-Control-Allow-Credentials: true`. Disallowed origins
  get a 403 with descriptive error.

**New files:**
- `src/lib/api/cors.ts` 鈥?`checkCors()`, `handleOptions()`,
  `withCorsHeaders()`, and `corsConfig` utilities.
- `src/lib/api/cors.test.ts` 鈥?8 unit tests.
- `e2e/cors-e2e.js` 鈥?10 end-to-end tests covering disallowed
  origin rejection, allowed origin headers, OPTIONS preflight,
  same-origin requests, and admin endpoint CORS enforcement.
- `e2e/security-e2e.js` already covers CORS indirectly.

**Routes protected:**
- `/api/research` (POST + OPTIONS) 鈥?full CORS check + headers on 201
- `/api/csrf` (GET + OPTIONS) 鈥?CORS check + headers
- `/api/admin/tokens` (GET/POST + OPTIONS) 鈥?CORS check + headers
- `/api/admin/tokens/[hash]` (DELETE + OPTIONS) 鈥?CORS check + headers
- `/api/admin/audit` (GET + OPTIONS) 鈥?CORS check + headers

10 new CORS e2e tests (all passing in ~1.5s). Total automated tests:
315. Build clean, 17 routes, 0 lint errors.


## Round 42 - Auth audit alerting system

Real-time security alert engine that monitors the auth audit log for
suspicious patterns and triggers alerts. Four detection rules:

- **auth_failed burst** (default: 10 in 60s, severity: warning)
- **csrf_failed burst** (default: 5 in 60s, severity: warning)
- **rate_limited burst** (default: 20 in 60s, severity: info)
- **New admin token creation** (always alerts, severity: critical)

Sliding-window detection per IP hash with per-window cooldown so a
sustained burst doesn't flood the buffer. 50-alert ring buffer.

**Alert delivery:**
- In-memory buffer queryable via admin API
- Webhook POST (configurable via LAUNCHLENS_ALERT_WEBHOOK_URL)
  with structured JSON payload and 5s timeout, best-effort delivery

**New files:**
- src/lib/api/auth-alerts.ts -- alert engine + sliding window
  detection + webhook delivery, 13 unit tests
- src/lib/api/auth-alerts.test.ts -- 13 unit tests covering all
  four detection rules, cooldown behavior, clear, and config
- src/app/api/admin/alerts/route.ts -- admin endpoint:
  - GET /api/admin/alerts -- list recent alerts (with ?limit=)
  - GET /api/admin/alerts?config=1 -- show alert thresholds
  - DELETE /api/admin/alerts -- clear all alerts
- Pub/sub added to uth-audit.ts via onAuthAuditEvent() so any
  module can subscribe to audit events in real time.

**New e2e tests:** 16 new alerts tests in e2e/admin-e2e.js,
including config view, empty list, unauthorized access, auth_failed
burst detection, critical alert on admin token creation, limit
parameter, and clear/delete.

Total automated tests: 303 (263 unit + 40 admin e2e). Lint: 0 errors,
23 warnings. Build: 17 routes, ~795 KB client JS. All regression
checks green.

## Round 43 - HMAC webhook signature verification

Signed webhook payloads so recipients can verify alert authenticity
and resist replay attacks.

- **HMAC-SHA256** signature in X-LaunchLens-Signature header
  (format: sha256=<hex>) when LAUNCHLENS_ALERT_WEBHOOK_SECRET
  is configured.
- **Replay protection**: signature covers 	imestamp.body using the
  X-LaunchLens-Timestamp (Unix seconds) so the same payload can't
  be replayed later.
- **sent_at field** added to the webhook JSON payload for receiver-side
  timestamp validation.
- **webhookSecretEnabled** field added to the alerts config endpoint
  so operators can confirm signing is active.
- _computeWebhookSignature() exported for testing.

**New tests:**
- 3 new unit tests covering empty-secret behavior, signature
  consistency, and timestamp-based replay protection.
- 1 new admin e2e test verifying webhookSecretEnabled defaults to false.

Total: 266 unit tests, 44 admin e2e tests. All regression checks green.
Lint: 0 errors. Build: 17 routes, ~795 KB client JS.

## Round 44 - Audit log export (CSV + JSONL)

Admin audit endpoint now supports structured export formats for
offline analysis and integration with SIEM tools.

**Export formats:**
- **GET /api/admin/audit?format=csv** — RFC-4180 compliant CSV with
  proper escaping of commas, quotes, and newlines. Includes header
  row and ISO-8601 timestamps. Download filename:
  launchlens-audit-YYYY-MM-DD.csv.
- **GET /api/admin/audit?format=jsonl** — Newline-delimited JSON,
  one event per line, ISO-8601 timestamps. Ideal for piping into
  jq or log ingestion pipelines.
- **GET /api/admin/audit** (default) — JSON object format, unchanged.

**Audit trail of exports:** CSV and JSONL exports themselves generate
an dmin_action audit event (udit_export:csv /
udit_export:jsonl) so you know who pulled the data and when.

**New e2e tests:** 10 tests covering CSV header + data rows + content
type + content-disposition, JSONL valid JSON + content type +
content-disposition, and export action appearing in audit log.

Total automated tests: 320 (266 unit + 54 admin e2e). All regression
checks green. Build: 17 routes, ~795 KB client JS.

## Round 45 - Regression sweep + cycle 09 report

Full regression sweep after the security hardening sprint:

- **Lint**: 0 errors, 23 warnings (all transitional)
- **Unit tests**: 266/266 across 32 files
- **Build**: 19 routes (13 dynamic + 6 static), ~795 KB client JS
- **Admin e2e**: 54/54
- **Security e2e**: 31/31
- **CORS e2e**: 10/10
- **Browser e2e**: 29/29 (with E2E_FREEZE=1)
- **Bundle stats**: stable at ~795 KB JS, 52.7 KB CSS
- **Regression report**: regenerated, all sections green

Cycle 09 report written to docs/cycle-09-r41-45.md summarizing
rounds 41–45 (CORS hardening, auth alerts, HMAC webhook signatures,
audit export, regression sweep).

## Round 46 - Admin settings UI

Browser-facing admin console at /admin for token management and
security observability — no more need to curl the API directly.

**Three tabs, all client-side (token stored in localStorage):**

- **Tokens** — create tokens (bypass or admin scope), view active
  tokens with label/scope/hash/created/last-used, revoke tokens.
  New tokens display once with a "save this" warning.
- **Audit Log** — 20 most recent events, with CSV/JSONL export links.
  Auto-refreshes every 5 seconds.
- **Alerts** — security alerts with severity coloring (critical red,
  warning amber, info indigo), clear-all action. Auto-refreshes.

**Design:**
- Dark theme matching the diagnostics page aesthetic
- Responsive layout (mobile-friendly)
- Sticky header with Studio / Diagnostics / Sign out links
- Error banner for API failures
- Login screen with token input (unauthenticated state)

**New files:**
- src/app/admin/page.tsx — client component admin console
- e2e/admin-ui-e2e.js — 8 e2e tests covering page render, API
  accessibility, and CSS inclusion

No new backend — all powered by the existing admin API endpoints.
Total automated tests: 348 (266 unit + 82 e2e). Lint: 0 errors,
25 warnings. Build: 20 routes, ~795 KB client JS.

## Round 47 - Webhook retry queue with exponential backoff

Webhook delivery is no longer fire-and-forget. Failed deliveries are
retried with exponential backoff and jitter, with a bounded queue to
prevent unbounded memory growth.

**Retry behavior:**
- **Max retries:** 5 (configurable via LAUNCHLENS_ALERT_WEBHOOK_MAX_RETRIES)
- **Initial delay:** 1s (configurable via LAUNCHLENS_ALERT_WEBHOOK_RETRY_DELAY)
- **Backoff:** exponential (2^n) with 20% jitter, capped at 60s
- **Queue size:** max 100 entries; oldest dropped when full
- **Dead letter:** alerts are dropped after max retries (best-effort)

**Queue health:**
- GET /api/admin/alerts?stats=1 returns webhook queue stats:
  pending count, total queued, max retries, max queue size
- getWebhookQueueStats() exported for programmatic use
- _resetWebhookQueue() exported for testing

**New tests:**
- 4 new unit tests covering queue stats, empty queue behavior,
  max size enforcement, and reset
- 5 new admin e2e tests for the stats endpoint

Total automated tests: 357 (270 unit + 87 e2e). Lint: 0 errors.
Build: 20 routes, ~809 KB client JS. All regression checks green.

## Round 48 - Trusted IP ranges for rate limit bypass

Trusted IP addresses and CIDR ranges bypass rate limiting entirely,
making the studio usable from known-safe locations (internal networks,
monitoring systems, CI) without needing bypass tokens.

**Configuration:** LAUNCHLENS_TRUSTED_IPS env var with
comma-separated entries. Supports:
- Individual IPv4 addresses (127.0.0.1, 10.0.0.5)
- IPv4 CIDR ranges (10.0.0.0/8, 192.168.1.0/24)
- Individual IPv6 addresses (::1, e80::1)

**Implementation:**
- src/lib/api/trusted-ips.ts — parser + match function with
  numeric IPv4 CIDR matching
- checkRateLimitForIp() in ate-limit.ts — wraps the existing
  rate limiter with a trusted IP check first
- Research API endpoint uses checkRateLimitForIp() instead of raw
  checkRateLimit() so trusted IPs skip the bucket

**New tests:**
- 21 unit tests for trusted IPs (empty config, exact IPv4, CIDR
  ranges, IPv6, mixed, invalid inputs, bad CIDR prefixes)
- 3 new security e2e tests (trusted IP bypass, CIDR range bypass,
  untrusted IP still rate-limited)

Total automated tests: 363 (291 unit + 72 e2e). Lint: 0 errors.
Build: 20 routes, ~809 KB client JS. All regression checks green.

## Round 49 - Audit log filtering + admin UI System tab

Admin console gets significantly more useful with filtering capabilities
and a new System tab for infrastructure visibility.

**Audit log filtering:**
- GET /api/admin/audit?type=X — filter by event type
- GET /api/admin/audit?scope=X — filter by token scope
- GET /api/admin/audit?type=a,b&scope=admin — combine multiple filters
- Multi-type filter with comma-separated values
- Works with all export formats (CSV, JSONL, JSON)

**Admin UI System tab:**
- Webhook health: pending deliveries, max retries, initial delay, max queue size
- Trusted IPs info: explanation of bypass behavior and env var configuration
- Clean status card layout matching the rest of the admin console

**Admin UI Audit tab:**
- Dropdown filter for event type (8 common types + "All types")
- Filter applies to both the table view and auto-refresh

**New e2e tests:**
- 7 new admin e2e tests covering type filter, scope filter, combined
  filters, multi-type filter, and stats endpoint

Total automated tests: 370 (291 unit + 79 e2e). Lint: 0 errors,
28 warnings. Build: 20 routes, ~809 KB client JS. All regression
checks green.

## Round 50 - Regression sweep + cycle 10 report

Full regression sweep closing out cycle 10:

- **Lint**: 0 errors, 28 warnings (all transitional)
- **Unit tests**: 291/291
- **Build**: 20 routes, ~809 KB client JS
- **Admin e2e**: 66/66
- **Security e2e**: 13/13
- **CORS e2e**: 10/10
- **Admin UI e2e**: 8/8
- **Total automated tests: 417**
- **Regression report**: regenerated, all sections green

Cycle 10 report written to docs/cycle-10-r46-50.md summarizing
rounds 46–50 (admin UI, webhook retry queue, trusted IP ranges,
audit filtering + system tab, regression sweep).

### 已完成 50 轮迭代
从 R1 到 R50，十个完整的迭代周期，覆盖了从基础项目搭建到研究功能、
安全加固、管理控制台的全维度打磨。

## Round 51 - Research run persistence + history + detail pages

Research runs are now saved and browsable. Completed sessions persist
across server restarts (when LAUNCHLENS_STORAGE_DIR is configured) and
are accessible via a history page and individual detail pages.

**Storage layer:**
- src/lib/research/storage.ts — in-memory + disk-backed storage
- saveResearchRun(), listResearchRuns(), getResearchRun(), deleteResearchRun()
- LAUNCHLENS_STORAGE_DIR for persistence (JSON files on disk)
- 50-run in-memory cache when no storage dir is set
- 14 unit tests including integration tests

**API endpoints:**
- GET /api/research/runs?limit=N — paginated list of recent runs (summary)
- GET /api/research/runs/[id] — full run detail with result + sources

**UI pages:**
- /history — run history list with status badges, keywords, timestamps
- /research/[id] — full run detail page with sources + result
- Markdown export button on detail page
- Dark theme, responsive layout, auto-refresh every 10s

**Integration:**
- Research engine auto-saves completed runs to storage
- Best-effort — save failures don't break the research run
- 19 new history e2e tests (pages + API + integration)

Total automated tests: 426 (305 unit + 121 e2e). Lint: 0 errors,
31 warnings. Build: 22 routes, ~809 KB client JS. All regression
checks green.

## Round 52 - Search, filter, export, and bulk deletion for research runs

History page gets search + filtering capabilities, and the research runs
API gains export formats and bulk operations.

**Storage module improvements:**
- searchResearchRuns() — query search + status filter + provider filter + pagination
- ulkDeleteRuns(ids) — delete multiple runs at once
- exportRuns(format, ids?) — export in JSON / CSV / JSONL formats
- 14 new unit tests (28 total for storage module)

**API enhancements:**
- GET /api/research/runs?q=X — search by query text or keywords
- GET /api/research/runs?status=completed|failed — filter by status
- GET /api/research/runs?provider=X — filter by provider
- GET /api/research/runs?offset=N&limit=M — paginated results
- GET /api/research/runs?format=json|csv|jsonl — export all runs
- DELETE /api/research/runs?ids=a,b,c — bulk delete runs
- Returns 	otal, offset, limit for pagination awareness

**History page UI:**
- Search input (300ms debounced)
- Status filter dropdown (all / completed / failed)
- JSON + CSV export links
- Shows total count of matching runs
- Responsive layout

**E2E coverage:**
- 22 new tests covering search, filters, combined filters,
  JSON/CSV/JSONL export, bulk delete, and pagination
- 41 total history e2e tests

Total automated tests: 448 (305 unit + 143 e2e). Lint: 0 errors,
32 warnings. Build: 22 routes, ~831 KB client JS. All regression
checks green.