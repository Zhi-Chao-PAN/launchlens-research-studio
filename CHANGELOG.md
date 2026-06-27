# Changelog

All notable changes to LaunchLens Research Studio are documented here.
The format follows Keep a Changelog (https://keepachangelog.com/en/1.1.0/),
and this project adheres to Semantic Versioning (https://semver.org/).

## [Unreleased]

### Added
- **Batch + scheduler full i18n, last hardcoded Chinese eliminated (round 228)** —
  the batch page and the `ScheduleManager` component were the final two
  surfaces still rendering Chinese regardless of the active locale.
  `src/lib/i18n/dictionaries.ts` gains ~70 `batch.*` and `schedule.*`
  `DictionaryKey` entries across all four locales (en/zh-CN added in the
  prior round, ja and ko completed this round), so the key-parity test
  now passes for all four locales. Japanese gains バッチリサーチ /
  スケジュールリサーチ titles, frequency labels (毎時/毎日/毎週/カスタム),
  day-of-week abbreviations (日月火水木金土), parameterized interval strings
  (毎日 {hh}:00 · {day} {hh}:00 · {minutes} 分ごと), and the full set of
  status/trigger/pause/resume/delete labels plus the delete-confirm body.
  Korean gains 일괄 리서치 / 예약 리서치 titles, frequency labels
  (매시간/매일/매주/사용자 지정), day abbreviations (일월화수목금토), and the
  parameterized intervals (매일 {hh}:00 · {minutes}분마다).
  `src/app/batch/page.tsx` now destructures `{ t, locale }` from
  `useLocale`; `formatTime()` uses the active locale for
  `toLocaleTimeString` instead of the hard-coded `zh-CN`; every Chinese
  string (header, queries/keywords labels + placeholders, submit/
  submitting, maxQueries alert, progress title/done/success/failed,
  view-run link, history title/count unit) is replaced with `t()` calls
  carrying English fallbacks. `src/components/scheduler/ScheduleManager.tsx`
  adds `useLocale` and moves `formatInterval`/`formatTime`/`statusLabel`
  from module scope into the component so they can call `t()`;
  `formatInterval` now emits localized short interval strings via the
  `schedule.interval*Short` keys plus a `dayKeys[]` lookup for weekly day
  names, and all header stats, form labels/placeholders, frequency/
  interval/hour/day selects, cancel/create/creating buttons, empty-state
  copy, card meta labels, and trigger/pause/resume/delete actions route
  through `t()`. Both files verified free of Han characters via grep.
  93 test files / 1529 tests pass, tsc and next build clean.
- **Bypass-token TTL + lazy auto-expiry (round 227)** — admin-issued
  bypass tokens can now self-expire instead of living forever. `BypassTokenInfo`
  gains an optional `expiresAt`, the mint endpoint accepts a `ttlMs` body
  field (clamped to [0, 365 days], 0 = never-expire), and `getDefaultTtlMs()`
  reads `LAUNCHLENS_TOKEN_DEFAULT_TTL_MS` for an env-driven default. Expired
  tokens are evicted lazily on read paths via `pruneExpired()` so no cron is
  needed — the token store self-cleans the next time any read happens. The
  admin UI gains a TTL input and an Expires column. SHA-256 hashing in
  storage is unchanged. 7 new TTL tests cover clamp bounds, never-expire,
  expiry detection, and lazy pruning. tsc and build clean.
- **Admin telemetry endpoint + System-tab surfacing (round 226)** —
  `/api/telemetry` (admin-gated) now returns a richer payload: rate-limit
  config (capacity/refill/window), request summary, circuit-breaker states,
  storage stats, and dashboard aggregates. The admin System tab renders all
  of it, giving operators a single live view of breaker health, request
  volume, rate-limit posture, and storage footprint. 4 new telemetry route
  tests. tsc and build clean.
- **Env-tunable research rate-limit + retry-count surfaced in UI (round 225)** —
  the research POST rate limit was hard-coded to 10 requests / 60s.
  `getResearchRateLimitConfig()` / `checkResearchRateLimit()` now read
  `LAUNCHLENS_RATE_LIMIT_CAPACITY` and `LAUNCHLENS_RATE_LIMIT_REFILL_MS`
  with clamping that prevents disabling rate limiting or setting sub-second
  windows. Trusted IPs still bypass. The rate-limit error banner now shows
  the current `retryCount` so users can see repeated backoffs. 5 new
  rate-limit env-config tests. tsc and build clean.
- **Server-aggregated dashboard stats endpoint (round 224)** — the dashboard
  was computing totals by fetching `/api/research/runs?limit=500`, but the
  runs route silently caps `limit` to 100, so `totalRuns` was wrong past 100
  runs. New `getDashboardStats(sinceMs)` aggregates server-side over the
  in-memory run cache, and the lightweight `/api/research/stats` endpoint
  returns a tiny pre-aggregated payload (`totalRuns`, `recentRuns`,
  `totalDurationMs`, `byStatus`). The home page now fetches stats from the
  dedicated endpoint. 4 new stats route tests + 4 new `getDashboardStats`
  storage tests. tsc and build clean.
- **Actionable error states with recovery actions (round 223)** — the home
  page and the `research/[id]` page now surface errors through a reusable
  `ActionableError` banner (icon + title + detail + action buttons,
  error/warning/info variants) instead of plain red text. The home page
  wires a Retry action into the rate-limit / provider-error banner and
  shows the current `retryCount`; the `research/[id]` page maps not-found
  and failed-run states to `ActionableError` with "Back to home" / "View
  history" actions. Also fixed the `/research` (404) link on the detail page
  to point at `/history`. 7 new `ActionableError` tests. tsc and build clean.
- **Delete dead legacy command-palette UI cluster (round 222)** — removed
  the orphan `ui/CommandPalette.tsx`, `ui/CommandPaletteProvider.tsx`,
  `ui/ShortcutsHelp.tsx`, and `ui/GlobalCommands.tsx` files, which formed a
  self-contained dead cluster that only imported each other. The active
  versions live in `command-palette/`. `use-hotkey.ts` (singular) is kept
  because `NotesPanel.tsx` still uses it. tsc, lint, and build clean.
- **Chord (sequence) keyboard shortcuts now actually work (round 221)** —
  the `useChord` hook was redesigned: `ChordMap = Record<string, string[]>`
  (multiple second keys per first key), a 1.5s window, input-skipping, and
  modifier-chord ignoring. `GlobalCommands` now wires `G then H/S/T/B/C` for
  home/stats/templates/batch/compare navigation, fixed the `/research` →
  `/history` 404, and added batch/compare chords. The keyboard cheatsheet
  wording changed from "G + H" to "G then H" and gained the G-then-C entry.
  10 new `use-chord` tests using `renderHook` + fake timers. tsc and build
  clean.
- **Split research/[id] page + loading fallback (round 220)** — split the
  monolithic `research/[id]/page.tsx` into focused primitives (header, agent
  grid, report tabs, share/export actions) and added a `loading.tsx` route
  fallback so navigating to a research run shows an instant skeleton instead
  of a blank frame while the route segment streams. Improves perceived
  performance and reduces the chance of a white-screen on slow connections.
  tsc and build clean.
- **Split useResearchStudio state into session + transient (round 219)** —
  `useResearchStudio()` now returns `{ session, transient, ...actions }` so
  long-lived session fields (agents, citations, results) are isolated from
  frequently-changing transient fields (rateLimitUntilMs, retryReadyPulse,
  retryCount, reconnectUntilMs, pollingIntervalMs). A memo equality function
  (`studioStateEqual`) controls re-renders, cutting re-render storms during
  SSE streaming and rate-limit backoff. tsc and build clean.
- **/api/research/smoke admin-gated 6-agent end-to-end probe (round 218)** —
  new admin-gated endpoint that runs the full 6-agent pipeline (5 research +
  synthesis) against the configured provider and reports per-agent status,
  latency, and fallback reason. Lets operators verify the whole stack
  end-to-end from the admin UI without starting a real research session. 3
  new smoke-route tests. tsc and build clean.
- **Session map eviction + clearer terminal events (round 217)** — the
  in-memory session map now evicts terminal sessions older than 30 minutes
  via `pruneStaleSessions()` on read paths, preventing unbounded growth.
  The SSE stream route emits distinct terminal events with reason `expired`
  | `not-found` | `cancelled` so the client can distinguish a permanently
  dead session from a transient blip and stop exponential-reconnecting.
  Restart behavior no longer resurrects evicted sessions. tsc and build
  clean.
- **Per-agent wall-clock timeout + stalled-session protection (round 216)** —
  each research agent now runs under a per-agent wall-clock timeout; a
  stalled session (no agent progress within a grace window) is detected and
  marked failed instead of hanging forever. Closes the "research never
  finishes" failure mode where a single slow/hung LLM call blocked the whole
  session. tsc and build clean.
- **Tavily retrieval adapter + registry + URL verification + agent-prompt
  injection (round 215)** — the first RAG grounding layer. New
  `RetrievalProvider` interface (parallel to `ResearchProvider`) with a
  deterministic zero-result `mock-retrieval-provider` and a full
  `tavily-retrieval-provider` (POST `api.tavily.com/search`, Bearer auth,
  12s timeout, AbortSignal propagation, deterministic FNV-1a citation IDs,
  graceful degradation on every failure mode). `retrieval-registry.ts`
  mirrors the LLM registry's override semantics
  (`LAUNCHLENS_SEARCH_PROVIDER=mock|tavily`, auto-pick on `TAVILY_API_KEY`).
  `filterCitationsAgainstRetrieved()` drops citation URLs not in the
  retrieved set and deduplicates by URL/id, so invented URLs are silently
  dropped. `buildUserPrompt` now appends a "Verified web sources" block and
  the system prompt coaches the model to prefer those URLs. New
  `/api/retrieval/test` probe endpoint mirrors `/api/provider/test`. 24 new
  tests across the adapter/registry/validator/prompts. 88 files / 1478 tests
  pass, tsc and build clean. End-to-end Tavily verification requires the user
  to set `TAVILY_API_KEY`; without a key the registry returns mock retrieval
  and every run behaves exactly as before R215.
- **Per-element string coercion, growthTrend enum, rec.period, finite guards
  (round 214)** — `output-normalize.ts` gains `asStringArray()` and routes
  every rendered string-array field (competitor strengths/weaknesses, pain
  userSegments, persona goals/frustrations, pricing features/examples,
  channel audience/keyPlatforms, insight supportingAgents, marketSize
  sources) through it, so objects/numbers/null smuggled in by a real LLM
  no longer render as `[object Object]`/`null`. `marketSize.growthTrend` is
  enum-coerced (accelerating|stable|declining);
  `recommendations[].period` added to the schema ('monthly'|'yearly'|
  'one-time'|'usage') and `PricingScoutReport` renders a real period label
  instead of always "per user / month". `Meter`/`Donut`/`CompetitorAnalyst`
  `formatPrice` all gained `Number.isFinite` guards so non-finite input
  renders 0 / '—' / '?' instead of `NaN`. 15 new tests. 85 files / 1454
  tests pass, tsc and build clean.
- **Compare page i18n + real full-report bulk export (round 213)** —
  `/compare` now routes every user-visible string through `t()`; previously
  it hardcoded Chinese in ~50 places. 50 new `compare.*` keys added across
  all four locales with parameter substitution ({count}, {a}/{b}, {pct},
  {status}). History bulk export was a stub emitting only summary rows;
  R213 rewrites `handleBulkExport` to fetch the full run from
  `/api/research/runs/[id]` for every selected id, parse the synthesis, and
  concatenate per-run markdown reports via the shared
  `generateMarkdownReport()`. Each fetch failure degrades gracefully with a
  "Failed to fetch full run" note. 84 files / 1439 tests pass, tsc and build
  clean.
- **Cron trigger endpoint + cancelled/failed run persistence + history
  cancelled filter (round 212)** — `/api/cron/scheduler` (GET + POST) is a
  serverless-friendly external trigger for schedules that the in-process
  `setInterval` can't fire on Vercel; authorised by `LAUNCHLENS_CRON_SECRET`
  in constant time, refused entirely when unset. `ResearchRun.status`
  widens to 'completed' | 'failed' | 'cancelled' so cancelled sessions no
  longer vanish on restart; `cancelSession()` and both cancel branches in
  `runResearchSession` now persist a 'cancelled' row carrying whatever
  partial agent output existed. `/history` exposes a 'Cancelled' filter
  and status glyphs distinguish all four states. 7 new cron tests + cancel
  persistence tests. 84 files / 1439 tests pass, tsc and build clean.
- **Restore public list endpoint, gate export + import behind admin (round
  211)** — `/api/research/runs` GET (list/search) dropped its `requireAdmin`
  gate; same-origin CSRF cookie is sufficient for non-sensitive summary rows,
  restoring pre-R202 behavior so `/history`, dashboard stats, `RelatedRuns`,
  and `DataManager.fetchRuns` render. Bulk export (`format=json|csv|jsonl`)
  and `/api/data/import` (destructive) remain admin-only;
  `DataManager` now exposes an inline admin-token input (saved to
  localStorage) so users can authorize server-side restore from the
  data-management UI. New route tests cover the auth split. 83 files / 1429
  tests pass, tsc and build clean.
- **Nested-field robustness / output normalization (round 210)** — closed the
  real-LLM crash risk that the round-209 audit exposed. The output validator
  only checks top-level field presence and a couple of deep checks
  (TAM/SAM/SOM range, synthesis scores), so any real LLM that returns a
  structurally valid but *incomplete* nested object (e.g. `competitors:
  [{name: "X"}]` with all other required fields missing) would be passed
  straight to the UI, which dereferences fields unguarded and crashes the
  report tab. New `src/lib/providers/output-normalize.ts` (`normalizeAgentOutput`)
  sits between the validator and the engine: it fills safe defaults for
  every nested field the UI reads (empty strings, empty arrays, `[]` for
  arrays like `gaps`/`recommendations`/`userPersonas`/`unmetNeeds`/
  `recommendedChannels`/`contentTopics` that aren't in `REQUIRED_FIELDS`),
  coerces enum-like fields to allowed values (`positioning`, `severity`,
  `frequency`, `period`, `category`/`reach`/`cost`/`effectiveness`,
  `confidence`), and clamps `synthesis` scores to 0-100. Both providers
  call it after `validateAgentOutput` succeeds. Defensive second layer in
  shared UI primitives: `ConfidenceBadge` now falls back to `"low"` on
  undefined/invalid level instead of throwing `config[undefined].bg`;
  `formatCurrency` / `formatPrice` return `"—"` on non-finite numbers
  instead of throwing on `undefined.toFixed()`; `CitationList` shows the
  raw `accessedAt` string when `new Date(...)` would produce
  "Invalid Date". The mock provider's data is already complete so
  normalize is a no-op for the demo path. 23 new `output-normalize.test.ts`
  cases (one per agent + arrays + enums + NaN + non-object) + 5 new
  `ConfidenceBadge.test.tsx` cases (undefined/invalid/numeric level).
  82 files / 1423 tests pass (+28), tsc and build clean, lint 0.
- **MiniMax provider + reasoning-model JSON extraction + synthesis validator fix (round 209)** —
  the first real-LLM end-to-end validation. Wired MiniMax (MiniMax-M3) via
  the OpenAI-compatible adapter and discovered two blockers that made every
  real call degrade to mock: (1) MiniMax-M3 is a reasoning model that wraps
  its JSON in `<think>…</think>` blocks, so a bare `JSON.parse` always failed;
  (2) the output validator required a phantom `summary` field on synthesis
  output that doesn't exist in the `SynthesisOutput` schema, so every real
  synthesis call failed validation. New shared `src/lib/providers/json-extract.ts`
  (`extractJsonObject`) strips `<think>` blocks, fenced code blocks, and
  trailing prose, scans for the first balanced `{…}`, and tolerates trailing
  commas — used by both providers before parsing. Fixed the synthesis
  `REQUIRED_FIELDS` to match the actual schema (execSummary, opportunityScore,
  riskScore, keyInsights, topThreeOpportunities, topThreeRisks,
  recommendedNextStep, launchlensBrief). End-to-end verified against the live
  MiniMax-M3 API: market-sizer and synthesis both return real structured
  data (trends, segments, citations with real URLs, opportunity/risk scores,
  launchlensBrief) with `fallback: null` — no mock degradation. `.env.local`
  added (gitignored) with the MiniMax key; `.env.example` documents the
  MiniMax wiring (`OPENAI_BASE_URL=https://api.minimaxi.com/v1`,
  `OPENAI_MODEL=MiniMax-M3`). `docs/PROVIDERS.md` gains a MiniMax section.
  Tests: 15 `json-extract.test.ts` cases (think blocks, fences, trailing
  prose, nested braces, escaped quotes, trailing commas, unclosed think) +
  1 synthesis validator case asserting the real required field. 80 files /
  1395 tests pass (+16), tsc and build clean, lint 0.
- **Streaming fallback fix + provider test-connection (round 208)** — closed a
  round-205 gap and added the last major usability affordance. The streaming
  path (taken whenever `onProgress` is set, i.e. every real research run)
  let `readSseWithReconnect` failures fall straight to the outer catch
  without invoking `onFallback`, so a stream that dropped after retries — or
  returned an HTTP error / empty body mid-stream — degraded to mock with no
  "demo" badge. Both providers now wrap the SSE read in a try/catch that
  classifies the failure as `network_error` (Aborts excluded as user cancels)
  before re-throwing, so the demo badge and session banner light up. New
  `/api/provider/test` endpoint runs a single non-streaming `generate()`
  against the configured provider with the lightest agent schema
  (pain-detective) so a user can confirm their real key/base URL/model
  actually produce valid structured output without launching a full 6-agent
  session; mock providers return immediately, real providers that fail
  return the precise `reason` (http_error / validation_error / ...). The
  endpoint is CSRF-guarded and rate-limited. `ProviderPill` gained a "Test"
  button that calls it and shows Connected (durationMs) / Failed (reason) /
  Error, fully translated across all four locales via new
  `provider.probe.*` dictionary keys. 2 new streaming-fallback tests
  (one per provider) using a mock ReadableStream that throws mid-read.
  79 files / 1379 tests pass (+2), tsc and build clean, lint 0.
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
