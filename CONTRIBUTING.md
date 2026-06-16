# Contributing to LaunchLens Research Studio

Thanks for your interest in contributing! This document covers the development workflow, code conventions, and how to submit changes.

---

## 🛠 Development Setup

### Prerequisites

- Node.js 20+ (project tested on 20.x and 22.x)
- npm 10+ (or pnpm 9+ / yarn 4+ — examples use npm)
- Git

### First-time setup

```bash
git clone https://github.com/Zhi-Chao-PAN/launchlens-research-studio.git
cd launchlens-research-studio
npm install
npm run dev
```

Open http://localhost:3000 to see the studio.

### Verify your environment

```bash
npm run lint        # ESLint
npx tsc --noEmit    # TypeScript
npm test            # Vitest
```

All three should pass before submitting a PR.

---

## 📂 Project Structure

```
src/
├── app/              Next.js App Router (pages, layouts, API routes)
├── components/       React components
│   ├── agents/       Agent status cards
│   ├── report/       Report viewer + section components
│   ├── studio/       Query input + history
│   └── ui/           Generic UI primitives
├── lib/              Business logic
│   ├── api/          API validation
│   ├── export/       Output formatters
│   ├── providers/    Research providers (currently mock)
│   ├── research/     Engine + client hooks
│   └── schema/       TypeScript types (single source of truth)
└── ...
```

The single most important file is **`src/lib/schema/research-schema.ts`** — it defines every type used across the app. Always start there when adding a feature.

---

## ✏️ Coding Conventions

### TypeScript

- Strict mode is on. Don't use `any` to silence errors — fix the types.
- Prefer `interface` for object shapes, `type` for unions and utilities.
- All public exports must have JSDoc comments for non-trivial types.
- Use the schema types from `@/lib/schema/research-schema` — don't redefine.

### React Components

- Use function components with hooks.
- All components are server components by default; mark `"use client"` only when needed (state, effects, browser APIs).
- Component file names: `PascalCase.tsx`. Hooks: `use-kebab-case.ts`.
- Prefer composition over prop drilling. Use the schema's discriminated union to type agent outputs.

### Styling

- Use Tailwind v4 utility classes. Avoid `@apply` unless necessary.
- Use CSS variables from `globals.css` for theme colors (e.g. `bg-card`, `text-foreground`).
- All new components should support dark mode (`[data-theme="dark"]` overrides already in globals.css).
- Don't add `inline styles` unless computed dynamically.

### Code style

- 2-space indentation
- Semicolons required
- Single quotes for strings
- Run `npm run lint` to auto-fix style issues

### File headers

- Every file should start with a one-line comment describing its purpose.
- Use the format: `// <ComponentName> — <one-line description>`

---

## 🧪 Testing

### When to write tests

Add tests for any new code in:
- `src/lib/api/*` — Validation logic
- `src/lib/export/*` — Output formatters
- `src/lib/research/*` — Engine + hooks (utility functions only)

Component and hook tests are welcome but not required.

### Writing tests

```typescript
import { describe, it, expect } from "vitest";
import { myFunction } from "@/lib/my-module";

describe("myFunction", () => {
  it("handles valid input", () => {
    expect(myFunction("input")).toBe("expected");
  });

  it("rejects invalid input", () => {
    expect(() => myFunction(null)).toThrow();
  });
});
```

For browser-dependent code (hooks, components), use `// @vitest-environment jsdom` at the top of the test file or configure in `vitest.config.ts`.

### Running tests

```bash
npm test                  # Single run
npm run test:watch        # Watch mode
npm run test:coverage     # Coverage report (./coverage/)
npm run test:ui           # Browser UI
```

---

## 🏗 Adding a New Research Agent

1. **Define the output schema** in `src/lib/schema/research-schema.ts`:
   ```typescript
   export interface MyAgentOutput {
     agent: "my-agent";
     summary: string;
     // ...your fields
     citations: SourceCitation[];
   }
   ```

2. **Add to `AgentId` union** and `AGENT_METADATA` in the same file.

3. **Add to `RESEARCH_AGENTS` array** (if it runs in the parallel phase) or leave it for the synthesis step.

4. **Implement the agent** in `src/lib/providers/mock-provider.ts`:
   ```typescript
   export function generateMockMyAgent(query: string, keywords: string[]): MyAgentOutput {
     // ...deterministic mock
   }
   ```

5. **Add to the dispatch table** in `generateMockAgentOutput`.

6. **Create a report section component** at `src/components/report/sections/MyAgentReport.tsx`. Use the shared primitives from `src/components/report/primitives/` for consistency.

7. **Wire it up** in `src/components/report/ReportView.tsx` (the switch statement).

8. **Add formatters** for Markdown (`markdown-formatter.ts`), JSON (`json-formatter.ts`), and CSV (`csv-formatter.ts`).

9. **Add tests** for any new pure functions.

10. **Verify** with `npm run build` and `npm test`.

---

## 🔌 Adding a Real Provider

To replace the mock provider with a real LLM + search backend:

1. Create `src/lib/providers/your-provider.ts` implementing the same interface as `mock-provider.ts`.
2. Make it a drop-in replacement (same function signatures, same return types).
3. Add environment variables to `.env.example`:
   ```
   # .env.example
   LLM_API_KEY=your-key-here
   SEARCH_API_KEY=your-key-here
   ```
4. Update the engine to use the new provider based on an env flag.
5. Add rate limiting and error handling specific to your provider.
6. Document the integration in the relevant section of `README.md`.

---

## 🎨 Adding a New UI Primitive

If you create a reusable component used across multiple sections:

1. Place it in `src/components/report/primitives/` (or `src/components/ui/` for non-report primitives).
2. Use the theme CSS variables (`bg-card`, `text-foreground`, etc.) instead of hardcoded colors.
3. Support all three states: light, dark, system.
4. Make it accessible: include ARIA labels, keyboard support, focus management.
5. Document its props with a JSDoc comment block.

---

## 📥 Submitting Changes

### Workflow

1. **Fork** the repository.
2. Create a feature branch: `git checkout -b feat/your-feature-name`
3. Make your changes (with tests).
4. Run the verification suite: `npm run lint && npx tsc --noEmit && npm test && npm run build`
5. **Commit** with a clear message:
   ```
   feat(scope): short description

   Longer explanation if needed. Wraps at 72 chars.
   ```
6. **Push** to your fork: `git push origin feat/your-feature-name`
7. Open a **Pull Request** against `master`.

### Commit message format

We use [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` — New user-facing feature
- `fix:` — Bug fix
- `refactor:` — No behavior change
- `test:` — Add or fix tests
- `docs:` — Documentation only
- `chore:` — Tooling, dependencies, build config
- `style:` — Whitespace, formatting (no logic change)

Examples:
```
feat(agents): add Channel Effectiveness scoring
fix(api): handle session expired gracefully in client
docs(readme): document dark mode feature
```

### PR checklist

- [ ] Tests added for new code (if applicable)
- [ ] `npm run lint` passes
- [ ] `npx tsc --noEmit` passes
- [ ] `npm test` passes
- [ ] `npm run build` succeeds
- [ ] README updated (if user-facing change)
- [ ] No new `any` types introduced
- [ ] No hardcoded colors (use theme variables)
- [ ] Dark mode verified

---

## 🐛 Reporting Bugs

Open an issue with:
- **Steps to reproduce**
- **Expected behavior**
- **Actual behavior**
- **Screenshots** (if UI-related)
- **Browser/device** (if relevant)

For security issues, see [SECURITY.md](./SECURITY.md) (if present) or email the maintainers directly.

---

## 💡 Suggesting Features

Open an issue with:
- **Problem** — what user pain does this solve?
- **Proposed solution** — what would the feature look like?
- **Alternatives considered** — what other approaches did you think about?
- **Scope** — small / medium / large

---

## 🌍 Community

- Be respectful and inclusive. See [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md) (if present).
- Ask questions in GitHub Discussions.
- Report security issues privately.

---

## 📜 License

By contributing, you agree that your contributions will be licensed under the [MIT License](./LICENSE).
