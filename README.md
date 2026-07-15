# LaunchLens Research Studio

> Multi-agent market intelligence workspace — companion project to [launchlens-ai](https://github.com/Zhi-Chao-PAN/launchlens-ai)

Input a product idea → 6 specialized AI agents research in parallel → structured market intelligence report, exportable and importable into launchlens-ai.

[🚀 Quick Start](#-quick-start) · [🧠 The Agents](#-the-agents) · [📦 Exports](#-exports) · [🎨 Features](#-features) · [🏗 Architecture](#-architecture) · [🧪 Testing](#-testing) · [🤝 Contributing](CONTRIBUTING.md)

![CI](https://github.com/Zhi-Chao-PAN/launchlens-research-studio/actions/workflows/ci.yml/badge.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue)
![Tests](https://img.shields.io/badge/tests-2%2C200%2B%20passing-brightgreen)
![License](https://img.shields.io/badge/license-MIT-blue)

---

## ✨ Features

### Research Engine
- **6 specialized AI agents** — Market Sizer, Competitor Analyst, Pain Detective, Pricing Scout, Channel Scout, and Synthesis
- **Parallel execution** — 5 research agents run concurrently, then Synthesis validates across outputs
- **Real-time progress** — SSE-powered live updates with per-agent progress bars and step indicators
- **Evidence system** — Every claim has citations, source links, and confidence levels
- **Cross-validated synthesis** — Synthesis agent cross-references findings, scores opportunity and risk
- **Robust error handling** — Per-agent failure isolation, partial results, exponential reconnection

### User Experience
- **🌙 Dark mode** — Light, dark, or system-following themes with persistent preference
- **📚 Past research** — Recent 8 sessions cached locally for restoration
- **🔗 Shareable links** — URL-hash based sharing with native share API on mobile
- **⌨️ Keyboard shortcuts** — `Ctrl/⌘+Enter` to start, `Esc` to reset, `Ctrl/⌘+?` for help
- **🖨️ Print friendly** — Optimized `@media print` CSS for paper / PDF export
- **♿ Accessible** — Focus rings, ARIA labels, reduced-motion support, semantic markup
- **📱 Responsive** — Works on mobile, tablet, and desktop

### Developer Experience
- **🧪 Tested** — More than 2,200 unit and integration tests, plus production-browser E2E coverage
- **🔍 TypeScript strict** — Zero `any` in business logic
- **📦 Rich exports** — Markdown, JSON, CSV, per-agent copy, launchlens-ai brief
- **🎨 Themed** — Indigo/violet gradient system with full dark mode support

---

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Open http://localhost:3000
```

Enter a product idea (or click an example), hit **Start Research**, and watch 6 agents work in real time.

### Other scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server with hot reload |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |
| `npm test` | Run unit tests (Vitest) |
| `npm run test:watch` | Watch mode for tests |
| `npm run test:coverage` | Run tests with coverage |
| `npm run test:ui` | Open Vitest UI in browser |

---

## 🧠 The Agents

| Agent | Icon | Output |
|-------|------|--------|
| Market Sizer | 📊 | TAM/SAM/SOM estimates, growth trends, target segments |
| Competitor Analyst | 🏆 | Competitive landscape, feature matrix, market gaps |
| Pain Detective | 💬 | User pain points, unmet needs, voice-of-customer |
| Pricing Scout | 💰 | Price bands, monetization models, willingness to pay |
| Channel Scout | 🚀 | Acquisition channels, community hubs, content topics |
| Synthesis | 🧠 | Cross-agent validation, exec summary, opportunity & risk scores |

See [`AGENTS.md`](./AGENTS.md) for detailed agent specifications and output schemas.

---

## 📦 Exports

Every report can be exported in multiple formats:

- **Markdown** (`.md`) — Full report with TOC, citations, and confidence badges
- **JSON** (`.json`) — Versioned schema (v1.0.0) with metadata, citation stats, and full structured data
- **CSV** (`.csv`) — Per-domain spreadsheets: market, competitors, pain points, pricing, channels
- **LaunchLens brief** (`.json`) — Structured five-field brief (`idea` / `audience` / `market` / `tone` / `constraints`) derived deterministically from agent outputs, ready to import into launchlens-ai. Available via the **Export LaunchLens brief** button and `GET /api/research/[sessionId]/brief`.
- **Send to LaunchLens AI** (R231) — One-click handoff to [launchlens-ai](https://launchlens-ai-two.vercel.app). Opens launchlens-ai in a new tab with the brief embedded in the URL hash; the launchlens-ai side detects it and pre-fills the brief builder. The local report stays open. URL domain configurable via `NEXT_PUBLIC_LAUNCHLENS_AI_URL`. The `.json` download remains as an offline fallback.
- **Clipboard** — Copy Markdown, JSON, or a launchlens-ai-compatible brief

Each report section also has its own **"Copy section"** button for sharing individual agent findings.

---

## 🎨 Features in Detail

### 🌙 Dark Mode
Click the sun/moon icon in the header to cycle through light → dark → system-following. Your preference is saved in `localStorage`. The dark mode overrides the indigo/slate palette for comfortable night-time reading.

### 📚 Past Research
The 8 most recent research sessions are cached in your browser. Click any entry to re-run with the same query and keywords. The cache survives page refresh and even server restarts (the server is in-memory only).

### 🔗 Share Links
Click the **Share** button in the header to copy a URL like `https://research.launchlens.ai#share:abc123`. Opening this URL automatically restores the session. On mobile, the native share sheet is used.

### ⌨️ Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl/⌘ + Enter` | Start research (from query input) |
| `Esc` | Reset to landing page (from studio) |
| `Ctrl/⌘ + ?` | Show keyboard help |

### 🖨️ Print / PDF
Click **Print / Save as PDF** in the Export panel. The print stylesheet hides chrome, expands collapsed sections, shows URLs after links, and forces single-page-fits.

---

## 🏗 Architecture

```
src/
├── app/                          # Next.js App Router
│   ├── page.tsx                  # Main studio UI
│   ├── layout.tsx                # Root layout + metadata
│   ├── globals.css               # Theme tokens + print styles
│   ├── error.tsx                 # Global error boundary
│   ├── loading.tsx               # Skeleton loader
│   ├── not-found.tsx             # 404 page
│   └── api/research/             # API routes
│       ├── route.ts                   # POST — create session
│       ├── [sessionId]/route.ts       # GET — session state
│       └── [sessionId]/stream/route.ts # SSE event stream
├── components/
│   ├── agents/                   # Agent cards
│   ├── report/                   # Report components
│   │   ├── ReportView.tsx              # Tabbed report container
│   │   ├── ExportActions.tsx           # Export controls
│   │   ├── ShareButton.tsx             # Share link generator
│   │   ├── sections/                   # Per-agent report views
│   │   └── primitives/                 # Shared UI atoms
│   ├── studio/                   # Query + history UI
│   └── ui/                       # ThemeToggle, etc.
└── lib/
    ├── schema/research-schema.ts # Single source of truth for types
    ├── api/validation.ts         # Request validation + error envelope
    ├── research/                 # Engine + client hook
    │   ├── research-engine.ts          # Session lifecycle & orchestration
    │   ├── use-research-studio.ts      # Client hook with reconnection
    │   ├── use-session-bridge.ts       # Cache + share integration
    │   ├── history.ts                  # localStorage history hook
    │   ├── session-cache.ts            # Past research cache
    │   └── share.ts                    # URL-hash share utilities
    ├── export/                   # Output formatters
    │   ├── markdown-formatter.ts        # Full report markdown
    │   ├── json-formatter.ts            # Versioned JSON export
    │   ├── csv-formatter.ts             # Spreadsheet-ready CSVs
    │   └── agent-markdown.ts            # Per-agent snippets
    └── providers/
        ├── mock-provider.ts           # Deterministic demo outputs
        ├── mock-provider-adapter.ts   # Provider interface over mock
        ├── provider-registry.ts       # Selects provider from env (mock/openai/anthropic)
        ├── agent-prompts.ts           # Schema-aware system/user prompts for real LLMs
        ├── output-validator.ts        # Validates LLM JSON against agent schemas
        ├── openai-provider.ts         # OpenAI / OpenAI-compatible adapter
        └── anthropic-provider.ts      # Anthropic Messages API adapter
```

See [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) for the full architecture document.

---

## 🛠 Tech Stack

- **Framework**: Next.js 16 (App Router, Turbopack)
- **Language**: TypeScript (strict mode)
- **Styling**: Tailwind CSS v4 with CSS variables for theming
- **Realtime**: Server-Sent Events (SSE) with auto-reconnect
- **State**: React 19 hooks + in-memory engine
- **Testing**: Vitest 4 + jsdom
- **CI**: GitHub Actions (lint, typecheck, test, build, smoke)

---

## ☁️ Deploy to Vercel

Production journey measurement is documented in
[`docs/ANALYTICS.md`](./docs/ANALYTICS.md). It combines Vercel page views with
privacy-minimized, server-confirmed Redis funnel milestones.

A `vercel.json` ships with this repo: the `/api/research/[sessionId]/stream` observer route is configured for `maxDuration=300s`, while durable Deep work executes one bounded unit per worker invocation. Production Deep additionally needs one independent scheduler that POSTs to `/api/cron/scheduler` at an observed cadence of five minutes or less. The checked-in GitHub workflow is intentionally manual-only and is an emergency trigger, not cadence evidence.

**One-time setup**

1. In Vercel, **Import Project** → pick this GitHub repo. Vercel auto-detects Next.js; the included `vercel.json` will be picked up without further config.
2. Configure environment variables (Project Settings → Environment Variables). At minimum:

   | Variable | Why |
   |----------|-----|
   | `OPENAI_API_KEY` *(or* `ANTHROPIC_API_KEY`*)* | Legacy single-key provider configuration. For the managed three-key path, enable the keyring and add keys from `/admin` instead. |
   | `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` *(or the `KV_REST_API_*` pair)* | Production persistence for the managed key vault, Standard run mirrors, and authoritative Deep state. Both values in one pair are required. |
   | `LAUNCHLENS_ADMIN_TOKENS` | Bootstraps access to `/admin`. Use long, rotatable server-side tokens; never place them in URLs or browser storage. |
   | `LAUNCHLENS_PROVIDER_KEYRING_*` | Enables the Redis-backed three-slot provider vault and declares its single runtime provider. `/admin` treats that provider as read-only; slots are tried strictly 1 → 2 → 3 and legacy env keys are not a hidden fourth key. |
   | `LAUNCHLENS_PROVIDER_KEY_ENCRYPTION_SECRET` | Canonical Base64 encoding of exactly 32 random bytes used for AES-256-GCM encryption. Generate with `openssl rand -base64 32`. |
   | `LAUNCHLENS_ADMIN_SESSION_SECRET` | Signs short-lived HttpOnly administrator sessions. Use a distinct secret of at least 32 random bytes. |
   | `CRON_SECRET` | Authenticates `POST /api/cron/scheduler`. Configure the same value in the one external scheduler selected for production. Generate with `openssl rand -hex 32`. |
   | `TAVILY_API_KEY` *(optional for Standard; required for Deep)* | Enables Tavily-backed retrieval. Deep fails closed rather than falling back to mock retrieval. |
   | `LAUNCHLENS_DEEP_*` | Deep opt-in, authenticated worker wake, and recovery declarations. See [`.env.example`](./.env.example) and [ADR-001](./docs/decisions/ADR-001-durable-deep-research.md). |

   A complete reference for every `LAUNCHLENS_*` variable lives in [`.env.example`](./.env.example).
   For a protected Preview deployment, enable Vercel **Protection Bypass for Automation**. Vercel injects `VERCEL_AUTOMATION_BYPASS_SECRET`; the Deep dispatcher sends it only as a request header. Preview defaults to its own `VERCEL_URL`, while `VERCEL_PROJECT_PRODUCTION_URL` is preferred only in Production. Set `LAUNCHLENS_DEEP_WORKER_BASE_URL` when an explicit worker origin is required.
3. Deploy, configure exactly one independent recovery scheduler at a cadence of at most 300 seconds, and let it accumulate a real chronological heartbeat history. Vercel will run `next build` (the project pins `engines.node = "24.x"` in `package.json`) and expose the production URL. The manual GitHub workflow can be given `LAUNCHLENS_CRON_SECRET` for emergency operation but must not be described as the production clock.

**Post-deploy verification checklist**

- `curl https://<your-url>/api/health` returns ok.
- From the studio UI, start a **mock** research run; confirm SSE delivers every `agent-output` and a terminal `complete` event.
- With a real provider key, start a live research run and verify the report records real provider provenance rather than mock/degraded fallback. A disconnected observer can reconnect without owning or restarting durable Deep work.
- Tail Vercel logs while a run is in flight; check whether multiple function instances are involved (each cold start = a new module-level session map).

**Known serverless constraints**

- **The local session map is a fast path, not production authority.** Standard sessions are reconciled through Redis mirrors. Deep lifecycle, leases, revisions, fencing, and due work are authoritative in `DeepRunRecordV1`.
- **Disk writes remain local-only.** `LAUNCHLENS_STORAGE_DIR` is useful for local development; production History is mirrored into the Redis-backed run store.
- **Standard is still request-bound.** Its SSE route has a 300-second ceiling. Deep avoids this limit by executing one durable work unit per worker invocation; SSE and polling only observe Redis state.
- **In-process timers are not recovery.** Authenticated self-dispatch is a fast wake only. Deep additionally requires an independently scheduled recovery trigger with a declared delay of at most 300 seconds.

**Deep production gate**

`GET /api/research/capabilities` checks eight Deep requirements: explicit opt-in, reachable Redis, a real generation provider, real retrieval, a strict semantic reviewer, authenticated worker wake, declared independent recovery, and a fresh multi-tick recovery cadence. With the managed keyring enabled, the model gates also verify that at least one enabled credential can actually be decrypted. The UI and `POST /api/research` keep Deep in Preview until every requirement passes.

See [the current Deep specification](./docs/SPEC-ui-and-deep-research.md) and [ADR-001](./docs/decisions/ADR-001-durable-deep-research.md) for the protocol and deployment contract.

---

## 🔌 Real LLM Providers

The app runs on a deterministic **mock provider** by default, so the demo works with zero configuration. To run real research with a live LLM, add an API key to `.env.local`:

```bash
cp .env.example .env.local
# then edit .env.local — set ANTHROPIC_API_KEY or OPENAI_API_KEY
npm run dev
```

With a legacy env key set, [`provider-registry.ts`](./src/lib/providers/provider-registry.ts) auto-selects the real provider (Anthropic preferred, then OpenAI, then mock). Set `LAUNCHLENS_PROVIDER` to force a specific one. For production, the admin vault can instead hold three encrypted keys for the provider declared by `LAUNCHLENS_PROVIDER_KEYRING_PROVIDER`. That deployment setting is the runtime authority and is read-only in `/admin`, preventing a stored key from silently targeting a different adapter. Retryable upstream, quota, authentication, and rate-limit failures advance from slot 1 to 2 to 3; schema/configuration errors stop without burning another key. Standard may perform one explicit mock fallback after all slots fail, while Deep and semantic review fail closed.

The administrator console lives at `/admin`. An admin-scoped token is exchanged once for a signed HttpOnly browser session; the plaintext token is not stored by the console. The console supports English and Simplified Chinese, operational telemetry, audit exports, access-token management, and write-only provider-key configuration.

See [`docs/PROVIDERS.md`](./docs/PROVIDERS.md) for the full configuration guide, gateway setup, and troubleshooting.

---

## 📋 Data Flow

```
User enters query → POST /api/research → sessionId returned
                                 ↓
                  Client opens SSE /api/research/{id}/stream
                                 ↓
                  Engine starts 5 research agents in parallel
                                 ↓
        Each agent reports progress via events to client
                                 ↓
                  Synthesis agent cross-validates and emits final output
                                 ↓
                          "complete" event → SSE closes
                                 ↓
              Client caches session snapshot to localStorage
                                 ↓
            User can view, export, share, or restore later
```

---

## 🧪 Testing

A Vitest suite of more than 2,200 tests covers provider failover, Deep evidence boundaries, recovery, API security, exports, and UI behavior:

```bash
npm test                  # One-shot run
npm run test:watch        # Interactive
npm run test:coverage     # With coverage report
npm run test:ui           # Browser UI
```

### End-to-end smoke test

```bash
npm run build
SMOKE_TEST_PORT=3010 node scripts/smoke-test.js
node e2e/admin-ui-e2e.js      # bilingual admin, secure session, 3-key flow, responsive UI
```

The script starts the production server, then validates:
- Input validation on `POST /api/research` (rejects empty/short/oversized/malformed input)
- Session creation and retrieval
- 404 / 400 responses for bad session ids
- SSE event stream (state, progress, output, status, complete events)
- End-to-end research completion

This same script is run in CI on every push.

---

## 🤝 Related Projects

- **[launchlens-ai](https://github.com/Zhi-Chao-PAN/launchlens-ai)** — GTM strategy tool (parent project)
- Export a structured **LaunchLens brief** (`launchlens-brief-*.json`) from Research Studio's Export panel → import it into launchlens-ai to generate a full GTM workspace (target users, MVP scope, backlog, pricing, launch plan). The brief's five fields map deterministically from the six agents' outputs; each field is clamped to launchlens-ai's 1200-character limit.

---

## 📄 License

MIT License — feel free to use and build on this.

---

Built with care as a companion to launchlens-ai · Zhi-Chao PAN
