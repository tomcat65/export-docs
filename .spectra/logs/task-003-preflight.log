I'm in plan mode, which restricts me from writing files except the plan file. However, my role as SPECTRA Auditor requires me to produce and save the pre-flight report. Let me provide the complete audit report as output instead:

---

## ✅ PRE-FLIGHT AUDIT COMPLETE — Task 003 Ready for Build

### Sign Compliance Status

**All Signs ✅ CLEAR:**
- **SIGN-001** (Dead imports): No existing tests to audit; builder will create new test file
- **SIGN-002** (CLI subprocess tests): N/A — Task 003 is API routes, not CLI
- **SIGN-003** (Generalized lessons): Task spec is general (all 10 routes get same treatment)
- **SIGN-005** (File collision): Task 003 owns `/src/app/api/debug/` exclusively; no overlap with Tasks 004-010

### Critical Security Finding

**6 routes have ZERO authentication:**
- `/api/debug/force-carrier-ref` (POST) — modifies BOL data
- `/api/debug/add-carrier-ref` (GET) — modifies BOL data
- `/api/debug/test-claude` (GET) — exposes Claude API endpoint
- `/api/debug/anthropic-debug` (GET) — **EXPOSES API KEY FORMAT + ENV VARS**
- `/api/debug/database-check` (GET) — lists MongoDB collections
- `/api/debug/anthropic-test` (GET) — tests auth methods

**Why Critical:** In production without NODE_ENV gate, these are fully exploitable by any attacker. Task 003 fixes this.

---

## Advisory for Builder

### 🎯 What You Must Do

1. **Add production gate to all 10 route files** in `/src/app/api/debug/`
   - At the TOP of each route handler, before any other logic
   - Pattern: `if (process.env.NODE_ENV === 'production') { return NextResponse.json({ error: 'Not found' }, { status: 404 }) }`
   - Reuse the pattern from `src/lib/claude.ts` line 539 for consistency

2. **Create comprehensive test file** (`tests/debug-routes-production.test.ts`)
   - **Must invoke actual routes** — don't just grep files (SIGN-001 risk)
   - Test both development mode (expect 200) and production mode (expect 404)
   - Use beforeEach/afterEach to save/restore process.env.NODE_ENV (prevent SIGN-009 test pollution)
   - Cover all 10 routes explicitly

### ⚠️ Critical Risks to Watch

| Risk | Pattern | How to Avoid |
|------|---------|-------------|
| **SIGN-001 violation** | Test greps for NODE_ENV string instead of calling routes | Invoke every route in test with TestClient or fetch(); assert response.status |
| **SIGN-003 violation** | Test skips some routes (only tests 5 of 10) | Verify test file covers all 10 routes in both modes |
| **SIGN-009 violation** | NODE_ENV not restored after test, pollutes downstream tests | Use beforeEach/afterEach to save/restore NODE_ENV |
| **Security bypass** | NODE_ENV check placed AFTER business logic | Place guard at TOP of handler before any DB access or API calls |

### ✅ Patterns to Reuse

**Existing NODE_ENV pattern (src/lib/claude.ts:539):**
```typescript
const isProduction = process.env.NODE_ENV === 'production';
```

**NextResponse pattern (already used in /api/documents routes):**
```typescript
return NextResponse.json({ error: 'Not found' }, { status: 404 })
```

**Test pattern (from pl-route-integration.test.ts):**
- vitest with describe/it/expect already configured
- Use beforeEach/afterEach for setup/teardown

### 📋 Pre-Commit Checklist

- [ ] All 10 route files in `/src/app/api/debug/` have NODE_ENV guard at TOP
- [ ] Guard returns 404 with message: `{ error: 'Not found' }`
- [ ] New test file: `tests/debug-routes-production.test.ts`
- [ ] Tests invoke routes (call them, not just grep files)
- [ ] All 10 routes tested in both development and production modes
- [ ] beforeEach/afterEach restores NODE_ENV (no test pollution)
- [ ] `npm test` passes all tests
- [ ] `npm run build` succeeds

---

## Files Impacted by Task 003

**Files to Modify (10 total):**
1. `/src/app/api/debug/documents/route.ts`
2. `/src/app/api/debug/gridfs/route.ts`
3. `/src/app/api/debug/force-carrier-ref/route.ts` ⚠️ No auth, high risk
4. `/src/app/api/debug/add-carrier-ref/route.ts` ⚠️ No auth, high risk
5. `/src/app/api/debug/test-claude/route.ts` ⚠️ No auth
6. `/src/app/api/debug/anthropic-debug/route.ts` ⚠️ **EXPOSES API KEY**
7. `/src/app/api/debug/database-check/route.ts` ⚠️ No auth
8. `/src/app/api/debug/anthropic-test/route.ts` ⚠️ No auth
9. `/src/app/api/debug/documents/repair/route.ts`
10. `/src/app/api/debug/documents/test/route.ts`

**Files to Create (1):**
- `/tests/debug-routes-production.test.ts` (integration test)

---

## Verification Checklist (for Verifier)

After builder commits, verifier will check:
```bash
# All routes guarded with NODE_ENV check
grep -rl "NODE_ENV.*production" src/app/api/debug/ | wc -l
# Expected: 10 (one per route file)

# Tests exist and are complete
npm test tests/debug-routes-production.test.ts
# Expected: All tests pass, covering all 10 routes

# Full suite clean
npm test
# Expected: No test pollution, all tests pass

# Build clean
npm run build
# Expected: No TypeScript errors
```

---

## Summary

**Status: ✅ SIGN-COMPLIANT — Ready to Build**

Task 003 is a critical security fix (gate 6 unauthenticated routes in production). No Sign violations detected. File ownership is clear, patterns are established in codebase, and test framework is configured. Builder should focus on:

1. Adding NODE_ENV guard at TOP of all 10 routes
2. Creating real integration tests that INVOKE routes (not just grep files)
3. Preventing test pollution with proper beforeEach/afterEach cleanup

**Estimated build time:** 30-45 minutes
**Risk level:** LOW (straightforward security gate + test coverage)
**Blocker status:** None — clear to proceed immediately
