# docu-export Execution Plan
# Project: docu-export | Level: 3 | Track: bmad_method

## Task 001: Security Hardening — Remove 'use client' from claude.ts
- [x] 001: Remove 'use client' directive and audit API key exposure
- AC:
  - 'use client' directive removed from src/lib/claude.ts
  - File confirmed server-only (no client component imports it)
  - ANTHROPIC_API_KEY not present in any client bundle after next build
- Files: src/lib/claude.ts
- Verify: `grep -r "'use client'" src/lib/claude.ts | wc -l | grep -q '^0$'`
- Risk: medium
- Max-iterations: 3
- Scope: code
- File-ownership:
  - owns: [src/lib/claude.ts]
- Wiring-proof:
  - CLI: grep -r "use client" src/lib/claude.ts | wc -l | grep -q '^0$'

## Task 002: Security Hardening — Update hardcoded Claude model to env var
- [ ] 002: Replace claude-3-opus-20240229 with env var in fetchFromClaudeDirect
- AC:
  - Hardcoded model string replaced with: process.env.ANTHROPIC_MODEL ?? 'claude-opus-4-6'
  - ANTHROPIC_MODEL=claude-opus-4-6 added to .env.example
  - NOTE: claude-opus-4-6 is confirmed valid model string as of 2026-03-06
- Files: src/lib/claude.ts, .env.example
- Verify: `grep -r "claude-3-opus-20240229" src/ | wc -l | grep -q '^0$'`
- Risk: low
- Max-iterations: 2
- Scope: code
- File-ownership:
  - owns: [.env.example]
  - touches: [src/lib/claude.ts]
- Wiring-proof:
  - CLI: grep "ANTHROPIC_MODEL" src/lib/claude.ts

## Task 003: Security Hardening — Gate debug endpoints behind NODE_ENV
- [ ] 003: All /api/debug/* routes return 404 in production
- AC:
  - Every route handler in src/app/api/debug/ has NODE_ENV production guard at top
  - Guard returns NextResponse.json({ error: 'Not found' }, { status: 404 })
  - Affected: anthropic-test, anthropic-debug, force-carrier-ref, add-carrier-ref, database-check, documents, gridfs, test-claude
  - Dev mode: all debug routes still return 200
- Files: src/app/api/debug/
- Verify: `grep -rl "NODE_ENV" src/app/api/debug/ | wc -l | grep -qv '^0$'`
- Risk: low
- Max-iterations: 2
- Scope: code
- File-ownership:
  - owns: [src/app/api/debug/]
- Wiring-proof:
  - CLI: grep -rl "NODE_ENV" src/app/api/debug/ | wc -l

## Task 004: Verify COO generation end-to-end with real BOL data
- [x] 004: COO PDF generates correctly and matches coo-sample.pdf layout
- AC:
  - COO generation triggered via /api/documents/[id]/generate/coo with real BOL
  - PDF output includes: TXWOS logo, buyer info, maritime booking, container/seal table, product info, origin statement, signature block, notary section
  - Date shown is next business day after BOL issue date (weekends skipped)
  - Notary assets loaded from MongoDB Asset model (fail with clear error if missing)
  - Generate COO button visible and functional in dashboard
- Files: src/app/api/documents/[id]/generate/coo/route.ts, src/components/coo-viewer.tsx
- Verify: `npx vitest run tests/coo-utils.test.ts tests/coo-route-integration.test.ts --reporter=verbose 2>&1 | grep -q "50 passed"`
- Risk: high
- Max-iterations: 5
- Scope: code
- File-ownership:
  - owns: [src/app/api/documents/[id]/generate/coo/route.ts]
  - reads: [src/models/Document.ts, src/models/Asset.ts]
- Wiring-proof:
  - Integration: COO route reads from MongoDB Document + Asset collections

## Task 005: Verify PL generation end-to-end with real BOL data
- [x] 005: Packing List PDF generates correctly
- AC:
  - PL generation triggered via /api/documents/[id]/generate/pl with real BOL
  - PDF output includes: client address, container numbers, seal numbers, quantities (liters + kg)
  - Client address correct for both LMV CA and Keystone CA
  - Generate PL button visible and functional in dashboard
- Files: src/app/api/documents/[id]/generate/pl/route.ts
- Verify: `npx vitest run tests/ --reporter=verbose 2>&1 | grep -qE "passed"`
- Risk: medium
- Max-iterations: 4
- Scope: code
- File-ownership:
  - owns: [src/app/api/documents/[id]/generate/pl/route.ts]
  - reads: [src/models/Document.ts]
- Wiring-proof:
  - Integration: PL route reads Document model for container and quantity data

## Task 006: BOL Document Folder — folder view UI
- [x] 006: Dashboard shows all documents per BOL in a single folder view
- AC:
  - /dashboard/documents/[id] shows Document Folder layout
  - Lists all documents linked to BOL (via relatedBolId + BOL itself)
  - Each document shows: type badge, filename, date, status, action buttons
  - Generated docs (COO, PL): View | Regenerate buttons
  - Upload-only docs (Invoice, COA, SED): View | Replace buttons if present, Upload button if missing
  - Missing docs shown as empty slots with Upload button
  - Uses TanStack Query for document list fetching (not SWR)
- Files: src/app/dashboard/documents/[id]/page.tsx, src/app/api/documents/[id]/documents/route.ts
- Verify: `npx tsc --noEmit 2>&1 | grep -q 'error' && exit 1 || exit 0`
- Risk: medium
- Max-iterations: 4
- Scope: code
- File-ownership:
  - owns: [src/app/dashboard/documents/[id]/page.tsx]
  - reads: [src/models/Document.ts, src/app/api/documents/[id]/documents/route.ts]
- Wiring-proof:
  - CLI: GET /api/documents/[id]/documents returns array of related docs


## Task 007: BOL Document Folder — upload associated documents
- [ ] 007: User can upload Invoice, COA, SED PDFs and associate them to a BOL
- AC:
  - Upload button per document slot opens file picker (PDF only)
  - On upload: file stored in GridFS, Document record created with correct type + relatedBolId
  - Supported types: INVOICE_EXPORT, COA, SED
  - clientId inherited from parent BOL document
  - Success: document appears in folder view immediately
  - Error: clear user-facing message on failure, no silent errors
  - API route POST /api/documents/[id]/upload-associated requires admin auth
  - Zod schema validates all inputs
- Files: src/app/api/documents/[id]/upload-associated/route.ts, src/app/dashboard/documents/[id]/page.tsx
- Verify: `npx tsc --noEmit 2>&1 | grep -q 'error' && exit 1 || exit 0`
- Risk: medium
- Max-iterations: 4
- Scope: code
- File-ownership:
  - owns: [src/app/api/documents/[id]/upload-associated/route.ts]
  - touches: [src/app/dashboard/documents/[id]/page.tsx]
  - reads: [src/models/Document.ts, src/lib/db.ts]
- Wiring-proof:
  - CLI: POST /api/documents/[id]/upload-associated creates Document + GridFS entry
  - Integration: relatedBolId links uploaded doc to parent BOL

## Task 008: BOL Document Folder — replace document (supersede)
- [ ] 008: Replace button creates new Document record and marks old as superseded
- AC:
  - Replace button triggers new upload flow
  - Old GridFS file retained (immutable per constitution)
  - New Document record created with same type + relatedBolId
  - Old Document record updated: status='superseded', supersededBy=newDoc._id
  - Folder view shows only latest non-superseded doc per type by default
  - DECISION LOCKED: supersede approach (not overwrite)
- Files: src/app/api/documents/[id]/upload-associated/route.ts, src/models/Document.ts
- Verify: `npx tsc --noEmit 2>&1 | grep -q 'error' && exit 1 || exit 0`
- Risk: medium
- Max-iterations: 3
- Scope: code
- File-ownership:
  - owns: [src/models/Document.ts]
  - touches: [src/app/api/documents/[id]/upload-associated/route.ts]
- Wiring-proof:
  - Integration: upload-associated route writes supersededBy reference to old Document record

## Task 009: Technical debt — BillOfLading legacy model audit
- [ ] 009: Audit and retire BillOfLading legacy model if unused
- AC:
  - Git checkpoint commit created before any deletion
  - grep covers static imports AND dynamic require() patterns
  - If no references: BillOfLading.ts deleted, TypeScript compiles clean
  - If references found: migrated to Document model, then deleted
- Files: src/models/BillOfLading.ts
- Verify: `npx tsc --noEmit 2>&1 | grep -q 'error' && exit 1 || exit 0`
- Risk: low
- Max-iterations: 2
- Scope: code
- File-ownership:
  - owns: [src/models/BillOfLading.ts]
- Wiring-proof:
  - CLI: grep -r "BillOfLading" src/ --include="*.ts" --include="*.tsx" | wc -l | grep -q '^0$'

## Task 010: Technical debt — Archive production remediation scripts
- [ ] 010: Move one-off fix scripts to scripts/archive/ with README
- AC:
  - scripts/archive/ directory created
  - All test-fix-*.js, test-cleanup-*.js, test-bol-*.js moved to archive
  - README.md in scripts/archive/ documents what each script was for
  - Original files NOT deleted (incident documentation)
- Files: scripts/archive/, test-fix-mcop650126304.js, test-cleanup-*.js
- Verify: `ls scripts/archive/README.md`
- Risk: low
- Max-iterations: 1
- Scope: code
- File-ownership:
  - owns: [scripts/archive/]
- Wiring-proof:
  - CLI: ls scripts/archive/README.md

## Parallelism Assessment

Sequential dependencies: 001 -> 002 -> 003, 003 -> 004, 003 -> 005, 003 -> 006, 006 -> 007 -> 008, 003 -> 009, 003 -> 010

Groups:
- Sprint 0 (serial): 001 -> 002 -> 003
- Sprint 1 (parallel after 003): 004 || 005 || 006 || 009 || 010
- Sprint 1 (serial within folder UI): 006 -> 007 -> 008

Reasoning:
- 001/002/003 are serial: all touch security surface, 001+002 both edit claude.ts
- 004 and 005 are independent: different route files, can run in parallel
- 006/007/008 are serial: folder UI must exist before upload button, upload must exist before replace
- 009 and 010 are independent: different files, can run in parallel
- 004-010 all unblock after 003 completes
