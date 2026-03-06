# Story S0: Security Hardening
Priority: P0 — BLOCKS ALL OTHER STORIES
Estimate: ~2 hours
Risk: Medium (touching live API surface)

## Why
Three security issues identified in discovery must be resolved before any new
feature work. Two are latent risks (API key exposure, stale model), one is
active (debug endpoints in production).

## Acceptance Criteria

### S0-1: Fix 'use client' in claude.ts
- Remove `'use client'` directive from `src/lib/claude.ts`
- Verify the file is never imported by client-side components
- If client-side usage found: extract server-only logic to `src/lib/claude.server.ts`
- Confirm `ANTHROPIC_API_KEY` is NOT present in any browser bundle after build
- Test: `next build` completes, no client bundle contains ANTHROPIC_API_KEY string

### S0-2: Update Claude model to env var
- Replace hardcoded `claude-3-opus-20240229` in `fetchFromClaudeDirect()` with:
  `process.env.ANTHROPIC_MODEL ?? 'claude-opus-4-6'`
- Add `ANTHROPIC_MODEL` to `.env.example` with value `claude-opus-4-6`
- NOTE: `claude-opus-4-6` is confirmed valid (Anthropic model string as of 2026-03-06)
- Do NOT change the Firebase Function model — that's a separate deployment
- Test: BOL processing fallback path uses the env var model

### S0-3: Gate debug endpoints
- Add `if (process.env.NODE_ENV === 'production') return NextResponse.json({ error: 'Not found' }, { status: 404 })`
  at the top of every route handler in `src/app/api/debug/`
- Affected routes: anthropic-test, anthropic-debug, force-carrier-ref,
  add-carrier-ref, database-check, documents, gridfs, test-claude
- Test: In dev mode all debug routes return 200. In prod mode (NODE_ENV=production) all return 404.

## Definition of Done
- TypeScript compiles clean
- ESLint passes
- All three changes verified with manual test or build check
- No regressions in BOL upload flow
