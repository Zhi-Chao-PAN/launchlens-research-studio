# Changelog

All notable changes to LaunchLens Research Studio are documented here.
The format follows Keep a Changelog (https://keepachangelog.com/en/1.1.0/),
and this project adheres to Semantic Versioning (https://semver.org/).

## [Unreleased]

### Added
- Wrap-up sweep (round 203+): 140 lint warnings cleared to zero; CHANGELOG
  brought in sync with code; pre-existing latent bugs fixed during lint
  cleanup (ScheduleManager confirm dialog rendering, FolderSidebar
  confirm dialog rendering, Admin stats fetch wiring, history pagination
  deps, print mode dead code, cancelled-notice dead state, showHelp dead
  state, dead `watchShareStorage`/`reloadSharesFromDisk`/`markPersisted`
  watchers, dead `formatDuration`/`formatTime` helpers, dead
  `DEFAULT_EXPORT_OPTIONS`/`FOLDER_ASSIGNMENTS_KEY`/`PERMISSION_KEY`
  constants, dead `compare/page.tsx#formatTime`, dead `processBatch`
  wrapper, dead `RelatedRun` interface, dead `ResearchSession` test
  imports, dead `useState`/`useEffect`/`useCallback`/`useRef` imports,
  dead `confirm`/`setConfirm` state in admin/history/templates, and
  `defaultExport` anon → named in autocomplete/suggestions modules).

## [0.6.0] - rounds 201-203 (Tier hardening sweep)

### Added
- **Tier 1 (round 201)** — stop the bleeding: CI green; 1300 tests pass;
  typecheck and build clean; eslint config rewritten; docs/ROUNDS.md
  backfilled through round 200; PRD.md identified as misplaced
  ModelEval file and archived to `docs/PRD-misplaced-ModelEval.md`;
  playwright-core devDep added.
- **Tier 2 (round 202)** — security hardening: global `/api/*` middleware
  enforcing strict-by-default CSRF on all non-safe methods; bypass tokens
  skip CSRF; shared `requireAdmin(request)` helper replacing 5
  copy-pasted admin auth blocks; CSRF token rotation after every
  successful mutation (`rotateCsrf()` on `X-CSRF-Token` response header
  + HttpOnly cookie); `csrf-client.fetchWithCsrf()` auto-picks up
  rotated tokens; `auth-audit.ts` `cors_rejected` event added; trusted
  IP ranges (single IP + CIDR) for `LAUNCHLENS_TRUSTED_PROXIES`.
- **Tier 3 (round 203)** — engine correctness + UX:
  - Research engine: `createResearchSession` captures
    `selectProvider().id` as `session.providerId`; `saveResearchRun`
    threads provider id through (history no longer misattributes all
    runs to "mock"); `runAgent` tracks `resolvedProviderId` and
    `isDegradedHere`, exposing degraded state on `AgentState`.
  - Visible degradation: when a real-LLM provider fails, agents emit a
    `degraded: true` flag surfaced as an amber "demo" badge on
    `AgentCard`, while the response still uses mock output so the user
    always sees something actionable.
  - Theme unification: legacy `next-themes` `<ThemeProvider>` removed;
    the custom `ThemeToggle` (which writes `[data-theme]`) is now the
    sole source of truth; no more className=dark divergence.
  - Locale resolution: `<html lang>` dynamic from request headers via
    `resolveLocaleFromHeaders(await headers())`; client-side
    `detectInitialLocale` now matches `"ko"`.
  - Scheduler: `bootstrapScheduler()` called at module load (ensures
    poller running + catch-up missed schedules); `tickSchedules` and
    `triggerScheduleNow` record results.
  - i18n: Korean (`ko`) locale added; `agent.degraded` and
    `batch.status.{queued,running,completed,failed}` keys in all 4
    locales; hardcoded Chinese status labels in `/batch/page.tsx`
    replaced with `t("batch.status.*")`.
  - Mock persona adjustments: `oppAdj`/`riskAdj` params dropped from
    the 4 persona functions that didn't use them.
  - Output validator: `assertNumberInRange`, `assertNonEmptyString`,
    required citations (`>= 1`), positive TAM/SAM/SOM, 0-100 scores
    enforced.
  - Batch: `batch._agent` written in `createBatch` when an agent is
    provided so per-agent runs have a stable audit trail.

## [0.5.5] - rounds 24-200 (organic iteration log)

This range contains 176 rounds of organic iteration. The full per-round
log lives in [`docs/ROUNDS.md`](./docs/ROUNDS.md). Highlights grouped by
cycle:

- **Cycle 1 (R8-10)** — Founder-friendly seeds: pre-populated mock
  personas, comparison page, persona switcher, confidence pills.
- **Cycle 2 (R11-15)** — Reusable history: searchable history page,
  star/unstar, delete with undo, folder sidebar, per-folder counts.
- **Cycle 3 (R16-20)** — Templates & sharing: template CRUD + apply,
  share tokens (view/edit scopes, expiry, password, revocation),
  dashboard stats endpoints, top-keywords cloud.
- **Cycle 4 (R21-23)** — Real-LLM plumbing (see 0.5.0 below).
- **Cycles 5-12 (R24-120)** — Hardening + UX: telemetry, rate limiting,
  IP bypass tokens, admin audit, webhooks, scheduler with cron + result
  records, batch runner with concurrency, autocomplete + suggestions,
  PDF/print styles, related-runs, Venn diagrams, tag system, retry-on-429
  with Retry-After, i18n (en/zh-CN/ja), Vercel deploy config, smoke
  scripts, visual regression harness.
- **Cycles 13-20 (R121-200)** — Continued hardening: stronger CSRF, more
  test coverage, structured logging, error boundaries, debounced keyword
  analysis, indexed search, more personas, deeper report sections, the
  paged schedule editor, idempotent batch cancel, and the multi-cycle
  Tier 1/2/3 prep work.

## [0.5.0] - rounds 21-23

### Added
- Anthropic streaming via SSE content_block_delta events (round 21).
- Per-provider circuit breaker with automatic mock fallback when open (round 21).
- /api/health and /api/telemetry now expose breaker snapshot (round 21).
- ProviderPill component polls /api/health and shows live provider id,
  streaming flag, and breaker state with i18n labels (round 22).
- Crash screen reads all visible strings from the locale dictionary
  and offers a one-click copy of message + digest + stack (round 23).
- Translated 404 screen.

### Changed
- Anthropic adapter retries 5xx and 429 with exponential backoff via
  the shared retryWithBackoff helper (round 21).
- DictionaryKey signature loosened on translate() and useLocale.t()
  to accept arbitrary fallback strings (round 22).

## [0.4.0] - rounds 16-20

### Added
- Runtime AgentOutput validator with per-agent shape rules (round 16).
- Anthropic Messages API adapter with mock fallback (round 16).
- Provider streaming via ProviderContext.onProgress (round 17).
- /api/health and /api/telemetry endpoints (round 18).
- 200-entry telemetry ring buffer recording every agent generation (round 18).
- retryWithBackoff with exponential backoff plus jitter (round 19).
- Per-key token bucket rate limit on /api/research (round 19).
- docs/ROUNDS.md, docs/FEATURES.md (round 20).

### Changed
- Provider registry rewritten with a clean precedence rule:
  forced override -> Anthropic -> OpenAI -> mock (round 16).
- OpenAI adapter retries 5xx and 429 then falls back to mock; 4xx
  degrades immediately so quota is preserved (round 19).

## [0.3.0] - rounds 11-15

### Added
- ResearchProvider abstraction with mock + OpenAI-compatible adapters (round 12).
- provider-registry selecting based on env (round 12).
- 22 i18n keys covering all six agent labels and status pills (round 13).
- Lazy-loaded agent report sections via next/dynamic (round 14).
- Regression orchestrator npm run regression -> regression-report.md (round 15).

### Changed
- Lint debt cleared from 62 errors to 0 errors (round 11).
- ReportView role / aria-busy for screen readers (round 14).

## [0.2.0] - 2026-06-16

### Added
- GitHub Actions CI workflow (lint, typecheck, test with coverage, build, smoke).
- GitHub Actions CodeQL workflow (weekly security scan).
- Mobile sidebar toggle with aria-expanded and aria-controls.
- aria-live status region for screen reader users.
- CHANGELOG.md, CODE_OF_CONDUCT.md, SECURITY.md.
- Issue templates (bug, feature).
- 14 new accessibility tests (src/app/a11y.test.ts).
- CONTRIBUTING.md with full developer guide.

## [0.1.0] - 2026-06-16

### Added
- Multi-agent research skeleton, mock SSE pipeline, baseline UI.
- Per-agent rich report sections, copy-to-clipboard, recent queries.
- Unit test infrastructure, session cache, share links, dark mode, print CSS.
