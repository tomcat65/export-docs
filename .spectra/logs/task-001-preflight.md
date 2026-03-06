I'll now compile the pre-flight report based on the audit findings.

---

## 🚨 PRE-FLIGHT REPORT — Task 001

**Auditor Model:** Explore  
**Timestamp:** 2026-03-05T00:00:00Z  
**Scan Duration:** <60s  

---

### ✗ Sign Violations Found

#### **SIGN-001: Integration Tests Must Invoke What They Import** 
📍 `tests/coo-route-integration.test.ts` (Lines 137–144)

```typescript
describe('coo-utils module exports', () => {
  it('all four functions are importable and callable', async () => {
    const utils = await import('../src/lib/coo-utils')
    expect(typeof utils.extractProductName).toBe('function')  // ← Type-check only
    expect(typeof utils.getNextBusinessDay).toBe('function')   // ← No invocation
    expect(typeof utils.formatDateFormal).toBe('function')     // ← No invocation
    expect(typeof utils.getOrdinalSuffix).toBe('function')     // ← No invocation
  })
})
```

**Violation:** Test imports four functions but never **calls** them. Per SIGN-001: "Every integration test must invoke every pipeline step it imports." This is a TypeScript existence check, not a functional test.

**Risk:** Silent API contract violations (wrong return types, unhandled args) won't be caught.

---

#### **SIGN-005: File Collision — Task 001 ↔ Task 002**
📍 `src/lib/claude.ts` (shared ownership)

**Issue:** Plan.md shows:
- **Task 001** owns: `src/lib/claude.ts` (remove 'use client', audit API key)
- **Task 002** touches: `src/lib/claude.ts` (replace model string with env var)

Both tasks edit the same file in serial. Per SIGN-005: "No two teammates may edit the same file. Task decomposition must assign file ownership."

**Current state (Line 483 in claude.ts):**
```typescript
model: "claude-3-opus-20240229",  // ← Task 001 sees this; Task 002 will change it
```

**Blocker:** File ownership not partitioned. Task 001 must know whether it's responsible for the hardcoded model string or just the 'use client' line.

---

#### **Critical Finding: 'use client' in Server-Only Code**
📍 `src/lib/claude.ts` (Line 1)

```typescript
'use client'  // ← WRONG: This is a library, not a component
import { processDocumentWithClaude } from './anthropic-fetch';
```

**Issue:** The file:
- Reads `process.env.ANTHROPIC_API_KEY` (Line 426) — **server-only**
- Calls Anthropic API directly (Line 493) — **server-only**
- Has zero UI components or hooks — **pure logic**

`'use client'` forces Next.js to hydrate this on the browser, risking API key exposure in the bundle.

**Risk:** `ANTHROPIC_API_KEY` could leak into client JavaScript.

---

#### **Inconsistent Model Versions**
📍 Two different model strings in scope:
- `src/lib/claude.ts` Line 483: `"claude-3-opus-20240229"` (old)
- `src/lib/anthropic-fetch.ts` Line 9: `"claude-3-7-sonnet-20250219"` (new)

**Risk:** The fallback path and main path use different models, risking inconsistent behavior.

---

### ✓ Dependency Health
- `@anthropic-ai/sdk` — ✅ Installed in package.json
- `process.env.*` — ✅ Node.js native
- No external blockers (SIGN-008 pass)

---

### ✓ Non-Goals
- `.spectra/non-goals.md` not found
- No non-goal violations detected

---

## 📋 Advisory for Builder (Task 001)

**BEFORE you start Task 001, resolve these blockers:**

1. **Clarify file ownership with lead:**
   - Does Task 001 own BOTH removing 'use client' AND replacing the model string (Lines 1 + 483)?
   - Or does Task 001 only own 'use client' removal, leaving the model string for Task 002?
   - **Without clarity, you risk re-editing the same file as Task 002 (SIGN-005 collision).**

2. **Test rewrite required (SIGN-001):**
   - The `coo-route-integration.test.ts` file inspection test (Lines 137–144) must be rewritten to **invoke** the four functions, not just type-check them.
   - Example: Call each function with test data and assert the return value.
   - This blocks PR merge if not fixed.

3. **Scope audit carefully:**
   - 'use client' is at Line 1: Remove it ✅
   - API key is at Line 426: Audit it (check .env.example, process.env usage) ✅
   - Hardcoded model at Line 483: **Confirm with lead whether you own this or Task 002 does** ⚠️

4. **Search for other 'use client' directives:**
   - Grep the codebase for `'use client'` — there may be other files incorrectly marked as client-side.
   - Only Next.js **components** (in `app/` or `pages/`) should have this directive, not libraries.

---

**Violations Summary:**
- 🔴 SIGN-001: Integration test doesn't invoke imports
- 🔴 SIGN-005: File collision between Task 001 & 002
- 🟡 Architectural: 'use client' in server-only library

**Status:** ⚠️ **BLOCKED pending lead clarification on file ownership.** Do not start until Task 001 scope is confirmed.
