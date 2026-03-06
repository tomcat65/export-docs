# Story S2: BOL Document Folder — Upload & View
Priority: P1 — can run parallel to S1
Estimate: ~1 day
Risk: Low-Medium (new UI, existing data model supports it)

## Why
The Document model already supports all document types and the relatedBolId
link. What's missing is the UI to:
1. Upload Invoice, COA, and SED PDFs and associate them with a BOL
2. View all documents belonging to a BOL in one place (generated + uploaded)

This completes the full document set per shipment without building any generators.

## Context
- Invoice, COA, SED are prepared externally and uploaded as PDFs
- They must be stored in GridFS and linked to their parent BOL Document
- The BOL document folder shows: COO (generated), PL (generated),
  Invoice (uploaded), COA (uploaded), SED (uploaded) — all in one view
- Client-specific: LMV CA requires COO+COA+Invoice+PL, Keystone CA requires
  COO+Invoice+PL+SED. Both should work with the same UI.

## Acceptance Criteria

### S2-1: BOL document folder view
- Create/update `/dashboard/documents/[id]` to show a "Document Folder" layout
- Folder lists all documents linked to this BOL (by relatedBolId + the BOL itself)
- Each document shown with: type badge, filename, date, status, action buttons
- Action buttons per document type:
  - BOL: View
  - COO: View | Regenerate
  - PL: View | Regenerate
  - Invoice: View | Replace
  - COA: View | Replace
  - SED: View | Replace
- Missing documents shown as empty slots with an Upload button
- Generated documents (COO, PL) shown with Generate button if not yet generated

### S2-2: Upload associated documents
- "Upload" button per document type opens a file picker (PDF only)
- On upload: file stored in GridFS, Document record created with:
  - `type`: INVOICE_EXPORT | COA | SED (based on which slot was clicked)
  - `clientId`: inherited from parent BOL
  - `relatedBolId`: parent BOL Document `_id`
  - `fileName`: original filename
  - `fileId`: GridFS file ID
- Success: document appears in the folder view immediately
- Error: clear message if upload fails, no silent failure

### S2-3: Replace uploaded document
- "Replace" button on an existing uploaded doc triggers new upload
- Old GridFS file is RETAINED (constitution: GridFS files are immutable)
- New Document record created (same type + relatedBolId)
- Old Document record updated: add field `status: 'superseded'`, `supersededBy: newDoc._id`
- Only the latest non-superseded document of each type shown by default in folder view
- DECISION LOCKED: supersede approach (not overwrite)

### S2-4: Document count badge on client view
- Client card / client detail page shows document completion status per BOL
- Example: "BOL 247324392 — 3/5 documents complete"

## Technical Notes
- API route: POST `/api/documents/[id]/upload-associated`
  Body: `{ fileContent: base64, fileName, fileType, documentType }`
  Auth: admin only (session?.user?.isAdmin)
  Validation: Zod schema for all inputs
- Reuse existing GridFS upload pattern from `process-bol/route.ts`
- No new libraries — use existing shadcn/ui components (Dialog, Button, Badge)
- Use TanStack Query for document list fetching (not SWR)

## Definition of Done
- Can upload Invoice PDF, COA PDF, SED PDF against a real BOL
- All uploaded docs visible in folder view alongside COO and PL
- TypeScript clean, ESLint clean
- Auth guard on upload route
- Zod validation on upload route inputs
