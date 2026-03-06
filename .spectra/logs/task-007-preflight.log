## **SPECTRA Pre-Flight Audit Report — Task 007**

**Status: ✅ SIGN-COMPLIANT — Ready for Task 007 Build**

---

### Sign Violations Found

| Sign | Status | Details |
|------|--------|---------|
| **SIGN-001** | ✅ PASS | All test imports invoked; no dead code in tests |
| **SIGN-002** | ➖ N/A | No CLI commands in web app |
| **SIGN-003** | ✅ PASS | Full pipeline coverage verified (pl-route-integration.test.ts lines 240-268) |
| **SIGN-005** | ✅ PASS | File ownership clear; Task 006→007 dependency sequential (not parallel) |
| **SIGN-009** | ✅ PASS | No shared test state; all tests stateless and isolated |

**Overall Audit Result: CLEAN** — Zero active Sign violations.

---

### File Ownership for Task 007

| File | Owner | Access | Collision |
|------|-------|--------|-----------|
| `src/app/api/documents/[id]/upload-associated/route.ts` | Task 007 | Creates (NEW) | ✅ None |
| `src/app/dashboard/documents/[id]/page.tsx` | Task 006 (completed) | Task 007 touches | ✅ Expected sequential |
| `src/models/Document.ts` | Task 008 (pending) | Task 007 reads | ✅ No current conflict |
| `src/lib/db.ts` | — | Shared read-only | ✅ Safe |

**No file collisions detected.** Task 006 is complete and merged; Task 007 can safely extend its UI.

---

### Advisory for Builder — Critical Pre-Implementation Checklist

**1. Test File Gap** (SIGN-003 Prevention)
   - Create `tests/upload-associated.test.ts` **before** implementing the route
   - Must invoke the full pipeline:
     - PDF file validation (Zod schema)
     - GridFS storage
     - Document record creation with correct type/relatedBolId
     - clientId inheritance from parent BOL
     - Error boundary testing (user-facing messages, no tracebacks)

**2. Zod Schema Validation** (SIGN-002 Prevention)
   - Validate:
     - `type: 'INVOICE_EXPORT' | 'COA' | 'SED'` (enum)
     - `relatedBolId: ObjectId` (valid reference)
     - File extension: `.pdf` only
   - Test schema at boundary (upload route handler entry point)

**3. Client ID Inheritance** (Critical for Multi-Client Isolation)
   - Upload route MUST:
     - Query parent BOL document using `relatedBolId`
     - Extract `clientId` from parent BOL
     - Assign inherited `clientId` to new Document — **never trust user input**
   - Add assertion test: `assert(newDoc.clientId === parentBol.clientId)`

**4. Error Boundaries** (SIGN-007 Prevention)
   - No `JSON.stringify(Error)` in response bodies
   - No stack traces in HTTP responses
   - Return user-friendly messages (e.g., "Invalid PDF file" not "Unexpected token at line 5")
   - Log technical details server-side using logger

**5. Existing Test Coverage**
   - All existing tests (SIGN-001/003/009 compliant):
     - coo-utils.test.ts ✓
     - coo-route-integration.test.ts ✓
     - pl-utils.test.ts ✓
     - pl-route-integration.test.ts ✓
     - bol-folder.test.ts ✓
     - security-claude.test.ts ✓
   - Do NOT break existing tests; Task 007 adds new route without modifying existing ones

---

### Verification Gate (Before Commit)

Task 007 must pass these wiring checks before merge:

```bash
# 1. Test file exists and passes
npm test -- tests/upload-associated.test.ts

# 2. No dead imports in new tests
grep -n "import.*from" tests/upload-associated.test.ts | while read line; do
  func=$(echo "$line" | sed "s/.*import.*[{' ]\([a-zA-Z_]*\).*/\1/")
  grep -q "$func(" tests/upload-associated.test.ts || echo "FAIL: $line"
done

# 3. Route file exists and compiles
test -f src/app/api/documents/[id]/upload-associated/route.ts && echo "PASS: Route exists"

# 4. All imports in route resolve
grep "^import" src/app/api/documents/[id]/upload-associated/route.ts | \
  sed "s|.*from ['\"]|src/|;s|['\"].*||" | while read file; do
    test -f "$file.ts" || test -f "$file/index.ts" || echo "FAIL: Missing $file"
  done

# 5. Full suite still passes
npm test
```

---

### Codebase Health Summary

✅ **Project is clean and ready for Task 007 implementation.** All existing code complies with SIGN constraints. Task 007 adds new functionality without touching existing business logic. Sequential dependency (Task 006 → Task 007 → Task 008) is properly scoped and documented.
