# Architecture

This document describes the technical architecture of LaunchLens Research Studio in detail.

---

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              Client (Browser)                            │
│  ┌──────────────┐  ┌──────────────────┐  ┌─────────────────────────┐   │
│  │  Studio UI   │  │  useResearchStudio │  │     SSE Stream          │   │
│  │  (React)     │◄─┤   (React Hook)    │◄─┤  (EventSource)          │   │
│  └──────────────┘  └──────────────────┘  └─────────────────────────┘   │
└─────────────────────────────────────┬───────────────────────────────────┘
                                      │
                                      │ HTTP + SSE
                                      ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           Next.js Server                                 │
│  ┌───────────────┐  ┌───────────────┐  ┌──────────────────────────┐    │
│  │ POST /research│  │ GET /research/│  │ GET /research/[id]/stream│    │
│  │  (create)     │  │  [id] (state) │  │    (SSE events)          │    │
│  └───────┬───────┘  └───────┬───────┘  └────────────┬─────────────┘    │
│          └──────────────────┼────────────────────────┘                  │
│                             ▼                                           │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                    Research Engine (in-memory)                    │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌────────────────────────┐  │   │
│  │  │ Session Store│  │Agent Orchestr-│  │   Event Emitter        │  │   │
│  │  │  (Map)       │  │    ation     │  │   (event listeners)    │  │   │
│  │  └──────────────┘  └──────┬───────┘  └────────────────────────┘  │   │
│  │                            │                                      │   │
│  │                            ▼                                      │   │
│  │  ┌──────────────────────────────────────────────────────────────┐ │   │
│  │  │                    Mock Provider                             │ │   │
│  │  │  (swapable with real LLM + search providers)                 │ │   │
│  │  └──────────────────────────────────────────────────────────────┘ │   │
│  └──────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Core Systems

### 1. Schema Layer (`src/lib/schema/research-schema.ts`)

The single source of truth for all types in the system. Everything — engine, API, UI — derives from these types.

**Key Types:**
- `AgentId` — Union of 6 agent IDs
- `AgentOutput` — Discriminated union of all agent output schemas
- `ResearchSession` — Complete session state
- `ResearchEvent` — Event types for SSE streaming
- `SourceCitation` — Evidence/citation system

**Design Principle**: The schema file is dependency-free and can be imported by any layer.

### 2. Research Engine (`src/lib/research/research-engine.ts`)

The heart of the application. Manages session lifecycle, agent orchestration, and event emission.

**Key Concepts:**

- **In-memory store**: Sessions stored in a `Map<string, ResearchSession>`. In production, swap for Redis/DB.
- **Event emitters**: Each session can have one listener (for SSE).
- **Parallel execution**: 5 research agents run concurrently via `Promise.all()`.
- **Sequential synthesis**: Synthesis runs after all research agents complete, with full access to their outputs.

**Key Functions:**
- `createResearchSession(query, keywords)` — Initialize a new session
- `runResearchSession(sessionId)` — Start agent execution pipeline
- `getResearchSession(sessionId)` — Get current state snapshot
- `subscribeToSession(sessionId, listener)` — Subscribe to real-time events

### 3. API Routes

#### `POST /api/research`
Creates a new research session and starts execution. Returns immediately with `sessionId` (fire-and-forget pattern). The client then connects to the SSE stream for updates.

#### `GET /api/research/[sessionId]`
Returns the full current state of a session. Used for hydration after SSE disconnect, or for non-realtime clients.

#### `GET /api/research/[sessionId]/stream`
SSE event stream. Emits:
- `agent-progress` — Step change + progress %
- `agent-output` — Agent completed, full output payload
- `complete` — All agents finished
- `state` — Periodic full state snapshots

### 4. Client Hook (`src/lib/research/use-research-studio.ts`)

React hook that manages the full client-side lifecycle:
- Creates sessions via POST
- Connects to SSE stream for realtime updates
- Maintains local state mirroring the server
- Handles reconnection and error recovery
- Provides `startResearch`, `reset`, `setActiveAgentTab` actions

### 5. Provider Layer (`src/lib/providers/`)

Abstracts the actual research execution. Currently ships with `mock-provider.ts` that generates realistic demo data.

**Design for extension:**
- Providers follow a common interface: `generateAgentOutput(agentId, query, keywords, previousOutputs)`
- Real providers would call LLM APIs + search tools
- Swap providers by changing the import in `research-engine.ts`

---

## Data Flow

### Full Research Session Lifecycle

```
1. User enters query → clicks "Start Research"
      ↓
2. Client POST /api/research → receives sessionId
      ↓
3. Client opens SSE stream to /api/research/[id]/stream
      ↓
4. Server creates session → starts runResearchSession()
      ↓
5. Engine starts 5 research agents in parallel
   ├─ Each agent reports progress via events
   ├─ Each agent emits output when done
   └─ Progress events flow through SSE to client
      ↓
6. When all 5 research agents done → Synthesis agent starts
   ├─ Reads all 5 outputs
   ├─ Cross-validates findings
   └─ Emits final synthesis output
      ↓
7. Engine emits "complete" event → SSE closes
      ↓
8. Client fetches full session state for any missed data
      ↓
9. User can view report, export, or start new research
```

---

## UI Architecture

### Component Tree

```
page.tsx (Home)
├── Header (logo + "New Research" button)
├── QueryInput (form with textarea + keywords + examples)
├── Agent Sidebar
│   └── AgentCard × 6 (status, progress bar, current step)
├── ReportView (tab panel)
│   ├── MarketSizerReport
│   ├── CompetitorAnalystReport
│   ├── PainDetectiveReport
│   ├── PricingScoutReport
│   ├── ChannelScoutReport
│   └── SynthesisReport
└── ExportActions (MD export, JSON export, copy brief)
```

### Design System

- **Theme**: Indigo/violet gradient primary, slate neutrals
- **Radius**: Consistent `rounded-2xl` for cards, `rounded-xl` for buttons
- **Spacing**: Tailwind default scale, generous padding for SaaS feel
- **Typography**: Geist Sans (variable) for body, bold for headings
- **Motion**: Subtle transitions, no heavy animations — research is serious business

---

## State Management Philosophy

**Server is the source of truth.** The client state is always a projection of the server session. This means:
- No client-side "business logic" for research
- Client state is rebuilt from server on reconnect
- SSE is a transport optimization, not the only source

This architecture makes it trivial to add persistence later — just swap the in-memory store for a database.

---

## Extensibility Points

### Adding a New Research Agent

1. Add to `AgentId` union in schema
2. Define output schema
3. Add to `AGENT_METADATA`
4. Implement in mock provider (and real providers)
5. Add to `RESEARCH_AGENTS` array (if it runs in the parallel phase)
6. Create report section component
7. Add tab to ReportView

### Adding a Real Provider

1. Create `src/lib/providers/<name>-provider.ts`
2. Implement `generateAgentOutput(agentId, query, keywords, existingOutputs): AgentOutput`
3. Import and use in `research-engine.ts` instead of mock
4. Add environment variable for API keys

---

## Performance Considerations

- **SSE vs WebSocket**: SSE chosen for simplicity + native browser support + unidirectional flow (server → client is all we need)
- **In-memory sessions**: Fast for demo, but not horizontally scalable. Add Redis for production.
- **Parallel agents**: Max throughput via `Promise.all()`. Each agent is independent during the research phase.
- **Bundle size**: Only Next.js + React + Tailwind. No heavy UI libraries.

---

## Security Notes (for production deployment)

- Rate limit session creation
- Validate/sanitize query input
- Add session ownership/auth
- Don't expose internal agent state directly without auth
- Add CORS restrictions for API endpoints

