# Operations guide

This guide describes the production contract for real providers, the
administrator key vault, and durable Deep Research. The complete variable list
is in [`.env.example`](../.env.example).

## Runtime authority

Choose one provider credential authority per deployment:

- **Managed production mode:** set
  `LAUNCHLENS_PROVIDER_KEYRING_ENABLED=1` and declare exactly one runtime
  provider with `LAUNCHLENS_PROVIDER_KEYRING_PROVIDER=openai|anthropic`.
  Redis-backed slots 1, 2, and 3 are the only provider credentials.
- **Legacy compatibility mode:** leave the keyring disabled and provide one
  environment key. This is convenient for local development but does not
  provide ordered credential failover.
- **Mock mode:** use `LAUNCHLENS_PROVIDER=mock` for demos and deterministic CI.

The managed deployment provider is the authority used by the console, runtime,
capability gate, structured reviewer, and scheduler checks. It is intentionally
read-only in `/admin`.

## Production prerequisites

### Persistence and administrator access

Configure one complete Redis pair:

```text
UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN
or
KV_REST_API_URL + KV_REST_API_TOKEN
```

Then configure:

- `LAUNCHLENS_ADMIN_TOKENS`: long, rotatable bootstrap tokens;
- `LAUNCHLENS_ADMIN_ROTATION_TOKENS`: optional additive bootstrap channel for
  short-lived credential rotation; revoke the temporary token in-app before
  removing the deployment variable;
- `LAUNCHLENS_ADMIN_SESSION_SECRET`: a distinct secret of at least 32 random
  bytes;
- `LAUNCHLENS_PROVIDER_KEY_ENCRYPTION_SECRET`: canonical Base64 for exactly 32
  random bytes;
- `LAUNCHLENS_PROVIDER_KEYRING_ENABLED=1`;
- `LAUNCHLENS_PROVIDER_KEYRING_PROVIDER=openai|anthropic`.

Use `/admin` to populate the three ordered slots. The API never returns provider
keys, suffixes, or fingerprints. Treat loss of the encryption secret as loss of
the encrypted credentials; the runtime intentionally does not guess or decrypt
with another value.

Configure every slot as an atomic key, Base URL, and model route. Save a route
before using its **Test connection** action; the probe is revision- and
credential-bound, may test a saved disabled slot, and does not alter runtime
health. Built-in routes cover MiniMax, Volcengine Ark, and DeepSeek. Additional
routes are intentionally rejected: URL syntax, redirects, and private/reserved
DNS answers fail closed so stored keys cannot be sent to an arbitrary host.
On first deployment over a legacy key-only vault, click **Save** on each
configured route before activating the keyring. No key re-entry is required;
the save binds the displayed URL/model and rotates the route identity.

### Deep Research

`GET /api/research/capabilities` evaluates eight requirements before Deep can
leave Preview:

1. explicit Deep opt-in;
2. reachable Redis;
3. a real generation provider with at least one usable credential;
4. real Tavily retrieval;
5. a strict semantic reviewer;
6. an authenticated worker wake;
7. a declared independent recovery source;
8. fresh, chronological recovery heartbeat evidence.

At minimum, configure `LAUNCHLENS_DEEP_ENABLED`, a distinct
`LAUNCHLENS_DEEP_WORKER_SECRET`, `TAVILY_API_KEY`, recovery mode, maximum delay,
`LAUNCHLENS_DEEP_RECOVERY_SOURCE=qstash`, both QStash signing keys, the stable
schedule ID, and the exact recovery URL. The single production scheduler is an Upstash QStash
schedule that POSTs a signed message to `/api/cron/scheduler` every five
minutes. Configure a 55-second delivery timeout, two retries, a stable schedule
ID, and the exact production destination. The application verifies QStash's
current/next signing keys and binds the signature to that schedule and URL; its
management token is not an application runtime secret. Configure
`LAUNCHLENS_DEEP_RECOVERY_MAX_DELAY_SECONDS=360`; the extra 60 seconds is a
bounded observation allowance for scheduling and endpoint completion jitter.
The worker secret must be at least 24 characters and is never reused for QStash.

The QStash declaration alone does not satisfy the gate. Deep becomes available
only after Redis contains the required source-bound chronological heartbeat
window with observed intervals at or below 360 seconds. If QStash pauses or
stops delivering, the gate returns Deep to Preview. The retired GitHub workflow
must not write production cadence evidence. Production verification confirms
the QStash schedule metadata and delivery logs alongside the heartbeat
observation.

## Failure contracts

Managed provider slots are attempted strictly `1 -> 2 -> 3`, with at most one
upstream request per slot for one logical operation. Authentication, quota,
rate-limit, network, timeout-response, and 5xx failures may rotate to the next
slot. A provider-specific HTTP 400 can also advance to the next slot without
cooling down the key, because heterogeneous OpenAI-compatible routes can reject
different request fields. Local schema, configuration, parsing, empty-response, and
validation failures stop immediately. Abort signals also stop immediately.

- **Standard:** after the managed path is exhausted, one deterministic mock
  fallback is allowed only with explicit degraded/fallback provenance.
- **Deep and semantic review:** fail closed. Provider or retrieval failure must
  never be represented as verified research.

When managed mode is enabled, legacy environment keys are never used as an
implicit fourth credential.

## Vercel deployment protection and worker routing

For protected Preview deployments, enable Vercel **Protection Bypass for
Automation**. Vercel injects `VERCEL_AUTOMATION_BYPASS_SECRET`; the Deep wake
dispatcher forwards it only in the `x-vercel-protection-bypass` header. Do not
copy the value into source control, URLs, diagnostics, or logs.

Worker-origin precedence is environment-aware:

1. `LAUNCHLENS_DEEP_WORKER_BASE_URL`, when explicitly set;
2. `VERCEL_URL` for Preview and other non-Production deployments;
3. `VERCEL_PROJECT_PRODUCTION_URL`, preferred only when
   `VERCEL_ENV=production` (with `VERCEL_URL` as its fallback).

This prevents a protected Preview deployment from accidentally waking the
Production worker. Worker origins require HTTPS except for loopback local
development.

## Diagnostics

- `GET /api/health` provides liveness and current runtime status.
- `GET /api/research/capabilities` explains every Deep gate requirement and the
  observed recovery state.
- `/admin` shows the deployment provider plus non-secret slot configuration and
  health metadata.
- `GET /api/telemetry?limit=50` provides recent provider/agent summaries where
  enabled by the deployment.
- CI always uploads `screenshots/` and `output/playwright/`; server startup logs
  are retained there so browser failures can be diagnosed without rerunning the
  job.

Never diagnose by printing administrator tokens, provider keys, encryption
secrets, the Deep worker secret, QStash signing keys, QStash management tokens
or delivery signatures, or the Vercel bypass secret.

## Release checklist

1. Run lint, typecheck, unit tests, production build, smoke, and browser E2E.
2. Confirm the managed provider shown in `/admin` matches the intended
   deployment provider and at least one slot is enabled and decryptable.
3. Verify a Standard real-provider run records real provenance; separately
   verify that an intentional total provider failure is visibly degraded.
4. Verify Deep rejects missing retrieval/reviewer/provider prerequisites instead
   of falling back to mock.
5. Trigger one authenticated worker wake against the actual deployment origin.
   On protected Preview, verify the request does not redirect to Vercel SSO.
6. Invoke the independent scheduler normally and wait for genuine chronological
   heartbeat history; rapid manual bursts are not cadence proof.
7. Recheck `GET /api/research/capabilities` and confirm all eight requirements
   pass before presenting Deep as available.
8. Inspect CI artifacts and Vercel logs for secret-free failures before
   promotion.
