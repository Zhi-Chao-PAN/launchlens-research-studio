# ADR-005: Use Upstash QStash for independent Deep recovery

## Status

Accepted. Supersedes [ADR-003](./ADR-003-github-recovery-scheduler.md).

## Date

2026-07-16

## Context

Deep Research requires one independent recovery trigger with a nominal
five-minute cadence and an observed completion interval of at most 360 seconds.
The capability gate intentionally fails closed when that cadence is not proven.

ADR-003 selected GitHub Actions because the Vercel Hobby plan cannot run a
five-minute Vercel Cron. Production evidence showed that GitHub accepted the
five-minute expression but did not deliver schedule events within the contract:
recent successful runs were separated by roughly 57 minutes to 6 hours 41
minutes, even though every run that was created authenticated, reached Vercel,
executed recovery, and wrote Redis successfully. The scheduler declaration was
valid while the observed service was not. Deep correctly remained in Preview
with `recovery_freshness` as the eighth unmet control.

## Decision

Use one Upstash QStash schedule as the sole production recovery authority:

- cron: `*/5 * * * *` (UTC; timezone is irrelevant for a uniform cadence);
- method: `POST`;
- destination: `https://launchlens-research-studio.vercel.app/api/cron/scheduler`;
- body: a fixed, versioned JSON object;
- delivery timeout: `55s`;
- retries: `2`, keeping worst-case daily delivery attempts within the current
  free-plan allowance;
- stable schedule ID: `launchlens-deep-recovery-production-v1`;
- redact request content and authentication material from control-plane logs.

The application verifies QStash's JWT with both current and next signing keys,
binds the JWT subject to the exact production destination, and rejects any
different schedule ID. Successful message IDs are recorded durably so
at-least-once redelivery cannot execute recovery twice. Heartbeat history stores
the QStash source, schedule ID, destination, message ID, and attempt, and the
capability gate counts only matching source-bound observations.

The GitHub recovery workflow is removed rather than retained as a manual writer.
Diagnostics must inspect QStash delivery logs and the read-only capability
response; they cannot manufacture production cadence. The Redis single-flight
lock remains the overlap guard. Three consecutive, realistically spaced
successful QStash ticks are required before Deep becomes available; stale or
failed delivery returns it to Preview automatically.

QStash's management token is a control-plane credential. The application does
not need it at runtime. After provisioning and schedule creation, disconnect the
QStash Marketplace resource from the Vercel project and retain only the two
signing keys plus the expected schedule ID and destination as application
configuration.

## Alternatives Considered

### Continue with GitHub Actions

Rejected because measured schedule delivery missed the 360-second contract by
an order of magnitude. Successful jobs after a long delay do not provide bounded
recovery.

### Vercel Cron on Hobby

Rejected because Hobby does not provide minute-level cron frequency. Keeping
`vercel.json` free of a competing cron also preserves valid deployments.

### Upgrade to Vercel Pro

Viable later, but unnecessary for the current load and would introduce a paid
plan solely for one five-minute trigger. A future migration must disable QStash
before enabling Vercel Cron.

### Shared-secret-only QStash delivery

Rejected because possession of a forwarded secret cannot prove that a heartbeat
came from the configured QStash schedule. Source-bound signature verification
makes the eighth capability control an observed scheduler claim rather than an
operator convention.

## Consequences

- The production control plane gains one managed scheduler resource and the
  application gains the official QStash verifier dependency.
- Five-minute cadence produces 288 messages per day. With two retries, the
  continuous-failure ceiling is 864 delivery attempts per day; plan usage and
  delivery logs still require monitoring.
- GitHub Actions is no longer part of the production recovery availability
  claim.
- Release acceptance requires QStash schedule metadata, signed delivery
  evidence, and the source-bound Redis heartbeat state; configuration alone is
  insufficient.
- Rollback is to pause or delete the QStash schedule and allow Deep to return to
  Preview until a replacement single authority is configured. Do not silently
  weaken the 360-second gate.

## Operational Invariants

- Exactly one production scheduler is active.
- Both signing keys are configured so key rotation does not interrupt recovery.
- The verified JWT subject, schedule ID, and configured production destination
  must all match.
- A QStash message ID can commit successful recovery at most once.
- Legacy, GitHub, and manually written heartbeat entries never count toward the
  QStash cadence window.
- QStash tokens and signatures are not committed or logged, and the management
  token is not injected into application runtime after provisioning.
