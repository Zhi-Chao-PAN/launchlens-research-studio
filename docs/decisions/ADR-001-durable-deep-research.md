# ADR-001: Use a Redis-authoritative fixed work graph for Deep Research

## Status

Accepted. The repository declares five-minute independent recovery; production launch remains capability-gated until the deployed schedule and all other dependencies are verified.

## Date

2026-07-13

## Context

Deep Research targets 10–20 minute, evidence-grounded runs. A single Next.js or Vercel request has a 300-second ceiling, and a browser-held SSE connection cannot be the owner of work that must survive disconnects, instance changes, or retries.

The implementation also needs stronger semantics than “run the agents again”:

- five specialist outputs must use real retrieval and real model providers;
- three semantic passes must execute in order;
- synthesis may consume only adjudicated evidence;
- cancellation must win races against stale workers;
- completed dossiers must enter History only after the authoritative terminal commit.

Adding a managed queue or workflow product would broaden infrastructure and dependency scope, which requires owner approval. Existing Upstash Redis and Vercel primitives are already in the project.

## Decision

Deep Research uses a fixed, durable ten-unit graph:

1. Five specialist units, one per research dimension.
2. Claim-to-source entailment review.
3. Independent corroboration and conflict review.
4. Adjudication.
5. Evidence-constrained synthesis.
6. Final integrity gate.

`DeepRunRecordV1` in Redis is authoritative. Each worker wake may claim and execute exactly one unit. Claims use an expiring lease, monotonically increasing fencing epoch, and expected revision. Commits atomically update both the Deep record and its public `ResearchSession` projection. A stale worker cannot publish output after cancellation or a newer claim.

Fast authenticated self-dispatch is an optimization. The due index plus an independently scheduled recovery trigger is the durability mechanism. SSE and polling are observer channels only; opening or reconnecting a stream never starts Deep work.

Deep is exposed as `available` only when the runtime probe confirms all seven controls:

- explicit operator opt-in;
- reachable durable Redis state;
- real generation provider;
- real Tavily retrieval;
- real structured semantic reviewer;
- authenticated worker wake;
- independent recovery with a declared maximum delay of 300 seconds.

Terminal history persistence is a derived, idempotent observer that runs only after a fenced terminal commit. Active Deep live-state cannot be deleted; callers must cancel first.

## Alternatives Considered

### Keep execution inside the SSE request

- Advantage: smallest code change and immediate progress events.
- Rejected: cannot honestly support the target duration or survive browser disconnects and serverless instance changes.

### Rely only on HTTP self-dispatch

- Advantage: no scheduler change.
- Rejected: dispatch can fail, time out, or be affected by platform recursion protection. It is a latency optimization, not independent recovery.

### Add Vercel Queues, Workflow, or another managed queue now

- Advantage: stronger managed delivery and scheduling primitives.
- Deferred: introduces a new service/dependency and operational contract that requires explicit owner approval. The repository boundary allows a future migration.

### Use a dynamic agent loop

- Advantage: the model could decide which review to run next.
- Rejected: harder to bound cost, retry safely, audit ordering, and prove completion. The fixed graph makes professional validation requirements observable and testable.

## Consequences

- Deep work continues after the browser leaves, subject to recovery scheduling.
- Ten small invocations replace one long request; retries are bounded per unit.
- Redis is required and Deep fails closed when its authority is unavailable.
- Provider configuration is locked for the lifetime of a run; drift fails the stage instead of silently changing provenance.
- Three semantic passes are explicit, ordered, and idempotent. The ledger still reports factual accuracy as `not_established`; semantic review is not a guarantee of truth.
- History may be rebuilt idempotently from a terminal Deep record without changing its lifecycle.
- The repository now declares a five-minute Vercel recovery cron. Deep remains Preview until the deployed schedule, distinct secret, and due-work recovery behavior are verified, or an approved managed runner replaces it.

## Operational Invariants

- Never enable `LAUNCHLENS_DEEP_ENABLED=1` unless every capability requirement is ready.
- Never treat self-dispatch as the recovery guarantee.
- Never publish raw specialist output into synthesis after adjudication; only eligible claim context may cross that boundary.
- Never delete an active Deep record. Cancel it atomically, then delete terminal live-state if needed.
- Keep worker and cron secrets separate and at least 24 characters.
