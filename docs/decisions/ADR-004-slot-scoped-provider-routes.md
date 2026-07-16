# ADR-004: Bind each managed credential to its provider route

## Status

Accepted. Extends ADR-002.

## Date

2026-07-16

## Context

The three managed slots can represent different OpenAI-compatible services.
An API key is valid only together with the service Base URL and model that
issued it. A single deployment-wide `OPENAI_BASE_URL` or model would therefore
send later-slot secrets to the wrong service and make ordered failover
unreliable. Allowing an administrator to enter any HTTPS URL would also turn
the connection tester into a credential-exfiltration primitive.

## Decision

Treat each slot as one atomic route: `API key + Base URL + model + enabled`.
Encrypt the key with AES-256-GCM and authenticate the normalized Base URL and
model as additional data. Replacing any member of the route except `enabled`
creates a new `credentialId` and clears identity-bound runtime health/probe
state. Legacy records remain readable and receive deterministic slot defaults,
but cannot run or be tested until an administrator saves the route once. That
save binds URL/model into GCM AAD without requiring the write-only key again.

Managed generation and structured review resolve all three values from the
same slot. Legacy global Base URL/model variables do not override a managed
route. Retryable failures may advance to the next complete route in priority
order. An upstream HTTP 400 may also advance without cooling down the key,
because heterogeneous OpenAI-compatible routes can reject provider-specific
request fields; locally detected schema, configuration, parsing, empty-output,
and validation failures still stop immediately.

The administrator may test exactly one saved route through
`POST /api/admin/provider-credentials/test`. The request is bound to both the
snapshot revision and `credentialId`, works for a saved disabled route, sends a
small chat completion with a structured probe, rejects redirects, and returns only a bounded
diagnostic. It does not return upstream bodies, expose secrets, or change
runtime cooldown/health state.

Production Base URLs must exactly match one of the three built-in routes. Before
a connection test attaches a secret, the server also rejects unsafe URL syntax
and any DNS answer in a private or reserved address range.

## Alternatives Considered

### One global Base URL and model

Rejected because heterogeneous OpenAI-compatible services cannot share a
route, and a failover key would be sent to the wrong host.

### Infer the service from the API key

Rejected because key formats are not stable routing contracts and inspecting
or exposing key prefixes weakens the write-only secret boundary.

### Permit arbitrary administrator-entered HTTPS URLs

Rejected because an authenticated browser compromise or operator mistake could
send a stored credential to an attacker-controlled host.

## Consequences

- Operators must save the route before testing it; unsaved browser drafts are
  never used in an outbound request.
- Changing a URL or model invalidates prior health identity just like replacing
  the key.
- Connection success proves authentication and a minimal structured-completion
  capability for that exact route, not the quality of a full research run.
