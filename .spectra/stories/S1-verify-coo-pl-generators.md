# Story S1: Verify COO and Packing List End-to-End
Priority: P1 — run after S0
Estimate: ~3 hours
Risk: Medium (touching 1756-line pdf-lib generator)

## Why
COO and PL generation routes exist and are substantial, but have never been
confirmed working end-to-end with real BOL data in this analysis. Before
building anything new, confirm these core generators produce correct output
or identify and fix what's broken.

## Acceptance Criteria

### S1-1: COO generation smoke test
- Upload a real BOL PDF (use samples from `.docs/past_export_docs/`)
- Trigger COO generation via `/api/documents/[id]/generate/coo`
- Verify: PDF is returned, opens correctly, matches layout of `project/coo-sample.pdf`
- Verify: All required sections present — header (TXWOS logo), buyer info,
  maritime booking, container/seal table, product info, origin statement,
  signature block (Tomas Alvarez), notary section with seal
- Verify: Date shown is next business day after BOL issue date (skip weekends)
- Document any failures found as sub-tasks

### S1-2: Packing list generation smoke test
- With same BOL data, trigger PL generation via `/api/documents/[id]/generate/pl`
- Verify: PDF is returned, opens correctly
- Verify: Container numbers, seal numbers, quantities (liters + kg) are correct
- Verify: Client address is correct for both LMV CA and Keystone CA
- Document any failures found as sub-tasks

### S1-3: Fix any rendering bugs found
- If COO notary assets are missing from MongoDB: document the asset upload flow,
  do NOT skip the notary section
- If container/seal table layout is wrong: fix to match coo-sample.pdf
- If quantities are wrong: trace back to BOL extraction and fix at source
- If PDF is blank or errors: fix the root cause, do not add silent fallbacks

### S1-4: Both generators reachable from dashboard
- Confirm the dashboard has UI to trigger COO and PL generation per BOL
- If UI is missing: add Generate COO and Generate PL buttons to the BOL document view

## Definition of Done
- COO PDF matches coo-sample.pdf layout with real data
- PL PDF generates with correct data
- Both reachable from dashboard UI
- No silent error swallowing in generation routes
