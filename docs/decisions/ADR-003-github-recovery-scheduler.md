# ADR-003: Use GitHub Actions for independent Deep recovery

## Status

Accepted.

## Date

2026-07-15

## Context

Deep Research needs an independent recovery trigger with a bounded observed
interval. The production Vercel project is on Hobby, where cron jobs
cannot run more than once per day, so adding a frequent `vercel.json` cron would
make the deployment invalid. HTTP self-dispatch is intentionally only a fast
wake and cannot be promoted into the independent recovery authority.

GitHub Actions supports scheduled workflows on the default branch with a
minimum five-minute interval per schedule expression. Scheduled runs are
best-effort: they can be delayed or dropped, and public-repository schedules can
be disabled after prolonged inactivity. Configuration alone therefore cannot
prove the recovery capability.

## Decision

Use `.github/workflows/deep-recovery.yml` as the single independent production
scheduler. It contains one five-minute schedule expression offset from the top
of the hour, where GitHub documents higher scheduled-workflow load. The Deep
capability contract uses a 360-second observed completion budget: five minutes
for the nominal schedule and a bounded 60 seconds for scheduling and endpoint
completion jitter.

The schedule calls the authenticated production endpoint with a GitHub Actions
secret. Workflow concurrency permits at most one running and one pending run;
a newer queued run can replace the existing pending run. This is acceptable
because the endpoint is a state-based recovery sweep rather than an event log,
and the Redis single-flight lock prevents overlapping sweeps. Any missed tick
still becomes visible when heartbeat freshness exceeds the budget. A non-secret
GitHub run identifier is forwarded as `x-request-id` for operational tracing.
`workflow_dispatch` remains available for diagnosis.

Availability is derived from the bounded Redis heartbeat history, not from
workflow YAML. A
delayed, dropped, failed, or disabled schedule causes `recovery_freshness` to
fail and Deep to return to Preview. The nominal five-minute sequence and its
60-second allowance are an observation contract, not a claimed GitHub
service-level guarantee.

Heartbeat records do not encode the GitHub event type. They reject rapid manual
bursts but cannot distinguish a realistically spaced `workflow_dispatch` run
from a `schedule` run. Production acceptance must therefore verify both the
Redis heartbeat history and at least one GitHub Actions run whose event is
`schedule`.

## Alternatives Considered

### Vercel Cron on Hobby

Rejected because the plan supports only daily execution, far outside the Deep
recovery contract. A high-frequency declaration would fail deployment.

### Multiple five-minute expressions aggregated below five minutes

Rejected because GitHub documents five minutes as the shortest scheduled
workflow interval; it does not promise that multiple expressions may be
aggregated into a supported sub-five-minute production clock.

### One five-minute schedule with a strict 300-second observation budget

Rejected because scheduler start jitter and endpoint execution are measured at
completion. A strict 300-second interval would flap even when the nominal
schedule is operating normally. The 60-second allowance is explicit and
bounded; delays beyond it still fail closed.

### Two independent scheduler providers

Rejected because duplicate authorities increase secret distribution,
diagnostic ambiguity, and operational drift. Redundancy is kept inside one
auditable workflow and one lock-protected endpoint.

## Consequences

- The public repository runs about 288 small scheduler jobs per day. Standard
  GitHub-hosted runners are free for public repositories, but logs and function
  invocations must still be monitored.
- Scheduled workflows run only from the default branch. A pull request cannot
  establish production cadence; at least one real `schedule` event and the
  required heartbeat history must be observed after merge.
- GitHub may delay or disable schedules. This is visible degradation, not a
  silent durability promise: Deep fails closed to Preview.
- If the project upgrades to Vercel Pro or adopts a managed workflow service,
  disable the GitHub schedule before enabling the replacement so exactly one
  independent scheduler remains authoritative.

## Operational Invariants

- Keep `LAUNCHLENS_CRON_SECRET` in GitHub Actions equal to production
  `CRON_SECRET`; never print or place either value in a URL.
- Keep the cron and worker secrets distinct and at least 24 characters.
- Do not infer production health from workflow configuration or heartbeat
  history alone. Verify an `event=schedule` Actions run and Redis observations.
- Preserve workflow concurrency, Redis single-flight locking, and the
  360-second freshness gate.
