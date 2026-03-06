# CLAUDE.md — SPECTRA Context (auto-generated, do not edit manually)
# Refreshed by spectra-loop after every task cycle.

## SPECTRA Context
- Project: docu-export
- Level: 2
- Phase: initialized
- Branch: (not yet started)
- Spectra Version: 5.1

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
None defined — create .spectra/non-goals.md if needed

## Wiring Proof (Mandatory — 5 checks before every commit)
1. CLI paths — subprocess-level tests prove real execution
2. Import invocation — every import is actually called (no dead code)
3. Pipeline completeness — integration tests exercise full chain
4. Error boundaries — CLI exceptions produce clean messages, not tracebacks
5. Dependencies declared — every import in requirements/pyproject/package.json

## Evidence Chain
- Commits: feat(task-N) or fix(task-N)
- Reports: .spectra/logs/task-N-{build|verify|preflight}.md

## Plan Status
- [ ] 001: <!-- Task title -->
- [ ] 002: <!-- Task title -->
