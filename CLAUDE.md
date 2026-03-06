# CLAUDE.md — SPECTRA Context (auto-generated, do not edit)

## SPECTRA Context
- Project: docu-export
- Level: 2
- Phase: execution
- Branch: spectra/run-20260305-220458

## Active Signs
> Learned Signs from SPECTRA execution. These are hard-won lessons that prevent recurring failure patterns.
> Updated automatically as verification gates catch issues.
### SIGN-001: Integration tests must invoke what they import
> "Every integration test must invoke every pipeline step it imports — importing a module without calling it is dead code in a test."
### SIGN-002: CLI commands need subprocess-level tests
> "CLI commands must have subprocess-level tests that prove real execution, not just class-level unit tests."
### SIGN-003: Lessons must generalize, not just fix
> "If the spec says A → B → C → D and your test skips B, you've written a unit test with extra steps — not an integration test."
### SIGN-004: Lead Drift
> "Team lead must not write code. If lead implements, escalate immediately."
### SIGN-005: File Collision
> "No two teammates may edit the same file. Task decomposition must assign file ownership."
### SIGN-006: Stale Task
> "If task stays in-progress >10 minutes without output, lead must nudge or reassign."
### SIGN-007: Silent Failure
> "Teammate errors must be surfaced to lead via mailbox. Silent swallowing is a system fault."
### SIGN-008: Research Before STUCK
> "Before declaring STUCK on any external blocker (dependency install, build error, missing package, environment issue), the builder must spend at least one research cycle using web search or documentation lookup. Most tooling failures have known solutions — a 30-second search beats a full STUCK escalation."
### SIGN-009: Test Ordering Pollution
> "Tests that pass in isolation but fail in the full suite indicate test pollution — shared state leaking between test files."

## Non-Goals
None defined

## Wiring Proof
All tasks require 5-check wiring proof before commit:
1. CLI paths — subprocess-level tests
2. Import invocation — no dead imports
3. Pipeline completeness — full chain tested
4. Error boundaries — clean messages, no tracebacks
5. Dependencies declared — all imports in requirements

## Evidence Chain
- Commits: feat(task-N) or fix(task-N)
- Reports: .spectra/logs/task-N-{build|verify|preflight}.md

## Plan Status
- [x] 001: Remove 'use client' directive and audit API key exposure
- [ ] 002: Replace claude-3-opus-20240229 with env var in fetchFromClaudeDirect
- [ ] 003: All /api/debug/* routes return 404 in production
- [x] 004: COO PDF generates correctly and matches coo-sample.pdf layout
- [x] 005: Packing List PDF generates correctly
- [x] 006: Dashboard shows all documents per BOL in a single folder view
- [x] 007: User can upload Invoice, COA, SED PDFs and associate them to a BOL
- [ ] 008: Replace button creates new Document record and marks old as superseded
- [ ] 009: Audit and retire BillOfLading legacy model if unused
- [ ] 010: Move one-off fix scripts to scripts/archive/ with README
