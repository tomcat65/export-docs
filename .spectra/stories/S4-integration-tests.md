# Story S4: Integration Test Suite
Priority: P2 — after S1 and S2
Estimate: ~half day
Risk: Low (additive only)

## Why
Zero automated tests on a production system with real clients is unsustainable.
This story establishes a minimal but meaningful test suite covering the two
most critical paths: BOL upload + COO generation.

## Acceptance Criteria

### S4-1: Test infrastructure
- Add Vitest (preferred) or Jest to devDependencies
- Configure to run TypeScript tests in `tests/` directory
- Add `"test": "vitest run"` to package.json scripts
- No impact on existing build

### S4-2: BOL data extraction unit tests
- Test `processClaudeResponse()` with fixture JSON (real extracted BOL data)
- FIXTURE RULE: All fixtures must be anonymized before committing:
  - Replace real container numbers with format XXXX0000000
  - Replace real BOL numbers with format 000000000
  - Replace real client names with "Test Client CA"
  - Replace real addresses with generic placeholders
  - Store anonymized fixtures in `tests/fixtures/` — never commit real PII
- Test: valid response parses correctly
- Test: missing bolNumber throws with clear error
- Test: empty containers array triggers warning (not throw)
- Test: carrierReference-as-bolNumber correction logic works

### S4-3: Document model validation tests
- Test: Document.create() with valid BOL data succeeds
- Test: Duplicate bolNumber returns 409 (test the deduplication check)
- Test: Document.create() with invalid type field fails Mongoose validation
- Use MongoDB memory server (mongodb-memory-server) for isolation

### S4-4: API route smoke tests
- Test: `/api/health` returns 200
- Test: `/api/documents/[id]` without auth returns 401
- Test: `/api/debug/anthropic-test` returns 404 when NODE_ENV=production

## Definition of Done
- `npm test` runs and passes
- At minimum 15 passing tests
- Tests run in under 30 seconds
- CI-safe (no real network calls, no real MongoDB, no real Anthropic API)
