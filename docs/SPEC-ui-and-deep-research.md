# Spec: Premium Research Workspace and Deep Research

Status: implementation complete; production Deep launch remains capability-gated
Owner: LaunchLens Research Studio
Last updated: 2026-07-13
Decision record: [ADR-001](./decisions/ADR-001-durable-deep-research.md)

## Outcome

LaunchLens Research Studio now has two honest research products:

- **Standard**: a focused 5+1 exploratory scan targeting 3–5 minutes.
- **Deep Research**: a durable ten-unit protocol targeting 10–20 minutes, with mandatory real retrieval, three ordered semantic review passes, evidence-constrained synthesis, and resumable progress.

The premium workspace and Deep implementation exist in code. Deep remains **Preview** in an environment until its runtime capability probe verifies every production dependency. This repository does not silently convert a missing production dependency into mock or shallow output.

## Product Principles

1. Build a decision dossier, not a generic AI summary.
2. Keep all five specialist perspectives directly inspectable.
3. Separate structural citation integrity, semantic entailment review, and factual truth claims.
4. Make the browser an observer of long work, never its owner.
5. Fail closed when Deep loses real providers, retrieval, reviewer, durable state, or recovery.
6. Preserve Standard mode and mock-provider local development.

## Experience Requirements

### Workspace

- Use a dense editorial research workspace rather than a marketing landing page.
- Keep run scope, mode, runtime, rigor, evidence status, and recent work visible on the first screen.
- Avoid decorative card grids, heavy gradients, excessive rounding, and color-only status.
- Preserve keyboard operation, logical headings, visible focus, dark mode, and layouts at 320, 768, 1024, and 1440 px.

### Mode Selection

- Show Standard and Deep side by side with runtime and validation depth.
- Read Deep availability from `GET /api/research/capabilities`; never rely only on a compile-time label.
- When Deep is Preview, show the number of ready production controls and the first blocker.
- When a Deep run is active, show committed progress across its fixed ten-unit work graph.
- A historical dossier that executed the V2 three-pass protocol must be described by its recorded protocol, even if the current environment cannot start a new Deep run.

## Deep Research Protocol

The work graph is fixed and ordered:

1. Pricing specialist.
2. Channel specialist.
3. Pain specialist.
4. Competitor specialist.
5. Market sizing specialist.
6. Claim-to-source entailment review.
7. Independent corroboration and conflict review.
8. Adjudication.
9. Evidence-constrained synthesis.
10. Final integrity gate.

Each worker wake claims at most one unit. Every unit has bounded attempts. A successful unit is committed through revision, lease, and fencing checks before another wake is requested.

### Specialist Contract

- Real generation provider only; model fallback is forbidden.
- Real Tavily retrieval only; mock retrieval is forbidden.
- At least three retrieved sources per specialist stage.
- Citations are filtered against the trusted retrieval allowlist.
- Provider identity is locked for the whole run.
- Each stage executes against an isolated session snapshot and cannot publish before the fenced commit.

### Semantic Review Contract

The V2 validation ledger extracts a bounded set of decision-critical claims and runs:

1. `claim_source_entailment`
2. `independent_corroboration_conflict`
3. `adjudication`

Review responses use strict structured JSON, caller-owned runtime validation, claim/source ID allowlists, complete claim coverage, and bounded retries. Pass 2 performs fresh retrieval rather than reusing only the drafting sources.

The ledger is explicit that factual accuracy is `not_established`. Semantic review can support, partially support, conflict, or exclude a claim; it is not a guarantee that the world is true.

#### Deterministic Adjudication

Pass 3 (`adjudication`) is not free-form model output. The application owns a pure decision table (`deep-adjudication-policy.ts`) that derives the authoritative disposition, supporting/contradicting source IDs, reviewed passes, and maximum confidence from the two bounded review passes. The model may add prose limitations or lower confidence, but it cannot change the disposition or attach different evidence. The ledger guard (`isValidationLedgerV2`) recomputes this derivation on load and rejects any persisted ledger whose adjudications disagree with the decision table, so identical pass results cannot drift across retries.

#### Source-to-Claim Binding

Independent retrieval sources (origin `independent_retrieval`) must declare which claim(s) they support via a `claimIds` field. The corroboration pass may only cite sources whose `claimIds` include the claim under review and whose `agent` matches the claim's `agentId`. This prevents a single expert's independent sources from being cross-applied to unrelated claims -- the root cause of the first dogfood round's 1/24 acceptance rate.

### Synthesis Boundary

Deep synthesis receives only eligible adjudicated claims and their trusted supporting sources. Raw specialist outputs are intentionally excluded from the synthesis prompt after review, preventing rejected or conflicted claims from re-entering through a side channel.

Synthesis output citations are canonicalized back to trusted source objects. A provider fallback, invented source ID, incomplete V2 ledger, or degraded/mock provenance fails the stage.

### Export Boundary (Fail-Closed Brief)

The LaunchLens brief mapper (`brief-mapper.ts`) is the sole producer of importable briefs. When a Deep session lacks a completed V2 validation ledger (missing, V1, or incomplete), the mapper **fail-closes**: it emits a minimal brief preserving the founder's query and flagging that no evidence has been established. It never falls through to the Standard branch, which would export unverified TAM, pricing, pain points, and synthesis scores.

Even with a V2 ledger, synthesis prose (execSummary, recommendedNextStep) and score metadata only enter the brief when `hasSufficientDeepBriefEvidence` returns true (≥3 fully-supported claims from ≥2 agents). Otherwise the brief is constrained to evidence-backed claim text and neutral copy.

The raw `launchlensBrief` field in the synthesis output is not importable. The report page's brief section directs users to the Export panel, which runs the validation-aware mapper. Markdown and text exports do not embed the raw brief.

## Durable Execution

`DeepRunRecordV1` in Redis is the authority for:

- lifecycle and terminal precedence;
- current work index and attempts;
- next due time;
- execution provider profile;
- public `ResearchSession` projection;
- lease, revision, and fencing semantics.

Fast authenticated HTTP wake-up reduces latency. It is not the durability guarantee. The Redis due index and an independently scheduled recovery trigger provide recovery after a failed wake or interrupted invocation.

SSE and polling are observer-only for Deep. Connecting to `/stream` never starts Standard or Deep execution.

## Capability Gate

Deep is `available` only when all seven requirements are ready:

1. `LAUNCHLENS_DEEP_ENABLED=1` explicit operator opt-in.
2. Reachable Upstash Redis authority.
3. Real generation provider.
4. Real Tavily retrieval provider.
5. Real strict structured-completion reviewer.
6. Authenticated worker origin and a dedicated secret of at least 24 characters.
7. Independent cron recovery declared at no more than 300 seconds, with a separate cron secret of at least 24 characters.

If any check fails, the API and UI keep Deep in Preview and `POST /api/research` refuses to start it.

Current repository state: the code path is implemented, `.github/workflows/deep-recovery.yml` declares five-minute independent recovery, and `vercel.json` declares a daily Vercel Hobby fallback. Deep remains capability-gated until the primary workflow and every other dependency are verified in the deployed environment.

## Persistence and Lifecycle

- The terminal Deep record is committed before History persistence runs.
- History materialization is derived and idempotent; repeated reconciliation upserts by run ID.
- Duration comes from terminal session timestamps, not the later reconciliation time.
- Completed, cancelled, and failed Deep dossiers retain specialist outputs, evidence, validation, provider provenance, and synthesis.
- Cancellation is atomic and wins over a stale in-flight commit.
- Active Deep live-state cannot be deleted. It must be cancelled first.
- Deleting terminal live-state preserves the materialized History dossier.

## Public API Contract

- `GET /api/research/capabilities`: server-authoritative Standard/Deep availability and Deep requirement detail.
- `POST /api/research`: creates Standard execution or a durable Deep record after the capability gate passes.
- `GET /api/research/[sessionId]`: returns the public session projection and optional `deepRun` progress.
- `GET /api/research/[sessionId]/stream`: event stream for Standard and observer snapshots for Deep.
- `POST /api/research/[sessionId]/cancel`: atomic cancellation, including Deep terminal precedence.
- `DELETE /api/research/[sessionId]`: refuses active Deep work; terminal Deep deletion preserves History.
- `POST /api/internal/deep-research/continue`: authenticated worker wake that responds before executing one unit via `after()`.
- `/api/cron/scheduler`: scans and wakes due Deep work when Deep recovery is configured.

## Non-Goals

- Replacing the 5+1 domain model.
- Claiming source-grounded or factually verified output when the corresponding checks did not execute.
- Adding user accounts, billing, a managed queue, or a new paid provider in this iteration.
- Treating the current single-tenant/internal-preview report routes as an authorization boundary.

## Approval Boundaries

Ask the owner before:

- changing the accepted five-minute recovery contract or other project settings;
- adding Vercel Queues, Workflow, or another queue/service;
- adding dependencies or paid providers;
- adding authentication or multi-tenant ownership.

## Verification Contract

Before release:

- TypeScript strict check passes.
- Lint passes without new warnings.
- Full Vitest suite passes.
- Production build passes.
- Deep repository/service/semantic/synthesis/capability/API tests pass.
- Browser checks cover Standard, Deep Preview readiness, active progress, completed dossier, console, keyboard, and 320/768/1024/1440 layouts.

## Production Recovery Verification

Verify one recovery path before enabling Deep:

1. **Current path:** configure the GitHub repository secret `LAUNCHLENS_CRON_SECRET`, enable the declared five-minute workflow, set `LAUNCHLENS_DEEP_RECOVERY_MAX_DELAY_SECONDS=300`, and verify authenticated recovery against the production due index. Keep the daily Vercel cron as a secondary platform fallback.
2. **Future alternative:** approve a managed queue/workflow service and migrate the dispatcher/recovery adapter while keeping the Redis record and semantic protocol contracts.
