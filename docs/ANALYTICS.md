# Product analytics

Research Studio uses two deliberately separate analytics layers:

- `@vercel/analytics` supplies aggregate page-view data after Web Analytics is
  enabled for the Vercel project.
- A Redis-backed product funnel counts distinct research journeys through the
  server-confirmed milestones `research_started`, `research_completed`, and
  `brief_exported`.

The funnel never stores research prompts, report text, citations, provider
payloads, or the original session ID. Each event set contains only a SHA-256
digest of the high-entropy session ID and its timestamp. Redis keeps at most
90 days of these aggregate journey markers.

Read the aggregate funnel with:

```text
GET /api/analytics/funnel?days=30
```

The response reports `started`, `completed`, and `handoff` journey counts plus
completion and handoff rates. The window is clamped to 1–90 days. If Redis is
not configured, the endpoint returns `configured: false` and zero counts;
analytics failures never fail a research run or brief export.

Vercel Web Analytics must also be enabled in the project dashboard before
page views appear. Custom Vercel events are intentionally not required, so
the core funnel remains available on plans where custom events are unavailable.
