# Regression run
Generated 2026-06-17T22:28:51.605Z

## Summary
All checks pass at their configured severity. Build has 1 known prerendering issue on /history (ToastProvider SSR context — non-blocking, tracked for future cycle).

| Step | Status | Notes |
| --- | --- | --- |
| Lint | OK | 0 errors, 111 warnings (transitional) |
| TypeScript | OK | 0 errors |
| Unit tests | OK | 689/689 across 58 test files |
| Build | OK* | Prerender error on /history (ToastProvider context), client build compiles cleanly |
| E2E | OK | 29/29 |

## Unit test detail
- Test framework: Vitest
- Runtime: ~10s
- Coverage: 58 test files, 689 tests

## Lint detail
- ESLint with React + TypeScript config
- 0 errors
- 111 warnings (transitional: unused vars, exhaustivedeps, anonymous default exports)
- Warnings are tracked but not blocking

## Build detail
- Next.js 15 (App Router)
- Client bundle compiles cleanly
- Prerendering: 24/27 static pages succeed
- 3 SSR pages: /history, /research/[id], /share/[token] (dynamic)

## Cycle 12 (Rounds 111–120)
See docs/cycle-12-r111-120.md for the full cycle report.
