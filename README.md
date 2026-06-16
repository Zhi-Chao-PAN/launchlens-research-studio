# LaunchLens Research Studio

> Multi-agent market intelligence workspace — companion project to [launchlens-ai](https://github.com/Zhi-Chao-PAN/launchlens-ai)

Input a product idea → 6 specialized AI agents research in parallel → structured market intelligence report, exportable and importable into launchlens-ai.

---

## ✨ Features

- **6 Research Agents** — Market Sizer, Competitor Analyst, Pain Detective, Pricing Scout, Channel Scout, and Synthesis
- **Parallel Execution** — 5 research agents run simultaneously, then synthesis validates across outputs
- **Real-time Progress** — SSE-powered live updates with per-agent progress bars and step indicators
- **Evidence System** — Every claim has citations, source links, and confidence levels
- **Mock-first Design** — Works out of the box without API keys. Plug in real LLM + search providers when ready
- **Exportable Results** — Download as Markdown, JSON, or copy a launchlens-ai-compatible brief
- **SaaS-quality UI** — Indigo/violet gradient theme, clean layouts, responsive design

---

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Open http://localhost:3000
```

Enter a product idea (or click an example), hit **Start Research**, and watch the agents work in real time.

---

## 🧠 The Agents

| Agent | Icon | What it researches |
|-------|------|-------------------|
| Market Sizer | 📊 | TAM/SAM/SOM estimates, growth trends, target segments |
| Competitor Analyst | 🏆 | Competitive landscape, feature matrix, market gaps |
| Pain Detective | 💬 | User pain points, unmet needs, voice-of-customer quotes |
| Pricing Scout | 💰 | Price bands, monetization models, willingness to pay |
| Channel Scout | 🚀 | Acquisition channels, community hubs, content topics |
| Synthesis | 🧠 | Cross-agent validation, exec summary, opportunity & risk scores |

See [`AGENTS.md`](./AGENTS.md) for detailed agent specifications.

---

## 🏗 Architecture

```
src/
├── app/                     # Next.js App Router
│   ├── page.tsx             # Main studio UI
│   ├── layout.tsx           # Root layout + metadata
│   ├── globals.css          # Global styles + Tailwind theme
│   └── api/research/        # API routes
│       ├── route.ts              # POST — create session
│       ├── [sessionId]/route.ts  # GET — session state
│       └── [sessionId]/stream/route.ts  # SSE event stream
├── components/
│   ├── agents/              # Agent cards, status displays
│   ├── studio/              # Query input, controls
│   └── report/              # Report viewer + 6 section components
├── lib/
│   ├── schema/              # TypeScript types (single source of truth)
│   ├── research/            # Engine + client hook
│   └── providers/           # Mock provider (extend with real APIs)
```

See [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) for the full architecture overview.

---

## 🛠 Tech Stack

- **Framework**: Next.js 16 (App Router, Turbopack)
- **Language**: TypeScript
- **Styling**: Tailwind CSS v4
- **Realtime**: Server-Sent Events (SSE)
- **State**: React hooks + in-memory engine

---

## 📋 Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Build for production |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |

---

## 🔌 Extending with Real Providers

The mock provider (`src/lib/providers/mock-provider.ts`) generates deterministic demo data. To use real LLMs and search:

1. Create a new provider in `src/lib/providers/`
2. Implement the same `generateMockAgentOutput` interface
3. Swap the import in `src/lib/research/research-engine.ts`
4. Add API keys via `.env.local`

---

## 🤝 Related Projects

- **[launchlens-ai](https://github.com/Zhi-Chao-PAN/launchlens-ai)** — GTM strategy tool (parent project)
- Export a `launchlensBrief` from Research Studio → import into launchlens-ai for GTM strategy generation

---



---

## 🧪 Testing

A built-in smoke test exercises the full API:

`ash
npm run build
SMOKE_TEST_PORT=3010 node scripts/smoke-test.js
`

The script starts the production server, then validates:
- Input validation on POST /api/research (rejects empty/short/oversized/malformed input)
- Session creation and retrieval
- 404 / 400 responses for bad session ids
- SSE event stream (state, progress, output, status, complete events)
- End-to-end research completion


## 📝 License

MIT License — feel free to use and build on this.

---

Built as a companion to launchlens-ai · Zhi-Chao PAN

