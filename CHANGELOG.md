# Changelog

All notable changes to LaunchLens Research Studio are documented here.
The format follows Keep a Changelog (https://keepachangelog.com/en/1.1.0/),
and this project adheres to Semantic Versioning (https://semver.org/).

## [Unreleased]

### Added
- **Degraded-data session banner (round 207)** — the round-205 per-agent
  "demo" badge only showed during the run; a user reading the completed
  report had no session-level indication that some sections were
  illustrative mock data rather than authoritative. Added an amber banner
  at the top of the report view that appears when a completed run has any
  degraded agents, naming the count and explaining the cause + remedy
  (check API key / provider config, re-run). Fully translated across all
  four locales (en/zh-CN/ja/ko) via new `report.degradedBanner.title` and
  `report.degradedBanner.body` dictionary keys. The banner is gated on
  `!isRunning && degradedCount > 0` so it never appears mid-run. 79 files
  / 1377 tests pass, tsc and build clean, lint 0.
- **Synthesis upstream integrity + model capture (round 206)** — fixed a
  silent data-corruption bug in the synthesis agent's user prompt. The
  previous `buildUserPrompt` stringified the entire five-agent upstream
  array and sliced the result to 8000 chars, which cut a number/string
  mid-token and produced invalid JSON the model could not parse — so the
  synthesis agent could receive a corrupted subset of the research with no
  indication. Rewritten to stringify each agent's output individually
  (each stays valid JSON) with a per-agent budget of 6000 chars, label
  every block `--- <agentId> ---`, and explicitly flag truncated outputs
  `[truncated, first N chars]` so the model knows it is seeing a subset;
  the synthesis coaching now instructs the model to treat `[truncated]`
  fields as cut for length, not absent. Also fixed a history-accuracy
  gap: `session.providerModel` was referenced at save time but never set,
  so history rows recorded the provider id (e.g. "openai") as the model
  instead of the actual model name; `createResearchSession` now derives
  the model from the provider's `displayName` (which follows the
  "Label (model)" convention). Tests: 2 new `agent-prompts.test.ts` cases
  asserting per-agent block labeling and that an oversized single output
  is truncated (not the whole array) while a small sibling survives
  intact. 79 files / 1377 tests pass (+2), tsc and build clean.
- **Provider fallback visibility (round 205)** — closed the silent-degradation
  gap left after round 204. The OpenAI/Anthropic providers catch all failures
  internally and return mock output so a session always completes, but their
  catch blocks returned mock without the engine ever knowing — so a user with
  a bad API key or a weak model that failed validation saw demo data with no
  "demo" badge and no clue their real provider never ran. New
  `ProviderContext.onFallback` callback (type `ProviderFallbackReason`:
  `http_error` / `network_error` / `parse_error` / `validation_error` /
  `empty_response`) is invoked by each provider's failure paths with the
  precise reason *before* degrading; the engine wires it to set the agent's
  `degraded` flag and `degradedReason` (the R203 union widened to include the
  new reasons). Both providers now classify each failure point: network
  throws (DNS/timeout, with AbortError excluded as a user cancel), HTTP
  exhaustion after retries, non-retriable 4xx, empty responses, JSON parse
  failures, and schema-validation failures. `AgentCard`'s memo comparator
  was missing `degraded`/`degradedReason` so the badge never re-rendered
  even when the engine set them — fixed; the tooltip now maps each reason to
  a human-readable explanation ("Real provider returned an HTTP error...",
  "Could not reach the real provider...", etc.). The `use-research-studio`
  hook's local agent type reused the narrow R203 reason union and would
  have rejected the new reasons — widened to `AgentState["degradedReason"]`.
  Tests: 5 `onFallback`-reason tests each in openai/anthropic provider tests
  (http_error, validation_error, parse_error, network_error, and a negative
  "no fallback on success" test); the misleading `validPayload` (which had
  `citations:[]` and silently fell back to mock, making the "returns parsed
  JSON" test a lie) now carries a real citation so that test is honest; 1
  end-to-end engine test forces `LAUNCHLENS_PROVIDER=openai` + a throwing
  fetch and asserts all five research agents come back `done` + `degraded` +
  `degradedReason="network_error"`. 79 files / 1375 tests pass (+11), tsc
  and build clean.
- **Real-provider usability (round 204)** — fixed the core blocker that kept
  the product on demo data even with real API keys configured: the OpenAI and
  Anthropic provider prompts never showed the agent schemas to the LLM, so
  real calls guessed the output shape, failed `validateAgentOutput`, and
  silently fell back to mock every time. New shared module
  `src/lib/providers/agent-prompts.ts` builds schema-aware system prompts
  (role + exact TypeScript shape + per-agent coaching + honesty rules about
  fabricated URLs) and user prompts (query, keywords, upstream synthesis
  payload) for all six agents; both `openai-provider.ts` and
  `anthropic-provider.ts` now import from it, dropping their duplicate vague
  local builders. Onboarding: added `.env.example` (with a `!.env.example`
  gitignore exception so it is actually committed) documenting every provider
  env var (`LAUNCHLENS_PROVIDER`, `OPENAI_API_KEY`/`LAUNCHLENS_OPENAI_KEY`,
  `ANTHROPIC_API_KEY`, `OPENAI_BASE_URL`/`ANTHROPIC_BASE_URL`,
  `OPENAI_MODEL`/`ANTHROPIC_MODEL`); new `docs/PROVIDERS.md` covering
  selection rules, OpenAI-compatible gateways (Azure/local), and
  troubleshooting the silent-mock-fallback failure mode; README's
  "Extending with Real Providers" section rewritten (it previously named the
  wrong interface and the wrong file) to a real configuration quickstart, and
  the architecture tree now lists the full `providers/` directory. New tests:
  `agent-prompts.test.ts` (10 tests asserting schema fields, enum values,
  honesty rule, synthesis coaching) plus 2 schema-injection tests each in
  `openai-provider.test.ts` and `anthropic-provider.test.ts` that capture the
  actual system/user prompts sent to the LLM and assert they contain the
  required schema text — a regression guard for the exact bug this round
  fixes. 79 files / 1364 tests pass, tsc and build clean.
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
