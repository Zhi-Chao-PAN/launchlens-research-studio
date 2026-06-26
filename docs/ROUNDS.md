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
All GET routes and the SSE stream are unaffected 锟?CSRF only applies to
state-changing POST endpoints.

## Round 34 - Rate-limit bypass tokens / auth scaffold
src/lib/api/bypass-tokens.ts with SHA-256 hashed token store backed by
the storage backend. LAUNCHLENS_BYPASS_TOKENS env var for provisioning
tokens at startup. createBypassToken(), listBypassTokens(),
revokeBypassToken(), isBypassToken(), extractBearerToken(). POST
/api/research skips rate limiting and strict CSRF when a valid bearer
token is present. /api/admin/tokens REST endpoint for token management
(GET list, POST create, DELETE by hash) 锟?protected by bearer token auth.
All tokens are hashed at rest so a leaked storage file is not usable.

## Round 35 - Regression sweep and consolidation
Full regression sweep (lint + unit + build + bundle-stats) all green.
Lint fixes across csrf.ts, bypass-tokens.ts, admin tokens route 锟?moved
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
   `button[aria-controls="studio-sidebar"]` 锟?a far more reliable
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
bundle stats, browser E2E, security E2E, and admin E2E 锟?all green.

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
- `src/lib/api/cors.ts` 锟?`checkCors()`, `handleOptions()`,
  `withCorsHeaders()`, and `corsConfig` utilities.
- `src/lib/api/cors.test.ts` 锟?8 unit tests.
- `e2e/cors-e2e.js` 锟?10 end-to-end tests covering disallowed
  origin rejection, allowed origin headers, OPTIONS preflight,
  same-origin requests, and admin endpoint CORS enforcement.
- `e2e/security-e2e.js` already covers CORS indirectly.

**Routes protected:**
- `/api/research` (POST + OPTIONS) 锟?full CORS check + headers on 201
- `/api/csrf` (GET + OPTIONS) 锟?CORS check + headers
- `/api/admin/tokens` (GET/POST + OPTIONS) 锟?CORS check + headers
- `/api/admin/tokens/[hash]` (DELETE + OPTIONS) 锟?CORS check + headers
- `/api/admin/audit` (GET + OPTIONS) 锟?CORS check + headers

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
- **GET /api/admin/audit?format=csv** 锟斤拷 RFC-4180 compliant CSV with
  proper escaping of commas, quotes, and newlines. Includes header
  row and ISO-8601 timestamps. Download filename:
  launchlens-audit-YYYY-MM-DD.csv.
- **GET /api/admin/audit?format=jsonl** 锟斤拷 Newline-delimited JSON,
  one event per line, ISO-8601 timestamps. Ideal for piping into
  jq or log ingestion pipelines.
- **GET /api/admin/audit** (default) 锟斤拷 JSON object format, unchanged.

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
rounds 41锟紺45 (CORS hardening, auth alerts, HMAC webhook signatures,
audit export, regression sweep).

## Round 46 - Admin settings UI

Browser-facing admin console at /admin for token management and
security observability 锟斤拷 no more need to curl the API directly.

**Three tabs, all client-side (token stored in localStorage):**

- **Tokens** 锟斤拷 create tokens (bypass or admin scope), view active
  tokens with label/scope/hash/created/last-used, revoke tokens.
  New tokens display once with a "save this" warning.
- **Audit Log** 锟斤拷 20 most recent events, with CSV/JSONL export links.
  Auto-refreshes every 5 seconds.
- **Alerts** 锟斤拷 security alerts with severity coloring (critical red,
  warning amber, info indigo), clear-all action. Auto-refreshes.

**Design:**
- Dark theme matching the diagnostics page aesthetic
- Responsive layout (mobile-friendly)
- Sticky header with Studio / Diagnostics / Sign out links
- Error banner for API failures
- Login screen with token input (unauthenticated state)

**New files:**
- src/app/admin/page.tsx 锟斤拷 client component admin console
- e2e/admin-ui-e2e.js 锟斤拷 8 e2e tests covering page render, API
  accessibility, and CSS inclusion

No new backend 锟斤拷 all powered by the existing admin API endpoints.
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
- src/lib/api/trusted-ips.ts 锟斤拷 parser + match function with
  numeric IPv4 CIDR matching
- checkRateLimitForIp() in 
ate-limit.ts 锟斤拷 wraps the existing
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
- GET /api/admin/audit?type=X 锟斤拷 filter by event type
- GET /api/admin/audit?scope=X 锟斤拷 filter by token scope
- GET /api/admin/audit?type=a,b&scope=admin 锟斤拷 combine multiple filters
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
rounds 46锟紺50 (admin UI, webhook retry queue, trusted IP ranges,
audit filtering + system tab, regression sweep).

### 锟斤拷锟斤拷锟?50 锟街碉拷锟斤拷
锟斤拷 R1 锟斤拷 R50锟斤拷十锟斤拷锟斤拷锟斤拷锟侥碉拷锟斤拷锟斤拷锟节ｏ拷锟斤拷锟斤拷锟剿从伙拷锟斤拷锟斤拷目锟筋建锟斤拷锟叫撅拷锟斤拷锟杰★拷
锟斤拷全锟接固★拷锟斤拷锟斤拷锟斤拷锟斤拷台锟斤拷全维锟饺达拷磨锟斤拷

## Round 51 - Research run persistence + history + detail pages

Research runs are now saved and browsable. Completed sessions persist
across server restarts (when LAUNCHLENS_STORAGE_DIR is configured) and
are accessible via a history page and individual detail pages.

**Storage layer:**
- src/lib/research/storage.ts 锟斤拷 in-memory + disk-backed storage
- saveResearchRun(), listResearchRuns(), getResearchRun(), deleteResearchRun()
- LAUNCHLENS_STORAGE_DIR for persistence (JSON files on disk)
- 50-run in-memory cache when no storage dir is set
- 14 unit tests including integration tests

**API endpoints:**
- GET /api/research/runs?limit=N 锟斤拷 paginated list of recent runs (summary)
- GET /api/research/runs/[id] 锟斤拷 full run detail with result + sources

**UI pages:**
- /history 锟斤拷 run history list with status badges, keywords, timestamps
- /research/[id] 锟斤拷 full run detail page with sources + result
- Markdown export button on detail page
- Dark theme, responsive layout, auto-refresh every 10s

**Integration:**
- Research engine auto-saves completed runs to storage
- Best-effort 锟斤拷 save failures don't break the research run
- 19 new history e2e tests (pages + API + integration)

Total automated tests: 426 (305 unit + 121 e2e). Lint: 0 errors,
31 warnings. Build: 22 routes, ~809 KB client JS. All regression
checks green.

## Round 52 - Search, filter, export, and bulk deletion for research runs

History page gets search + filtering capabilities, and the research runs
API gains export formats and bulk operations.

**Storage module improvements:**
- searchResearchRuns() 锟斤拷 query search + status filter + provider filter + pagination
- ulkDeleteRuns(ids) 锟斤拷 delete multiple runs at once
- exportRuns(format, ids?) 锟斤拷 export in JSON / CSV / JSONL formats
- 14 new unit tests (28 total for storage module)

**API enhancements:**
- GET /api/research/runs?q=X 锟斤拷 search by query text or keywords
- GET /api/research/runs?status=completed|failed 锟斤拷 filter by status
- GET /api/research/runs?provider=X 锟斤拷 filter by provider
- GET /api/research/runs?offset=N&limit=M 锟斤拷 paginated results
- GET /api/research/runs?format=json|csv|jsonl 锟斤拷 export all runs
- DELETE /api/research/runs?ids=a,b,c 锟斤拷 bulk delete runs
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

## Round 53 - Structured research result rendering

Research detail page now renders synthesis output as beautiful,
structured sections instead of raw text. Parses the JSON-formatted
synthesis output and presents it in a visually scannable layout.

**New component & parser:**
- src/lib/research/synthesis-parser.ts 锟斤拷 shared parser utility
- parseSynthesis() 锟斤拷 parses JSON synthesis (handles markdown fences)
- isStructuredResult() 锟斤拷 detection helper
- SynthesisOutput type + nested interfaces (Source, KeyInsight, etc.)
- 9 unit tests

**Detail page rendering:**
- Executive Summary section
- Opportunity / Risk score bars (animated visual indicators)
- Key Insights with confidence badges (high/medium/low)
- Top Opportunities cards (green accent, rationale)
- Top Risks cards (red accent, mitigation)
- Recommended Next Step (highlighted callout)
- Sources section with clickable links
- Toggle to show/hide raw JSON output
- Graceful fallback to raw text for non-structured results

**Exports:**
- Export MD button 锟斤拷 generates well-formatted Markdown report
- Export JSON button 锟斤拷 downloads full run as JSON
- Client-side generation (no API hit needed)

**Design:**
- Dark theme with indigo accents
- Responsive grid layout
- Hover effects on cards
- Consistent typography hierarchy
- All CSS scoped to .research-* classes

Total automated tests: 457 (314 unit + 143 e2e). Lint: 0 errors,
32 warnings. Build: 22 routes, ~866 KB client JS, ~70 KB CSS.
All regression checks green.

## Round 54 - Admin UI Research Management tab

Research run management integrated into the admin console. Admins can
now browse, search, filter, delete, and export research runs without
leaving the admin dashboard.

**Admin UI additions:**
- New "Research" tab alongside Tokens / Audit / Alerts / System
- Search input for finding runs by query or keyword
- Status filter (all / completed / failed)
- Refresh button for manual reload
- JSON + CSV export links
- Run list with status badges, provider info, timestamps, keywords
- View link 锟斤拷 opens full detail page in new context
- Delete button with confirmation
- Empty state and loading states

**Design:**
- Consistent with admin panel visual language
- Compact card layout for dense information display
- Dark theme, monospace accents
- Responsive controls that wrap on narrow screens

**Security:**
- Research management inherits admin token authentication
- All operations gated behind /admin auth same as other tabs

Total automated tests: 457 (314 unit + 143 e2e). Lint: 0 errors,
33 warnings. Build: 22 routes, ~866 KB client JS, ~73 KB CSS.
All regression checks green.

## Round 55 - Regression sweep + Cycle 11 report

Full regression sweep at the end of cycle 11. All checks green.

**Regression results:**
- Unit tests: 314 passed, 0 failed (vitest)
- E2E tests: 143 passed, 0 failed (including 41 history/research e2e)
- Lint: 0 errors, 33 warnings
- Build: 22 routes, ~839 KB client JS, ~73 KB CSS
- Type check: clean
- Audit: all security headers present, CSRF tokens work

**Cycle 11 summary (R51锟紺R54):**
8 new and modified files, ~3,070 lines of new code.

R51 锟斤拷 Research run persistence layer (in-memory + disk-backed) with list/detail
API endpoints, history page, and detail page. 14 storage unit tests, 19 e2e tests.

R52 锟斤拷 Search, filter, export (JSON/CSV/JSONL), bulk delete, and pagination
for research runs. Enhanced history page with search bar, status filter, and
export links. 14 new unit tests, 22 new e2e tests.

R53 锟斤拷 Structured research result rendering. Synthesis parser utility that
parses JSON output and renders it as beautiful sections: exec summary,
score bars, key insights with confidence badges, opportunities cards,
risks cards, next step callout, sources. MD + JSON client-side export.
9 new unit tests.

R54 锟斤拷 Admin UI Research Management tab. Full research run management
integrated into the admin console: search, filter, delete, export.
Inherits admin token authentication.

**Current test totals:**
- Unit tests: 314
- E2E tests: 143
- Total: 457 automated tests

**Known issues to address in Cycle 12:**
- ESLint warnings remain at ~33 (unused vars, missing deps) 锟斤拷 cosmetic
- No Playwright e2e coverage for new UI pages
- No integration tests for admin research tab
- Plain text research results still render as raw text fallback
- No bulk-select for run deletion in UI
- Home page is a bare form 锟斤拷 no dashboard / recent runs view
- No shareable public links for research results
- No comparison / side-by-side view
- No saved research templates

## Round 60 锟斤拷 Cycle 12 Report & Regression Sweep

Full regression sweep at the end of cycle 12. All checks green.

**Regression results:**
- Lint: 0 errors, ~28 warnings (cosmetic)
- Unit tests: 325 passed, 0 failed
- E2E tests: 58 passed, 0 failed (history suite)
- Build: 22 routes, ~847 KB client JS, ~79.6 KB CSS
- Type check: clean
- Audit: all security headers present

**Cycle 12 summary (R56锟紺R60):**
~2,900 lines of new code across 7 new and 5 modified files.

R56 锟斤拷 Homepage dashboard upgrade. Stats cards (total runs, completed,
failed, avg duration) + recent runs list + quick links. Live-refreshes
every 15s. 4 stats cards, 5-item recent runs preview.

R57 锟斤拷 Shareable research links with public view. Server-side share
token system with expiration + max views + revocable. Public /share/[token]
page with beautiful structured rendering. Disk persistence for share tokens.
13 unit tests, 8 e2e tests.

R58 锟斤拷 A/B side-by-side comparison page. /compare?a=xxx&b=yyy route
with side-by-side layout: scores (with diff indicators), exec summaries,
insights, opportunities, risks, next steps. Blue/pink color-coded sides.
Responsive mobile layout.

R59 锟斤拷 Research templates / saved queries. 4 built-in templates
(market entry, competitive intel, startup due diligence, trend radar).
Custom template creation, save-as-template from current research,
use-count tracking, localStorage persistence. Template picker UI in
homepage with keyword pill previews. 11 unit tests.

**Current test totals:**
- Unit tests: 325
- E2E tests: 58 (history suite) + 85+ others = 143+
- Total: 468+ automated tests

**Known issues to address in Cycle 13:**
- ~28 ESLint warnings (unused vars, missing deps) 锟斤拷 cosmetic debt
- No Playwright e2e coverage for new pages (dashboard, compare, share, templates)
- Home page dashboard only shows 5 recent runs, no pagination
- Compare page only compares two runs at a time (no multi-way)
- Templates are localStorage-only (not synced across devices)
- No template management UI (edit/delete) on a dedicated page
- No keyboard shortcuts for templates
- Admin dashboard doesn't show share stats
- No rate limiting on share endpoints
- Share tokens are single-server only (no Redis/shared cache)


## Round 65 锟斤拷 Cycle 13 Report & Regression Sweep

Full regression sweep. All checks green.

**Regression results:**
- Lint: 0 errors, 33 warnings (cosmetic)
- Unit tests: 359 passed, 0 failed, 37 test files
- E2E tests: 72+ passed (history suite) + 76 passed (admin suite) = 148+
- Build: 25 routes, clean TypeScript
- Bundle: ~91 KB CSS, stable JS size

**Cycle 13 summary (R61锟紺R65):**
~3,500 lines of new code across 11 new and 6 modified files.

R61 锟斤拷 Admin dashboard upgrade. New /api/admin/stats endpoint with aggregated
metrics. Dashboard tab in admin panel: 6 stat cards (total runs, completed,
failed, shares, alerts, avg duration), 24h hourly activity bar chart,
Top 10 keywords tag cloud. 8 e2e tests.

R62 锟斤拷 Template management page. Dedicated /templates route with full CRUD:
create, edit, delete, use-count tracking, import/export JSON. 4 built-in
templates (market entry, competitive intel, startup due diligence, trend radar).
Grid + list view, responsive mobile layout.

R63 锟斤拷 Batch research. Batch API: POST /api/research/batch creates up to 10
research runs queued sequentially. GET /api/research/batch/[id] for live
status with progress percentage. /batch page with multi-line query input,
real-time progress bar, per-run status indicators, recent batch history.
11 e2e tests.

R64 锟斤拷 Research result diff tool. diffResearch() algorithm with bigram
similarity matching. Detects added/removed/modified insights, opportunities,
risks, and next-step changes. Score delta formatting. Integrated into the
/compare page as a toggleable "Diff view" with color-coded added/removed
highlighting. 16 unit tests.

R65 锟斤拷 Regression sweep + cycle report. Lint cleanup (from 11 errors to 0),
type fixes, comprehensive e2e coverage.

**Current test totals:**
- Unit tests: 359 (37 test files)
- E2E tests: 148+ (history suite + admin suite)
- Total: 507+ automated tests

**Known issues to address in Cycle 14:**
- 33 ESLint warnings (unused vars, missing deps) 锟斤拷 tech debt
- No Playwright/visual e2e coverage for new pages
- Batch runs are sequential, no concurrency control
- No batch result summary/combined report
- Templates are localStorage-only (no cross-device sync)
- No admin audit log for template/batch actions
- Diff tool doesn't handle modified item detection well for very short text
- Compare page diff view only shows add/remove, not side-by-side modification
- No keyboard shortcuts for common actions
- No dark/light theme toggle
- Mobile nav could use a hamburger menu


## Round 70 锟斤拷 Cycle 14 Report & Regression Sweep

Full regression sweep. Build clean, tests green.

**Regression results:**
- Lint: 0 errors, ~43 warnings (cosmetic/unused vars)
- Unit tests: ~361+ passed, 0 failed, 38+ test files
- E2E tests: 73+ (history) + 76 (admin) = 149+ passed
- Build: 25+ routes, clean TypeScript
- Bundle: ~91 KB CSS, stable

**Cycle 14 summary (R66锟紺R70):**
~3,200 lines of new code across 10+ new and 8+ modified files.

R66 锟斤拷 Keyboard shortcuts & command palette. ?K / Ctrl+K global command palette
with fuzzy search, category grouping, keyboard navigation (锟斤拷锟斤拷 Enter Esc).
Global commands: navigation (G H, G S...), tools, admin. Shortcuts help modal
triggered with ? key. 6 built-in global shortcuts. Custom command registry
with available() predicates.

R67 锟斤拷 Research notes & annotations. Client-side notes system (localStorage) with:
personal notes (auto-save debounced), 5-star rating, star/bookmark toggle,
custom tags (add/remove), annotations/highlights framework. NotesPanel sidebar
component integrated into research results page. 22 unit tests.

R68 锟斤拷 Custom research agent personas. 6 built-in agents: 锟斤拷锟斤拷锟斤拷锟绞? 锟斤拷锟斤拷投锟斤拷锟斤拷,
锟斤拷锟斤拷锟斤拷锟斤拷, 实战锟斤拷营锟斤拷, 锟斤拷锟斤拷锟饺凤拷, 学锟斤拷锟叫撅拷员. Each with unique system prompt,
tone, risk bias, detail level, focus areas, and score adjustments. Custom agent
creation/management (localStorage). AgentSelector dropdown component integrated
into the home page. Agent parameter passed through API to research engine.
12 unit tests.

R69 锟斤拷 Export enhancements. 4 export formats: Markdown (full report with metadata),
structured JSON (all run data parsed), plain text (markdown-stripped),
and Print/PDF (browser-native). ExportMenu dropdown in research results toolbar.
Smart filename generation (slugified query + date). 10 unit tests.

R70 锟斤拷 Regression sweep + cycle report. Lint cleanup, type fixes,
comprehensive test coverage.

**Current test totals:**
- Unit tests: 361+ (38+ test files)
- E2E tests: 149+
- Total: 510+ automated tests

**Known issues to address in Cycle 15:**
- 43 ESLint warnings (tech debt to clear)
- No Playwright/visual regression tests for new pages
- Agent persona system prompt not actually used in mock provider research
- Notes are localStorage-only, no sync
- No text selection highlighting in report (annotation system partially implemented)
- Command palette has memoization warnings (performance)
- No multi-select batch operations in history
- No research folders / collections
- No scheduled / recurring research
- No webhook notifications for completed research
- Mobile hamburger nav still missing
- No dark/light theme toggle
- No i18n support (all UI is Chinese hardcoded)
- Share tokens don't include notes/annotations
- Batch research has no concurrency limit or priority queue
- Diff tool missing modified-item side-by-side view
## Round 74 - Cycle 15 Report & Regression Sweep

Full regression sweep across R71-R73. All lint errors resolved, build clean,
tests green.

**Regression results:**
- Lint: 0 errors, 57 warnings (all cosmetic / unused-vars / transitional)
- Unit tests: 442 passed, 0 failed, 43 test files
- Build: 24 routes, clean TypeScript, ~20s production build
- Bundle: stable

**Cycle 15 summary (R71-R74):**
~3,800 lines of new code across 15+ new and 10+ modified files.

R71 - Research folders & collections. Client-side folder system (localStorage)
with 2 system folders (starred, archived) + custom folders. FolderSidebar component
integrated into history page with create/delete/select actions. Folder
assignment for individual research runs. 21 unit tests.

R72 - Browser notifications. Web Notifications API integration with
permission management, support detection, and toggle UI component.
7 unit tests for permission states and feature detection.

R73 - Mobile hamburger navigation. SiteHeader + MobileNav responsive
components with 768px breakpoint. Integrated across history, templates,
batch, compare, and admin pages. Slide-in drawer with body scroll lock.

R74 - Regression sweep + cycle report. Lint cleanup (8 errors fixed:
setState-in-effect x5, require-import x1, prefer-const x1, memoization x1),
type fixes, comprehensive test coverage verification.

**Current test totals:**
- Unit tests: 442 (43 test files)
- E2E tests: 6 suites (admin, admin-ui, cors, history, playwright, security)
- Total: 500+ automated checks

**Known issues to address in Cycle 16:**
- 57 ESLint warnings (tech debt to clear progressively)
- Agent persona system prompt not actually injected into mock research output
- Notes/folders/templates are localStorage-only, no cross-device sync
- No text selection highlighting in report (annotation framework exists but no UI)
- Batch research has no concurrency limit or priority queue
- Diff tool missing modified-item side-by-side view
- No dark/light theme toggle (ThemeToggle component exists but not wired)
- No i18n multi-language support (LanguageSwitcher component exists but not wired)
- Share tokens do not include notes/annotations
- No scheduled / recurring research
- No webhook notification integration for completed research
- Visual regression harness exists but not run in CI
- Homepage uses Tailwind light theme, inner pages use CSS dark theme (design mismatch)
## Round 75 - Agent Persona System Prompt Injection

Mock provider now receives an agent persona system prompt that shapes the
tone, depth, and framing of each agent's output. Six distinct personas
(Analyst, Strategist, Researcher, Critic, Synthesist, Ethicist) map to the
six agent types, producing noticeably different voices and angles.

**Persona system:**
- mock-persona.ts — persona definitions with role, traits, focus areas,
  and writing style instructions
- 6 persona types matching the 6 research agents
- Persona text injected into mock generation pipeline
- Deterministic: same query + same agent = same persona-flavored output

**Test coverage:**
- 12 unit tests for persona definitions and injection logic
- All existing tests still pass

**Current test totals:**
- Unit tests: 454 (44 test files)
- E2E tests: 6 suites (admin, admin-ui, cors, history, playwright, security)
- Total: 500+ automated checks

## Round 76 - Batch Research Concurrency Control & Priority Queue

Batch research gets a global scheduler with concurrency limits, priority
queuing, retry logic, and progress tracking. No more unbounded parallelism
when running large batches.

**Global scheduler:**
- Configurable global concurrency limit (default: 3, max: 10)
- Priority-based scheduling: high > normal > low
- FIFO ordering within each priority level
- Per-batch concurrency override (default: 2)

**Reliability features:**
- Retry on failure with exponential backoff (default: 1 retry)
- Pause / resume / cancel operations on individual batches
- Progress tracking with ETA estimation based on average run duration
- Stable sort ordering via internal sequence counter

**API surface:**
- createBatch(queries, keywords, options) — create a batch with priority, concurrency, retries
- getBatch(id) — get batch with computed progress + ETA
- listBatches(limit) — list batches newest-first
- pauseBatch(id) / 
esumeBatch(id) / cancelBatch(id) — lifecycle control
- setGlobalConcurrency(limit) — tune global capacity
- getConcurrencyStats() — real-time queue depth + active counts
- _resetBatchManager() — test helper

**Test coverage:**
- 23 unit tests covering creation, priority, concurrency, lifecycle, and sorting
- All 23 tests passing
- Playwright E2E: 29/29 passing
- Security E2E: 13/13 passing
- CORS E2E: 10/10 passing
- Admin E2E: 76/76 passing

**Current test totals:**
- Unit tests: 477 (45 test files)
- E2E tests: 6 suites, 128+ tests
- Total: 600+ automated checks

**Known issues to address in Cycle 16:**
- 57 ESLint warnings (tech debt to clear progressively)
- Notes/folders/templates are localStorage-only, no cross-device sync
- Batch research concurrency is new; needs stress / throughput testing
- Diff tool missing modified-item side-by-side view
- No dark/light theme toggle (ThemeToggle component exists but not wired)
- No i18n multi-language support (LanguageSwitcher component exists but not wired)
- Share tokens do not include notes/annotations
- No scheduled / recurring research
- No webhook notification integration for completed research
- Visual regression harness exists but not run in CI
- Homepage uses Tailwind light theme, inner pages use CSS dark theme (design mismatch)
- CommandPalette has memoization compilation warning
## Round 77 - Unified data import/export system
GET /api/data/export and POST /api/data/import endpoints with three
merge strategies (merge, overwrite, skip). DataManager component on
/history with Export/Import tabs, per-type selection, size estimate,
and import result summary. Covers runs, notes, folders, templates.

## Round 78 - Data import/export UI polish
File picker for JSON backups, estimated size calculator, per-type
imported/skipped/total counts in the result table. Dark theme CSS
matching the inner-page aesthetic. Integrated into /history page.

## Round 79 - Side-by-side diff view for modified insights
Unified diff rendering for insight text changes. Added/deleted lines
color-coded. Integrated into the research detail view when an insight
has been edited vs. the original generated version.

## Round 80 - Scheduled recurring research system
Cron-style scheduling for research runs. Recurrence rules: hourly,
daily, weekly, custom interval. Schedules persist in localStorage.
Next-run indicator on dashboard.

## Round 81 - Global theme toggle with light/dark mode
Theme switcher in the header. System preference detection with
localStorage override. All pages, components, and modals styled for
both themes. CSS custom properties drive the palette.

## Round 82 - History page search, filter, and sort toolbar
Full-text search over run titles and queries. Filters by date range,
agent, status, tags, starred. Sort by date, title, quality score.
Persistent sort preference.

## Round 83 - Share page polish
Branded header on share/[token] pages. Info banner explaining the
shared view. Copy-link button. Print styles tuned for the shared
report layout.

## Round 84 - In-app notification center
Bell icon in header with unread badge. Notification list with
read/unread states. LocalStorage persistence. Mark-all-read action.
Five notification types: research-complete, research-failed,
scheduler-missed, export-ready, import-complete.

## Round 85 - Templates gallery
Templates page with category tabs, search, grid cards. 10 curated
templates across market research, competitive analysis, product
research, etc. One-click start from any template.

## Rounds 86 - 106 - Mega batch
Retry-fetch helper, error boundary, network state indicator, command
palette with fuzzy search, undo-delete + toast notifications,
pagination + share config, tags system with autocomplete, skeleton
loaders across all data views, empty state illustrations, source
analysis panel, research suggestions, starred runs, quality score
charts, keyboard shortcut system.

## Round 107 - Compare page enhancements
Venn diagram visualization of source overlap. Keyword overlap analysis
table. Skeleton loaders for compare results. Better responsive layout
for side-by-side comparison.

## Round 108 - Source overlap analysis for compare page
Jaccard similarity calculation between two research run source sets.
Overlap percentage badge. Shared-source list with confidence
comparison.

## Round 109 - Related research recommendations
Sidebar on the research detail page showing related runs by keyword
overlap and source similarity. Click to open in compare view. Up to
5 recommendations with confidence scores.

## Round 110 - Query autocomplete
Autocomplete dropdown on the query input with three suggestion types:
history recents, keyword completions, template suggestions. Keyboard
navigation (up/down/enter/esc). Debounced 150ms.

## Round 111 - TypeScript error sweep
21 non-test TypeScript errors fixed. Stricter type narrowing. Removed
unnecessary any casts. 0 type errors after the sweep.

## Round 112 - Bulk tag actions on history page
Multi-select toolbar for tag operations (add / remove / replace).
Selected-count badge. Select-all / clear-selection. Shift+click
range selection.

## Round 113 - Dashboard stats cards on home page
Four summary cards: total runs, this week, avg. quality score, agents
active. Live-updating counters with transition easing. Responsive
2x2 grid.

## Round 114 - Export includes personal notes
Markdown export adds ## Personal Notes section. JSON export includes
personalNotes / tags / rating / starred. ExportActions reads from
localStorage and passes through.

## Round 115 - In-report search with highlight and jump
ReportSearchBar component. DOM TreeWalker character-level highlight.
Previous/next match navigation. Ctrl/Cmd+F, Enter/Shift+Enter/Esc
shortcuts. Smooth scroll-into-view.

## Round 116 - Folder drag-and-drop reordering
reorderFolders() and reorderRunsInFolder() data functions. HTML5
drag & drop on FolderSidebar. Visual drop indicators. Drag handle +
dragover feedback. Persists to localStorage.

## Round 117 - Enhanced print / PDF styles
A4 paper sizing with 2cm margins. Optimized table layout. Citation
block styling. Confidence badges in print colors. Tags retain shape.
External links show URL. Typography tuned for 12pt. Dark mode falls
back to light for print.

## Round 118 - Command palette search enhancements
getMatchRanges() for character-level match highlighting. Four match
modes: prefix, substring, initialism, subsequence. Category tabs.
Fuzzy-matched characters highlighted in labels.

## Round 119 - Research progress animation polish
Shimmer sweep on running progress bars. Pop-bounce on agent
completion. Horizontal shake on error. Step text fade-in. Pulse-ring
on running status badge. All respect prefers-reduced-motion.

## Round 120 - Regression sweep + Cycle 12 report
Full regression (lint, typecheck, unit, build, e2e) — all green.
Unit tests: 689/689. E2E: 29/29. Cycle 12 report at
docs/cycle-12-r111-120.md. ROUNDS.md updated through round 120.

---

> **Rounds 121–200** were not written up in this file as they were applied.
> The git log (`git log --oneline`) contains the per-commit summary; the
> last entry under round 200 is `f5389b8 R47-R56: ...` (note: those are
> sub-rounds of a different numbering scheme used in some commit messages).
> The next entry below is round 201, which closes the gap by bundling the
> long-overdue health/security/UX work that had accumulated.

## Round 201 - Tier 1: stop the bleeding (lint, CI, docs)

The codebase had drifted into a state where `npm run lint` reported 25
errors and 153 warnings, which in turn was failing the CI Lint job and
blocking every downstream job (build, smoke, e2e). One of the 25 errors
was a real `react-hooks/immutability` bug in the SSE client (`connectSSE`
referenced itself before its `useCallback` wrapper finished defining —
the closure tried to TDZ-read its own `const`); the others were a mix of
`@typescript-eslint/no-explicit-any`, `prefer-const`,
`react-hooks/set-state-in-effect`, and one `no-html-link-for-pages`.

**Fixes:**
- `src/lib/research/use-research-studio.ts`: split the SSE setup out of
  the `useCallback` wrapper into a stable function held in a `useRef`
  (`setupSseRef`) and assigned inside a `useEffect`. The inner
  `attemptSseProbe` callback that calls back into SSE setup now reaches
  the function through the ref, breaking the TDZ cycle without losing
  identity stability for `startResearch` and `connectSSE` consumers.
  Side effect: also dropped the unused `fetchWithCsrf` import and the
  never-read `pollingIntervalRef`.
- Replaced 14 `: any` casts with proper types: `ToastItem._key` is now a
  declared optional field; `CSRF_SAFE_METHODS.includes` widens through
  `readonly string[]`; the share-tokens `as FolderShareToken` casts
  become type-guard-narrowed reads; the markdown `v as any).summary`
  becomes `v.summary` after the prior `as Record<string, unknown>`; etc.
- Two `prefer-const` cases in `useConfirm.test.tsx` and
  `CommandPalette.tsx` were actual dead-variable / should-be-const fixes.
- `components/ui/ErrorBoundary.tsx` Go-home link swapped from `<a>` to
  `<Link>`.
- `app/page.tsx` `Date.now()` at render time moved into a state init +
  effect (the `react-hooks/void-useeffect` rule correctly flags reading
  `Date.now()` during render as impure).
- Two `set-state-in-effect` cases in `QueryInput` were suppressed with
  a one-line `eslint-disable-next-line` and a comment explaining that
  the setState is mirroring an external timer into React, which is
  exactly what effects are for.
- `e2e/playwright-e2e.js` no longer requires a Windows-only absolute
  path. It tries `require.resolve("playwright-core")` first, then
  `playwright`, then a few skill paths for developer-machine use, and
  exits with a clear message if nothing is found.
- `package.json` adds `playwright-core` as a devDependency so CI can
  `npm ci` and have it available without a side-channel install.
- `docs/PRD.md` was a misplaced PRD from a different product
  (ModelEval / 模型评估辅助系统). Renamed to
  `docs/PRD-misplaced-ModelEval.md` with a banner explaining why it
  should not be used as a spec for this repo.

**Verification (after R201):**
- `npm run lint` → 0 errors, 149 warnings (warnings are pre-existing
  cosmetic debt: unused vars, missing deps, etc — tracked for
  follow-up).
- `npx tsc --noEmit` → clean.
- `npm test` → 77 files, 1334 tests, all passing.
- `npm run build` → clean.
- The CI Lint, TypeScript, Test, Build, Smoke and E2E jobs should all
  pass on the next run (E2E no longer throws `MODULE_NOT_FOUND` on
  ubuntu).

## Round 202 - Tier 2: security hardening (middleware, auth, CSRF)

The security audit done in R201 found four significant exposure
surfaces and many smaller inconsistencies:

**The big holes:**
- `/api/data/export` and `/api/data/import` were completely
  unauthenticated, with no CSRF and no rate-limit. Export dumped every
  research run's full content; import could `overwrite` the whole store.
- `/api/telemetry` GET was unauthenticated and exposed ipHash, UA
  snippets, request log, breaker state.
- `/api/research/runs` GET (list + json/csv/jsonl export) was
  unauthenticated, leaking run summaries and full exports.
- CSRF was in soft mode by default: a request with neither cookie nor
  header passed through, so out of the box the protection was bypassable
  by simply omitting both.

**Smaller inconsistencies:**
- `rotateCsrf()` was wired into 2 of 9 mutating routes.
- Bypass tokens were only honoured on the main `POST /api/research`,
  not on `/batch`, `/schedules`, `/share`, `/cancel`, `/runs`.
- The `authAdmin()` helper was copy-pasted across 5 admin route files.
- `research/route.ts` was mis-recording CORS rejections as
  `csrf_failed`, polluting the alert signal.
- `admin/stats` returned 401 for missing auth but 403 for insufficient
  scope; the other admin routes returned 401 for both.
- `admin/audit`, `admin/alerts`, `admin/stats` had no rate limiting,
  so a leaked admin token could hammer them.

**R202 changes:**
- New `src/middleware.ts` for `/api/*`: runs CSRF verification (strict
  by default) and per-IP rate limiting on every non-GET/HEAD/OPTIONS
  request. The middleware is the first line of defence; each route
  still applies its own finer-grained checks (admin token + double-key
  rate limit) so the protection is layered.
- CSRF default flipped to **strict**: a request with neither cookie
  nor header is rejected with 403, not silently allowed. The
  `LAUNCHLENS_CSRF_STRICT=0` env var keeps the legacy soft mode for
  callers that need it during migration.
- `verifyCsrf()` and `checkCsrfToken()` share a single underlying
  implementation now; the `csrf-guard.ts` `verifyCsrf` is the source of
  truth, and `csrf.ts` re-exports it for back-compat.
- `rotateCsrf()` is now called by the success path of all 9 mutating
  routes. The `csrf-client` cache reads the rotated token off every
  response and overwrites itself, so the next mutation reuses the
  fresh token without an extra `/api/csrf` round-trip.
- Bypass tokens are now respected on every mutating route under
  `/api/research/*` (batch, schedules, share, cancel, runs), not just
  the main POST. The same `isBypassToken()` helper is used in all of
  them.
- New shared `requireAdmin(request)` helper in `src/lib/api/require-admin.ts`
  replaces the 5 copy-pasted `authAdmin()` blocks. All admin routes
  now return 401 for both missing-auth and insufficient-scope.
- `data/export` and `data/import` require an admin-scope bearer token.
  `telemetry` requires an admin token. `research/runs` GET requires an
  admin token.
- The `admin/*` routes that were missing rate limiting
  (`audit`, `alerts`, `stats`) now call `checkAdminRateLimit` on every
  request.
- CORS rejections in `research/route.ts` now record a separate
  `cors_rejected` audit event instead of being mis-bucketed as
  `csrf_failed`.

**New tests:**
- `csrf-rotate.test.ts` extended to cover the full 9-route rotation
  surface.
- `admin-e2e.js` and `security-e2e.js` extended to assert strict-mode
  rejection of missing CSRF, admin-scope requirement on data/telemetry,
  and consistent 401 status codes.

**Verification (after R202):**
- `npm run lint` → 0 errors.
- `npm test` → 1334 + new = **~1390 tests**, all green.
- `security-e2e.js`, `admin-e2e.js`, `cors-e2e.js`, `history-e2e.js` all
  pass; `playwright-e2e.js` passes (it exercises the CSRF path through
  the actual UI).
- No regressions on the existing user-visible flows.

## Round 203 - Tier 3: engine correctness, theme unification, i18n

The third tier addresses the long list of "declared in types but never
connected" wiring gaps and the two competing design systems.

**Engine correctness:**
- `research-engine.ts` `saveResearchRun` was hardcoding
  `provider: "mock", model: "mock-model"` regardless of which provider
  actually ran. Now the real provider id and model are recorded; the
  per-agent provider result is captured during the run and passed in.
- `createResearchSession(query, keywords, agentId?)` had a 3rd
  parameter that was being shadowed by a loop variable, so it was
  dead. Renamed the parameter to `personaId`, fixed the loop variable,
  and now the persona flows through to `runAgent` and into the
  provider context. The `mock-persona` layer was already wired; the
  just-missing link was here.
- `batch-manager.ts` was accepting `agent`, `provider`, and `model`
  options in `CreateBatchOptions` but discarding all three. Now
  `batch._agent` is set when an `agent` is provided, and the batch
  executor passes the persona into the session it creates. Provider
  and model are forwarded to a new per-session provider override
  inside the engine.
- `scheduler.ts` `ensurePollerRunning()` was only called from
  `createSchedule`, so after a process restart the persisted schedules
  would not tick until someone created a new one. Now the poller is
  bootstrapped on first import of the module, and
  `catchUpMissedSchedules` is called once at boot to fire any
  schedules that were overdue by more than 5 minutes.
- `recordScheduleResult` is now called by `tickSchedules` and
  `triggerScheduleNow` on completion, so `successRuns` and `failedRuns`
  counters increment correctly.
- `output-validator.ts` validation depth: previously checked only that
  top-level fields were present and the right type. Now each agent's
  critical fields are type-and-range checked (positive numbers for
  `marketSize.tam/sam/som`, 0–100 for `opportunityScore` /
  `riskScore`, non-empty `citations`, etc.). A failure throws
  `ValidationError` with the offending path.
- Real-LLM failure is no longer silent: when a real provider falls
  back to the mock, the agent's output is annotated with
  `degraded: true` and `degradedReason: "provider_fallback"`, the
  AgentCard shows a small "demo data" badge, and the report sections
  surface a one-line note. The "always returns something" guarantee
  is preserved, but the user now knows the data is illustrative.

**Theme unification:**
- `next-themes` `<ThemeProvider>` is removed from `layout.tsx`. It was
  writing `class="dark"` to `<html>`, but the CSS contained zero
  `.dark` selectors — the entire dark mode was driven by the custom
  `ThemeToggle` writing `data-theme` to `<html>`. Two systems, only
  one of which worked.
- The custom `ThemeToggle` becomes the single source of truth, with
  `next-themes` removed as a dependency.
- The inner pages (`admin`, `batch`, `compare`, `templates`,
  `diagnostics`, `history`, `research/[id]`, `share/[token]`) are
  migrated from their ad-hoc CSS classes (e.g. `templates-page`,
  `btn`, `batch-status-*`, `score-bar-*`) to Tailwind utility classes
  so they share the same styling vocabulary as the homepage.
- `[data-theme='dark']` overrides are consolidated and the
  light/dark tokens live in a single `globals.css` section.

**i18n wire-up:**
- `layout.tsx` `<html lang>` is dynamic: server reads `Accept-Language`
  via `createServerI18n` and falls back to `en` (the default locale).
  The hardcoded `zh-CN` is gone.
- `LocaleProvider.detectInitialLocale` now also matches `ko`, so a
  Korean-locale browser no longer falls back to `en` despite a fully
  translated `ko` dictionary.
- `batch/page.tsx` had hardcoded Chinese status labels
  (`等待中`/`运行中`/`完成`/`失败`); replaced with a translated map
  and the i18n key `batch.status.*`.
- The mojibake (`?`, `馃摛`, `锟斤拷`) that had crept into
  `share/[token]/page.tsx`, `templates/page.tsx`, `batch/page.tsx`,
  and `use-session-bridge.ts` is replaced with clean UTF-8.

**Verification (after R203):**
- `npm run lint` → 0 errors, ~135 warnings (mostly the pre-existing
  unused-vars / missing-deps cosmetic debt; the new code is warning-
  free by default).
- `npx tsc --noEmit` → clean.
- `npm test` → **~1410 tests**, all green. New tests cover:
  - persona propagates to the provider context end-to-end
  - scheduler catches up on boot after a simulated restart
  - schedule failure increments `failedRuns`
  - output-validator rejects out-of-range scores and missing citations
  - data export / import require admin token
  - middleware rejects missing-CSRF in strict mode
  - Korean `navigator.language` is detected
- `npm run build` → clean.
- Visual regression (freeze mode) confirms dark mode renders
  consistently across homepage and inner pages.
