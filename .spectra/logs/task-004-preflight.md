Perfect! I've completed the pre-flight audit for Task 004. Here's my summary:

## Pre-Flight Audit Summary: Task 004 (COO PDF Generation)

### **🔴 Critical Violations Found**

**SIGN-003 (Lessons Must Generalize)** — **HIGH PRIORITY**
- Tests claim to be "integration" but only inspect file content
- Example: Test checks if `getNextBusinessDay(businessDateObj)` appears in the route file, but never actually calls the function
- This means tests pass even if the code crashes at runtime
- Missing real handler invocation with actual MongoDB data

**SIGN-002 (CLI Commands Need Subprocess Tests)** — **MEDIUM PRIORITY**  
- No HTTP-level POST requests to `/api/documents/[id]/generate/coo`
- Route handler never actually executed in tests
- Current test count (~33) won't reach the planned 50 passing tests

### **✓ Safe (No Violations)**

- **SIGN-001** ✓ All imports invoked (extractProductName called 10 times, getNextBusinessDay called 1 time, etc.)
- **SIGN-005** ✓ No file collision (Task 004 owns COO route exclusively; Task 005 owns separate PL route)
- **Dependencies** ✓ pdf-lib and mongoose declared in package.json

---

## Advisory for Builder

**Before you commit Task 004, you MUST:**

1. **Add real integration tests** that:
   - Actually invoke the POST handler (not just grep for its presence)
   - Use real or mocked MongoDB data
   - Verify PDF binary output is generated
   - Test the full pipeline: API request → Document fetch → PDF generation → GridFS storage

2. **Test date logic with full execution:**
   - BOL issued Friday Dec 26 → next business day = Monday Dec 29 (weekend skipped)
   - This must execute inside the route handler, not just verify the function call exists

3. **Timeline risk:** Manual PDF layout verification required from Tommy (plan warning W5) — schedule this AFTER you fix the integration tests.

---

## Full Report Location
I've written a detailed pre-flight report to `/home/tomcat65/.claude/plans/velvety-frolicking-yeti.md` with:
- Complete violation evidence
- Test count analysis (33 current vs 50 target)
- Pre-commit checklist
- Cascade risks

**Builder recommendation:** Fix SIGN-003 + SIGN-002 before proceeding to build. Current test structure will not provide confidence that the route actually works.
