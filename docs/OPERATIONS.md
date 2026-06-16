# Operations guide

This guide is for operators running the studio with real LLM keys.

## Provider selection

The runtime picks a provider based on environment variables. Order of
precedence:

1. LAUNCHLENS_PROVIDER=mock      always use the deterministic mock.
2. LAUNCHLENS_PROVIDER=openai    require OpenAI even when Anthropic is set.
3. LAUNCHLENS_PROVIDER=anthropic require Anthropic.
4. ANTHROPIC_API_KEY set         auto-prefer Anthropic.
5. OPENAI_API_KEY set            fall back to OpenAI.
6. otherwise                     use the mock.

Real providers always fall back to the mock on:

- HTTP 4xx (degrade immediately to keep quota intact)
- HTTP 5xx or 429 after 3 retry attempts with exponential backoff
- JSON parse failure
- output-validator schema violation

## Diagnostics endpoints

- GET /api/health
  Returns status, version, uptime, current provider info, and a
  breakers snapshot. Use this for liveness probes.

- GET /api/telemetry?limit=50
  Returns summary (total, success rate, average ms, per-provider and
  per-agent breakdown), breakers, and the most recent N records
  (default 50, max 200).

- POST /api/vitals
  Sink for client-side beacons (web vitals + crash breadcrumbs). Logs
  payload in non-production environments.

## Reliability primitives

### Circuit breaker

Per-provider state lives in src/lib/utils/circuit-breaker.ts. Default
config: 5 consecutive failures opens the breaker for 60 seconds.
While open, the engine short-circuits to the deterministic mock and
records telemetry under "<provider>(breaker:open->mock)" so the
fallback is auditable.

A single success after the cooldown closes the breaker.

### Rate limiting

POST /api/research uses checkRateLimit keyed by the first
X-Forwarded-For value. Default capacity 10, refill interval 60 s.
Blocked requests return 429 with X-RateLimit-Remaining and
X-RateLimit-Reset-Ms response headers.

### Retry

retryWithBackoff (src/lib/utils/retry.ts) is shared by both real
providers. Default 3 attempts, base 200 ms, cap 2 s, 25 percent jitter.
Only failures whose message starts with "retriable HTTP" trigger a
retry; everything else surfaces immediately.

## Tuning

| Knob                       | Default | Where                                        |
| -------------------------- | ------- | -------------------------------------------- |
| Rate limit capacity        | 10      | src/lib/api/rate-limit.ts (DEFAULT_CONFIG)   |
| Rate limit interval        | 60 s    | src/lib/api/rate-limit.ts (DEFAULT_CONFIG)   |
| Breaker threshold          | 5       | src/lib/utils/circuit-breaker.ts             |
| Breaker cooldown           | 60 s    | src/lib/utils/circuit-breaker.ts             |
| Retry max attempts         | 3       | src/lib/utils/retry.ts                       |
| Retry base delay           | 200 ms  | src/lib/utils/retry.ts                       |
| Telemetry ring capacity    | 200     | src/lib/telemetry/telemetry.ts               |
