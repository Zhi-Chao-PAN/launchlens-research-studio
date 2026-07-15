# ADR-002: Manage three ordered provider credentials in an encrypted server-side keyring

## Status

Accepted.

## Date

2026-07-15

## Context

A single provider API key is an operational single point of failure. LaunchLens also has two different failure contracts: Standard research may remain usable with clearly identified demo output, while Deep Research and semantic review must never disguise an upstream failure as verified work. Browser storage, plaintext Redis values, key suffixes, and an implicit environment-variable fallback would all weaken the administrator boundary.

## Decision

The administrator console manages exactly three global priority slots for one provider at a time. `LAUNCHLENS_PROVIDER_KEYRING_PROVIDER` is the single runtime authority and is displayed read-only in the console. Generation, structured review, capability checks, scheduler readiness, and credential mutations all use the same normalized resolver. A mutation targeting another provider fails closed; if historical Redis data does not match the runtime provider, writes remain locked while deletion stays available for cleanup.

Redis stores a versioned document protected by compare-and-set revision updates. Each API key is encrypted independently with AES-256-GCM using a deployment secret that must decode from canonical Base64 to exactly 32 bytes. The management API is write-only for secret material: responses expose configuration state, the non-secret runtime provider, an opaque replacement identity, and health metadata, but never the key, a suffix, or its fingerprint.

Provider calls resolve enabled slots in the fixed order 1 → 2 → 3. Authentication, quota, rate-limit, network, timeout-response, and 5xx failures may advance to the next slot with bounded cooldowns. Request/schema/configuration errors stop immediately so another key is not charged for the same invalid operation. An expired cooldown admits one credential-bound, single-flight half-open probe. Health writes verify the current credential identity atomically so a replaced key cannot be polluted by a stale request.

Standard research may invoke the deterministic mock once, after all admissible slots fail, and must emit explicit fallback provenance. Deep generation, Deep synthesis, and the structured semantic reviewer fail closed. When keyring mode is enabled, legacy provider-key environment variables are not an implicit fourth slot.

The browser exchanges an admin-scoped bearer token for a short-lived signed HttpOnly session. Provider mutations additionally require same-origin CORS and double-submit CSRF validation. The plaintext token and API keys are never persisted in browser storage.

## Consequences

- Redis and a valid encryption secret are mandatory for keyring operation.
- All three slots must match the deployment-level runtime provider. Switching provider requires clearing the existing slots, changing the environment setting, and redeploying.
- Replacing a key creates a new opaque credential identity and invalidates stale health state.
- The Deep capability gate requires at least one currently admissible managed credential, not merely a non-empty encrypted document.
- Operators must back up or rotate the encryption secret deliberately. Losing it makes stored ciphertext intentionally unreadable; silently accepting corrupted or undecryptable state is forbidden.

## Operational Invariants

- Never return, log, export, or place provider secrets in URLs, audit details, client storage, or error payloads.
- Never retry more than one upstream call per slot for a single managed logical attempt.
- Never bypass slot order or treat a legacy env key as a hidden fallback when keyring mode is enabled.
- Never let the console, provider registries, capability gate, and recovery scheduler resolve different keyring providers.
- Never let Standard fallback semantics leak into Deep or semantic review.
