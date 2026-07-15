# Provider configuration

LaunchLens Research Studio supports a deterministic mock provider, legacy
single-key environment configuration, and a production-oriented managed
three-slot keyring. Provider selection is implemented in
[`provider-registry.ts`](../src/lib/providers/provider-registry.ts); the managed
contract is recorded in
[`ADR-002`](./decisions/ADR-002-managed-provider-keyring.md).

## Choose one credential authority

| Mode | Intended use | Credential source | Failure contract |
| --- | --- | --- | --- |
| Mock | Demo, local UI work, CI | None | Deterministic synthetic output |
| Legacy environment key | Local development and compatibility | One OpenAI or Anthropic key in the deployment environment | Standard can degrade to mock; Deep remains strict |
| Managed keyring | Production | Three encrypted Redis slots managed from `/admin` | Ordered slot failover; Standard may explicitly degrade once, while Deep and semantic review fail closed |

Do not configure the managed keyring as if environment keys were additional
capacity. When `LAUNCHLENS_PROVIDER_KEYRING_ENABLED=1`, the keyring is the
credential authority and legacy provider-key variables are not a hidden fourth
slot.

## Managed three-slot keyring

The recommended production setup requires all of the following:

| Variable | Requirement |
| --- | --- |
| `LAUNCHLENS_PROVIDER_KEYRING_ENABLED` | Set to `1`. |
| `LAUNCHLENS_PROVIDER_KEYRING_PROVIDER` | Exactly `openai` or `anthropic`. This deployment value is read-only in `/admin`, and every slot must match it. |
| `LAUNCHLENS_PROVIDER_KEY_ENCRYPTION_SECRET` | Canonical Base64 encoding of exactly 32 random bytes, used for AES-256-GCM. Generate with `openssl rand -base64 32`. |
| `LAUNCHLENS_ADMIN_TOKENS` | Comma-separated administrator bootstrap tokens. Use long random values and rotate them through deployment configuration. |
| `LAUNCHLENS_ADMIN_SESSION_SECRET` | Distinct secret containing at least 32 random bytes for signed, short-lived HttpOnly sessions. |
| Redis | Configure either `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`, or `KV_REST_API_URL` + `KV_REST_API_TOKEN`. |

After deployment, exchange an administrator token at `/admin` and write keys to
slots 1, 2, and 3 in priority order. Secret material is write-only: API
responses and the browser expose configuration state, provider, opaque
credential identity, and health metadata, but never an API key, suffix, or
fingerprint. Keys and bootstrap tokens must not be placed in URLs, browser
storage, screenshots, or logs.

Changing providers is a deployment operation: clear the existing slots, change
`LAUNCHLENS_PROVIDER_KEYRING_PROVIDER`, redeploy, and then add matching keys.
The console intentionally cannot switch the runtime provider.

### Ordered failover

Managed calls try enabled, admissible slots strictly in the order `1 -> 2 -> 3`.
Each logical operation makes at most one upstream request per slot.

- Authentication, quota, rate-limit, network, timeout-response, and upstream
  5xx failures may advance to the next slot and update credential health.
- Abort signals stop immediately.
- Request, configuration, schema, empty-response, JSON parsing, and validation
  failures stop immediately so another key is not charged for the same invalid
  operation.
- Cooldowns are credential-bound. Replacing a key creates a new opaque identity
  so stale health cannot contaminate the replacement.
- Standard research may invoke the deterministic mock once after the managed
  path is exhausted, and must record explicit fallback provenance.
- Deep generation, Deep synthesis, and structured semantic review never convert
  provider failure into apparently verified mock work; they fail closed.

## Legacy single-key mode

For local development, leave the keyring disabled and configure one provider:

```dotenv
# OpenAI
LAUNCHLENS_PROVIDER=openai
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
# OPENAI_BASE_URL=https://api.openai.com/v1

# Or Anthropic
# LAUNCHLENS_PROVIDER=anthropic
# ANTHROPIC_API_KEY=sk-ant-...
# ANTHROPIC_MODEL=claude-3-5-sonnet-latest
# ANTHROPIC_BASE_URL=https://api.anthropic.com
```

`LAUNCHLENS_OPENAI_KEY` is a supported alias that takes precedence over
`OPENAI_API_KEY`. With no forced provider, the registry auto-selects Anthropic,
then OpenAI, then mock. `LAUNCHLENS_PROVIDER=mock` always selects the
deterministic provider.

Legacy adapters retain their compatibility retry/degradation behavior for
Standard research. The Deep execution profile selects strict adapters and does
not inherit Standard's mock fallback.

OpenAI-compatible gateways can be used through `OPENAI_BASE_URL` and
`OPENAI_MODEL`. Provider and retrieval base URLs must use HTTPS in production;
plain HTTP is accepted only for loopback development. URLs with embedded
credentials, query strings, or fragments are rejected before a secret is
attached.

## Retrieval and evidence grounding

Configure Tavily to ground generated claims in retrieved sources:

```dotenv
TAVILY_API_KEY=tvly-...
# LAUNCHLENS_SEARCH_PROVIDER=tavily
# TAVILY_BASE_URL=https://api.tavily.com
```

Standard research may continue with clearly labelled degraded/mock provenance
when retrieval is unavailable. Deep Research requires a real, safe Tavily
configuration and fails closed without it. Retrieved sources are loaded at the
claim boundary, and emitted citation URLs must come from the retrieval
allowlist.

## Protected Vercel Preview deployments

An authenticated Deep worker wake and Vercel Deployment Protection are separate
controls. If a Preview deployment is protected, enable **Protection Bypass for
Automation** in Vercel. Vercel injects
`VERCEL_AUTOMATION_BYPASS_SECRET`; the dispatcher sends it only as the
`x-vercel-protection-bypass` request header and never includes it in errors or
logs.

Set `LAUNCHLENS_DEEP_WORKER_BASE_URL` when an explicit worker origin is desired.
Otherwise Preview uses its own `VERCEL_URL`; only a Production deployment may
prefer `VERCEL_PROJECT_PRODUCTION_URL`. This prevents Preview work from
silently dispatching into Production.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| `/admin` cannot save a key | Verify Redis, the canonical 32-byte encryption secret, administrator session setup, and that the submitted provider matches the deployment provider. |
| Slot 2 or 3 is never tried | Inspect the first failure category. Schema/configuration/parsing/validation errors intentionally stop instead of rotating keys. |
| Output is marked mock/degraded | Inspect fallback provenance and credential health. Standard can explicitly degrade; Deep cannot. |
| Deep is unavailable | Inspect `GET /api/research/capabilities`; provider configuration alone is only one of the eight production requirements. |
| Preview worker wake returns a redirect or 401 | Verify the explicit/Preview worker origin, Deep worker secret, and Vercel Protection Bypass for Automation. Never print either secret while diagnosing. |
| Retrieval is unavailable | Verify `TAVILY_API_KEY`, `LAUNCHLENS_SEARCH_PROVIDER`, and that `TAVILY_BASE_URL` passes the HTTPS safety rules. |
