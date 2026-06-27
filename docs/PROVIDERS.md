# Configuring Real LLM Providers

LaunchLens Research Studio ships with a deterministic **mock provider** so the product works out of the box with no configuration. To run real market-intelligence research with a live LLM, configure one of the real providers via environment variables.

This document is the single source of truth for provider configuration. The selection rules live in [`src/lib/providers/provider-registry.ts`](../src/lib/providers/provider-registry.ts).

---

## Quick start

1. Copy the template and edit it:

   ```bash
   cp .env.example .env.local
   ```

2. Add **one** API key (and optionally a base URL / model override):

   ```bash
   # .env.local
   ANTHROPIC_API_KEY=sk-ant-...
   # or
   OPENAI_API_KEY=sk-...
   ```

3. Restart the dev server:

   ```bash
   npm run dev
   ```

With a key set and no explicit override, the app uses the real provider automatically. With no key set, it silently falls back to the mock — the demo path is always intact.

---

## Environment variables

| Variable | Purpose | Default |
|----------|---------|---------|
| `LAUNCHLENS_PROVIDER` | Force a provider: `mock` / `openai` / `anthropic`. | _(unset → auto-select)_ |
| `OPENAI_API_KEY` | OpenAI API key. | — |
| `LAUNCHLENS_OPENAI_KEY` | Alias for `OPENAI_API_KEY` (takes precedence if both are set). | — |
| `OPENAI_BASE_URL` | Custom base URL for OpenAI-compatible gateways. | `https://api.openai.com/v1` |
| `OPENAI_MODEL` | Model name. | `gpt-4o-mini` |
| `ANTHROPIC_API_KEY` | Anthropic API key. | — |
| `ANTHROPIC_BASE_URL` | Custom base URL for Anthropic-compatible gateways. | `https://api.anthropic.com` |
| `ANTHROPIC_MODEL` | Model name. | `claude-3-5-sonnet-latest` |

---

## Selection rules

`selectProvider()` in `provider-registry.ts` picks the provider in this priority order:

1. `LAUNCHLENS_PROVIDER=mock` → mock, even if keys are set (useful for demos/CI).
2. `LAUNCHLENS_PROVIDER=openai` + an OpenAI key → OpenAI.
3. `LAUNCHLENS_PROVIDER=anthropic` + an Anthropic key → Anthropic.
4. No override, but an Anthropic key is set → Anthropic.
5. No override, but an OpenAI key is set → OpenAI.
6. Nothing set → mock.

Anthropic is preferred over OpenAI by default because its longer context window suits the synthesis agent, which ingests all five upstream outputs. Set `LAUNCHLENS_PROVIDER=openai` to force OpenAI instead.

---

## How real calls produce structured output

Each provider sends a **schema-aware system prompt** (built by [`agent-prompts.ts`](../src/lib/providers/agent-prompts.ts)) that shows the LLM the exact TypeScript shape it must return — required fields, allowed enum values, and per-agent coaching (e.g. "SAM ≤ TAM", "score every player on every dimension 0–100"). The model's response is then parsed and run through [`output-validator.ts`](../src/lib/providers/output-validator.ts).

If a real call fails — network error, malformed JSON, or validation failure — the provider **falls back to the mock for that agent** so the session still completes. This means a misconfigured key degrades gracefully to demo data rather than crashing, but it also means a bad key can be hard to notice. To verify your real provider is wired up:

- Check the server logs (`npm run dev`) — real provider calls log the model and base URL.
- Set `LAUNCHLENS_PROVIDER=openai` (or `anthropic`) explicitly to bypass the auto-select and confirm the forced path is taken.

---

## OpenAI-compatible gateways

Because the OpenAI adapter targets `{baseUrl}/chat/completions` with a bearer token, it works with any OpenAI-compatible endpoint:

- **Azure OpenAI** — set `OPENAI_BASE_URL` to your deployment endpoint and `OPENAI_MODEL` to the deployment name.
- **Local models** (Ollama, LM Studio, vLLM) — set `OPENAI_BASE_URL=http://localhost:11434/v1` (for Ollama) and any non-empty `OPENAI_API_KEY`.

Note: local models that ignore `response_format: json_object` may still produce fenced output; the adapter strips fences before parsing, but weaker models are more likely to fail validation and fall back to mock.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| Output looks like demo data even with a key set | Validation failing → silent mock fallback | Check server logs; set `LAUNCHLENS_PROVIDER` explicitly; verify the model name. |
| `401 Unauthorized` | Wrong key or base URL | Confirm the key is valid for the configured base URL. |
| `429 Too Many Requests` | Rate limit | The adapter retries 429 with backoff; reduce concurrency or upgrade tier. |
| Research hangs then completes with mock | Network drop mid-stream | The adapter reconnects; if all retries fail it falls back to mock. |

---

## Security

- Provider keys are read **server-side only** (in API routes and the research engine). They are never bundled into the client.
- The mock fallback is a feature for demos, not a security control. In production, set `LAUNCHLENS_PROVIDER` explicitly and monitor for unexpected fallbacks if you require real data.
