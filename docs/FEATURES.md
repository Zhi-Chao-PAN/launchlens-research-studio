# Feature inventory

## Research workflow

- Five specialist agents run in parallel: market sizing, competitors, customer
  pain, pricing, and acquisition channels.
- A synthesis agent cross-validates the specialist outputs and creates an
  executive dossier plus a structured LaunchLens brief.
- Standard Research is request-bound and optimized for a faster answer.
- Deep Research uses a Redis-authoritative eleven-unit work graph, authenticated
  worker wakes, fencing/leases, resumable observation, and an independent
  recovery scheduler.
- Deep runs require real retrieval and three semantic validation passes. They
  fail closed when generation, evidence, or review prerequisites are missing.

## Evidence integrity

- Retrieved sources are attached at the claim boundary rather than shared
  indiscriminately across claims.
- Typed retrieval failures distinguish absent evidence from invalid output.
- Gap-fill and brief-export guards bind evidence and exported values to the
  validated result, preventing cross-claim leakage or stale export data.
- Citation URLs are constrained to retrieved-source allowlists when grounding
  is enabled.

## Runtime providers

| Provider path | Trigger | Behavior |
| --- | --- | --- |
| Deterministic mock | No real provider, explicit `LAUNCHLENS_PROVIDER=mock`, or an allowed Standard fallback | Reproducible demo output with mock/degraded provenance |
| Legacy OpenAI/Anthropic | Environment API key while managed keyring is disabled | Compatibility single-key mode |
| Managed OpenAI/Anthropic | `LAUNCHLENS_PROVIDER_KEYRING_ENABLED=1` plus a deployment provider | Three encrypted Redis slots tried strictly `1 -> 2 -> 3` |

The managed provider is fixed by deployment configuration and read-only in the
administrator console. Retryable upstream/key failures may rotate slots;
request/schema/configuration/parsing/validation failures stop. Standard may make
one explicit mock fallback after all slots fail. Deep generation, synthesis,
and semantic review fail closed. See [Provider configuration](./PROVIDERS.md).

## Administrator console

- Short-lived signed HttpOnly administrator sessions bootstrap from rotatable
  server-side tokens.
- Provider key material is write-only and encrypted with AES-256-GCM before it
  reaches Redis.
- Exactly three ordered slots expose non-secret configuration and health state;
  keys, suffixes, and fingerprints are never returned.
- Same-origin and CSRF checks protect credential mutations.
- The console supports English and Simplified Chinese, responsive desktop/mobile
  navigation, and accessible keyboard/focus states.

## Deep production gate

Deep availability is derived from eight live requirements: opt-in, Redis,
generation, retrieval, semantic review, worker wake, independent recovery
declaration, and fresh chronological recovery evidence. A declared cron without
observed ticks is not considered healthy. A later recovery tick can self-heal
work abandoned after a worker crash and lease expiry.

## Diagnostics and resilience

- `GET /api/health`: liveness and runtime status.
- `GET /api/research/capabilities`: Deep readiness and recovery observations.
- `GET /api/telemetry`: bounded provider/agent telemetry summaries.
- Redis mirrors Standard run state; Redis is authoritative for Deep lifecycle,
  leases, revisions, fencing, due work, and recovery heartbeat history.
- CI retains browser screenshots, Playwright output, and server logs on failure.

## Internationalization and interface

- The research experience includes English, Simplified Chinese, Japanese, and
  Korean dictionaries for core research/status interactions.
- The administrator experience is intentionally bilingual (English and
  Simplified Chinese).
- SSE progress, reconnectable observation, responsive report navigation,
  accessible status announcements, dark mode, and export/share workflows are
  supported.

## Quality gates

The release pipeline runs lint, TypeScript checks, unit tests, a production
build, smoke tests, browser E2E, administrator security/responsive E2E, and
CodeQL. Use the commands in `package.json` and the workflows under
`.github/workflows/` as the executable source of truth; test counts are not
hard-coded here because they change as coverage grows.
