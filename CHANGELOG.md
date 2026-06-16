# Changelog

All notable changes to LaunchLens Research Studio are documented here.
The format follows Keep a Changelog (https://keepachangelog.com/en/1.1.0/),
and this project adheres to Semantic Versioning (https://semver.org/).

## [Unreleased]

### Added
- Provider/breaker status pill in header (round 22).
- Translated crash and 404 screens with copy-trace button (round 23).

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
