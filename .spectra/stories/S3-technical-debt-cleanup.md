# Story S3: Technical Debt Cleanup
Priority: P2 — after S0, S1, S2
Estimate: ~half day
Risk: Low (no user-facing changes)

## Why
Discovery identified several technical debt items that create confusion and
maintenance risk. This story cleans them up before the codebase grows further.

## Acceptance Criteria

### S3-1: Audit and retire BillOfLading legacy model
- BEFORE any deletion: create a git checkpoint commit (`git commit -m "chore: pre-BillOfLading-deletion checkpoint"`)
- Search for imports using BOTH static and dynamic patterns:
  - `grep -r "BillOfLading" src/ --include="*.ts" --include="*.tsx"`
  - `grep -r "require.*BillOfLading" src/` (dynamic imports)
  - `grep -r "models/BillOfLading" .` (path-based imports)
- If no active references: delete `src/models/BillOfLading.ts`
- If active references found: migrate them to `Document` model, then delete
- Test: TypeScript compiles with no errors after deletion

### S3-2: Archive production remediation scripts
- Move these files to `scripts/archive/` with a README explaining what each was for:
  - `test-fix-mcop650126304.js`
  - `test-cleanup-specific-bol.js`
  - `test-cleanup-bol.js`
  - `test-bol-diagnostics.js`
  - `test-cleanup-hlcusha2307adria.js`
  - `test-firebase.js`, `test-firebase.cjs`, `test-firebase-function.js/cjs`
  - `test-claude-integration.js`, `simple-check.js`, `check-mongodb.js`
- Do NOT delete — these are incident documentation

### S3-3: Clarify Firebase Firestore role
- Read through Firebase Functions source (`functions/src/`) to determine
  if Firestore is written to anywhere
- Document finding in `.spectra/discovery.md` Section 9 (External Dependencies)
- Decision: if Firestore is unused → add to S4 (remove). If used → document what for.

### S3-4: Remove PROBLEMATIC_BOL_NUMBERS band-aid
- The hardcoded array `['HLCUSHA2307ADRIA']` in `firebase-client.ts` is a
  one-off patch that doesn't scale
- Replace with: a proper validation step that checks if extracted bolNumber
  matches expected format (alphanumeric, no spaces, 9-20 chars)
- If validation fails: log a warning, fall back to filename extraction,
  but do NOT silently accept wrong data
- Remove the hardcoded array entirely

## Definition of Done
- BillOfLading model either deleted or migration complete
- Remediation scripts in archive with README
- Firestore role documented
- PROBLEMATIC_BOL_NUMBERS replaced with proper validation
- TypeScript clean, ESLint clean
