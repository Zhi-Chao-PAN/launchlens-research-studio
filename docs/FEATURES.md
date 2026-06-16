# Feature inventory

## Runtime providers (round 12, 16)
| Provider id | Triggered by | Notes |
| --- | --- | --- |
| mock | default; LAUNCHLENS_PROVIDER=mock; or any error | Deterministic FNV-1a seeded outputs. |
| openai | OPENAI_API_KEY or LAUNCHLENS_OPENAI_KEY | Chat completions, response_format json_object. Streams when consumer provides onProgress. |
| anthropic | ANTHROPIC_API_KEY (preferred over OpenAI when both set) | Messages API with x-api-key header. |

Forcing a specific provider:
- LAUNCHLENS_PROVIDER=mock      always use mock
- LAUNCHLENS_PROVIDER=openai    require OpenAI even when Anthropic key present
- LAUNCHLENS_PROVIDER=anthropic require Anthropic

Real providers always validate JSON via output-validator and fall back
to mock outputs on HTTP errors, JSON parse failures, or schema mismatch.

## Diagnostics endpoints (round 18)
- GET /api/health    -> status, version, uptime, current provider info
- GET /api/telemetry -> summary + recent ring buffer (?limit=N, max 200)
- POST /api/vitals   -> web-vitals beacon sink (no-op recorder)

## Reliability primitives (round 19)
- retryWithBackoff   exponential backoff + jitter, 5xx/429 retried by default
- checkRateLimit     per-key token bucket, default 10 req / 60 s on /api/research

## i18n (rounds 9, 13)
Dictionaries for English, Simplified Chinese, Japanese cover hero, header,
status announcer, error banner, agent name/description for all six agents,
status pills, sidebar header, "Powered by 6 research agents" caption,
keyboard shortcut hints, footer.

## Performance (rounds 8, 14)
- bucketProgress() smooths streaming progress to 9 levels for memo stability.
- React.memo on AgentCard with custom equality.
- WebVitalsReporter samples LCP/CLS/INP via PerformanceObserver and beacons
  to /api/vitals.
- Each agent report section is lazy-loaded via next/dynamic.

## Quality gates
- npm run regression: lint + unit + build + bundle stats, status table
  emitted to regression-report.md.
- node e2e/playwright-e2e.js: 26 assertions covering landing, theme,
  skip link, SEO, /api/health, /api/telemetry, manifest, sitemap, robots,
  research flow, tabs, exports, share button, dark mode, mobile sidebar.
