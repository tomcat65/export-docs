# docu-export — SPECTRA Discovery Report
Generated: 2026-03-06 (manual scout by claude-desktop)
Project root: ~/projects/dev/docu-export/project
SPECTRA level: 3 | Track: bmad_method | Risk score: 7

---

## 1. PROJECT SUMMARY

**What it is:** A Next.js web application for Texas Worldwide Oil Services LLC (TXWOS)
that automates generation of international export compliance documents (COO, Packing List,
Export Invoice, COA, SED) from uploaded Bills of Lading PDFs.

**Who uses it:** Admin-only. Four authorized users:
de@txwos.com, talvarez@txwos.com, txwos.tomas@gmail.com, txwos.diego@gmail.com

**Current clients:** Productos Quimicos LMV CA (Venezuela), Keystone CA (Venezuela).
Products: PRIMA 600N, BS150 GII, PRIMA 220N, PRIMA 100N (base oils, specific densities).

**Status:** Active production system with real shipments. NOT a prototype.

---

## 2. TECH STACK (CONFIRMED)

| Layer | Technology |
|---|---|
| Frontend | Next.js 15 (App Router), React, TypeScript |
| Styling | Tailwind CSS, shadcn/ui, Radix UI |
| State | TanStack Query (SWR hooks also present) |
| Auth | NextAuth.js + Firebase Auth (dual layer) |
| Primary DB | MongoDB + Mongoose |
| File storage | MongoDB GridFS |
| Secondary DB | Firebase Firestore (unclear current role) |
| Cloud compute | Firebase Cloud Functions (BOL processing) |
| AI | Anthropic SDK — claude-3-opus-20240229 (STALE) |
| PDF generation | @react-pdf/renderer |
| PDF parsing | Claude API vision (reads BOL PDFs as images) |
| Deployment | Firebase Hosting + Vercel (both configured) |


---

## 3. ARCHITECTURE — HOW IT WORKS

### Core pipeline (BOL → Documents)

```
User uploads BOL PDF
       ↓
/api/documents/process-bol (Next.js API route)
       ↓
Firebase Cloud Function: processBolDocument()
  → Calls Claude vision with PDF as base64
  → Extracts JSON: shipmentDetails, parties, containers, commercial
  → Returns to Next.js
       ↓
MongoDB: Document saved (type='BOL', bolData embedded)
MongoDB GridFS: Original PDF stored (fileId reference)
       ↓
User reviews extracted data in dashboard
       ↓
User triggers document generation (COO, PL, Invoice, etc.)
       ↓
Generated PDF served via /api/documents/[id]/view
```

### Retry/fallback chain (BOL processing)
1. Firebase Function — 2 retries, exponential backoff (2s, 4s)
2. Fallback: `fetchFromClaudeDirect()` — raw Anthropic API call from Next.js
3. Last resort: extract BOL number from filename via regex (`\d{9}`)
4. If all fail: return partial record, flag as `status: 'partial'`

### Firebase Function timeout
Firebase Function configured for 9-minute timeout (540,000ms).
Next.js side races against 60s timeout. Mismatch: function can succeed
after Next.js has already given up and returned an error to the user.


---

## 4. DATA MODEL

### Primary: `Document` (MongoDB) — ALL document types via `type` discriminator

```
type: 'BOL' | 'PL' | 'COO' | 'INVOICE_EXPORT' | 'INVOICE' |
      'COA' | 'SED' | 'DATA_SHEET' | 'SAFETY_SHEET' | 'INSURANCE'
subType?: string
clientId: ObjectId → Client
fileId: ObjectId → GridFS (binary file)
relatedBolId?: ObjectId → Document (parent BOL)

bolData: { bolNumber, bookingNumber, carrierReference, vessel, voyage,
           portOfLoading, portOfDischarge, dateOfIssue, totalContainers, totalWeight }

items: [{ itemNumber, containerNumber, seal, description, product,
          packaging, packagingQuantity, quantity: { litros, kg } }]

cooData: { certificateNumber, dateOfIssue, exporterInfo, importerInfo, productInfo[] }
packingListData: { documentNumber, date, poNumber, address }
```

Indexes: `{ clientId, type }`, `{ bolData.bolNumber }`, `{ relatedBolId }`

### Legacy: `BillOfLading` (MongoDB)
Older schema with containers embedded. Likely superseded by `Document` model.
Status: **UNKNOWN — audit needed.** If still used anywhere = dual-write risk.

### Supporting models
- `Client` — client records (name, RIF, address, contact)
- `Asset` — binary assets stored in MongoDB (signature images, notary seals)
- `AdminUser` — admin records separate from NextAuth session
- `SystemStatus` — health/status tracking


---

## 5. WHAT IS BUILT (CONFIRMED WORKING)

- ✅ Admin authentication (NextAuth + Firebase Auth)
- ✅ Client management CRUD (/dashboard/clients)
- ✅ BOL PDF upload and Claude extraction pipeline
- ✅ MongoDB + GridFS storage
- ✅ Document list view per client
- ✅ COO viewer component (header/body/footer sections)
- ✅ Packing list editor component
- ✅ BOL deduplication check (409 if bolNumber already exists)
- ✅ Firebase Functions deployment (processBolDocument live)
- ✅ Backup system (daily/weekly/monthly npm scripts)
- ✅ Admin diagnostics in dashboard
- ✅ Error classification with user-friendly messages

---

## 6. WHAT IS MISSING OR INCOMPLETE

### Critical gaps (blocking full document workflow)

| Gap | Evidence | Impact |
|---|---|---|
| COO PDF generation | Route exists (1756 lines pdf-lib), end-to-end not confirmed | Needs verification with real data |
| Packing list PDF generation | Route exists, end-to-end not confirmed | Needs verification with real data |
| BOL document folder UI | No UI to upload/associate Invoice, COA, SED to a BOL | Cannot complete document set per shipment |
| Test suite | No tests/ dir, no Jest/Vitest config | Zero automated coverage |

**NOTE: Invoice, COA, SED are UPLOAD-ONLY documents.**
The user uploads these PDFs manually. The system stores them in GridFS and
links them to the parent BOL via relatedBolId. No generation required.
The data model already supports this (fileId + relatedBolId fields exist).
What's missing is the upload UI and the BOL folder view that shows all
associated documents together.

### Secondary gaps

| Gap | Evidence |
|---|---|
| No multi-doc upload UI per BOL | Cannot associate uploaded Invoice/COA/SED to a specific BOL |
| BillOfLading legacy model | Still in models/, never removed |
| Debug endpoints in production | /api/debug/* routes accessible |
| spectra-scout binary missing | Not in ~/.spectra/bin/ |


---

## 7. RISKS AND TECHNICAL DEBT

### 🔴 HIGH — Address before new feature work

**R1: `'use client'` bug in claude.ts**
`src/lib/claude.ts` has `'use client'` at top but contains server-side Anthropic API
calls and `process.env.ANTHROPIC_API_KEY`. Gets bundled into the client bundle.
Can expose the API key in the browser under certain build configs.
Fix: remove `'use client'`, mark server-only.

**R2: Stale Claude model hardcoded**
`fetchFromClaudeDirect()` hardcodes `claude-3-opus-20240229`.
This model will be deprecated. Should use env var or current model name.

**R3: PROBLEMATIC_BOL_NUMBERS band-aid in firebase-client.ts**
Hardcoded array with one known bad BOL number (HLCUSHA2307ADRIA).
Root cause (Claude confusing carrier reference with BOL number) was patched
with prompt engineering but the workaround remains in production code.

### 🟡 MEDIUM — Plan to address

**R4: Debug endpoints live in production**
`/api/debug/anthropic-test`, `/api/debug/force-carrier-ref`, `/api/debug/add-carrier-ref`
are reachable in production. Admin-auth protected but should not exist in prod builds.
Gate with: `if (process.env.NODE_ENV !== 'production')`

**R5: 8+ production remediation scripts in repo root and scripts/**
`test-fix-mcop650126304.js`, `fix-dates.js`, `fix-documents.js`,
`fix-carrier-reference.ts`, `create-missing-docs.cjs`, `fix-last-document-dates.ts`
Represent past incidents. Still runnable. Risk of accidental execution on live data.

**R6: Dual backend ambiguity (MongoDB vs Firebase Firestore)**
MongoDB is clearly primary. Firestore role is unclear — vestigial or active?
Any new feature must explicitly decide which backend to use.

**R7: Firebase timeout mismatch**
Firebase Function: 9-minute timeout. Next.js client: 60s timeout.
Function can succeed after Next.js gave up. User sees error, document saved silently.

### 🟢 LOW — Track, no immediate action

**R8: Legacy BillOfLading model** — Audit for active references, retire if unused.
**R9: SWR + TanStack Query both present** — Standardize on TanStack Query.
**R10: Windows-only dev commands in cursor rules** — Risk if CI/CD runs on Linux.


---

## 8. KEY FILE MAP

```
project/
├── src/
│   ├── app/
│   │   ├── (auth)/login/           ← Login page
│   │   ├── dashboard/              ← Main dashboard (clients, documents, assets)
│   │   └── api/
│   │       ├── documents/
│   │       │   ├── process-bol/    ← BOL processing entry point
│   │       │   ├── upload/         ← File upload
│   │       │   ├── download/       ← File download
│   │       │   └── [id]/           ← Per-document ops (view, generate, edit)
│   │       ├── clients/            ← Client CRUD API
│   │       ├── auth/               ← NextAuth handlers
│   │       ├── debug/              ← ⚠️ Debug endpoints (prod risk)
│   │       └── admin/              ← Admin diagnostics
│   ├── models/
│   │   ├── Document.ts             ← PRIMARY model (all doc types)
│   │   ├── BillOfLading.ts         ← LEGACY (audit needed)
│   │   ├── Client.ts, Asset.ts, AdminUser.ts
│   ├── lib/
│   │   ├── claude.ts               ← ⚠️ 'use client' bug, stale model
│   │   ├── firebase-client.ts      ← Firebase Functions caller + retry logic
│   │   ├── anthropic-fetch.ts      ← Direct Anthropic API (fallback)
│   │   ├── db.ts                   ← MongoDB connection
│   │   └── auth.ts                 ← NextAuth config
│   └── components/
│       ├── coo-viewer.tsx          ← COO section viewer (calls view API)
│       ├── packing-list-editor.tsx ← PL editing UI
│       └── bol-upload-section.tsx  ← BOL upload UI
├── functions/
│   ├── index.js                    ← Firebase Functions entry point
│   └── src/                        ← Functions TS source (not fully scanned)
├── .spectra/                       ← SPECTRA project config (this file lives here)
└── [root clutter]
    ├── test-fix-mcop650126304.js   ← ⚠️ Production incident fix scripts
    ├── test-cleanup-*.js           ← ⚠️ One-off cleanup scripts
    └── test-bol-diagnostics.js     ← ⚠️ Diagnostic script
```

---

## 9. EXTERNAL DEPENDENCIES

| Service | Purpose | Risk if down |
|---|---|---|
| Anthropic API | BOL PDF parsing | Upload pipeline fails completely |
| Firebase Functions | BOL processing compute | Upload pipeline fails completely |
| Firebase Auth | User authentication | No one can log in |
| MongoDB Atlas | All document data | Application non-functional |
| GridFS (via MongoDB) | PDF/file storage | Documents unviewable |
| Firebase Firestore | Unknown current role | Unknown impact |
| NextAuth | Session management | Auth broken |


---

## 10. RECOMMENDED WORK PRIORITIES

### Sprint 0 — Security & Stability (before any new features)
1. Fix `'use client'` in `claude.ts` → server-only, audit API key exposure
2. Update Claude model from `claude-3-opus-20240229` to current (env var)
3. Gate `/api/debug/*` routes behind `NODE_ENV !== 'production'`
4. Audit `BillOfLading` legacy model — remove if unused
5. Clarify Firebase Firestore role — document or migrate off

### Sprint 1 — Complete Core Workflow
6. Implement COO PDF generation
   (spec in `.cursor/rules/generating-coo.mdc`, sample in `coo-sample.pdf`)
7. Implement Packing List PDF generation (editor exists, needs PDF output)
8. Implement Export Invoice PDF generation

### Sprint 2 — Quality & Confidence
9. Add integration test suite (BOL upload flow + document generation)
10. Fix Firebase/Next.js timeout mismatch (align or add async status polling)
11. Standardize on TanStack Query (remove SWR)
12. Move production remediation scripts to `scripts/archive/` or delete

### Sprint 3 — Expand
13. COA generation (if required by active clients)
14. SED generation (Keystone CA requirement)
15. Additional client onboarding flow
16. Multi-country support (beyond Venezuela)

---

## 11. OPEN QUESTIONS FOR PLANNING

Before writing stories, get answers to:

1. **Which documents work end-to-end in production today?**
   (COO viewer exists — does it actually produce a downloadable PDF?)

2. **Is Firebase Firestore actively used or being phased out?**
   could be used instead of mongo not ruled out, determine most optimal

3. **Are sample BOL PDFs available for testing?** Yes
   (Critical for integration tests — check `.docs/past_export_docs/`)

4. **What is the current COO /view route implementation?** not sure
   (`coo-viewer.tsx` calls `/api/documents/[id]/view` — confirm this exists)

5. **OFAC compliance consideration?** NO
   (Venezuela shipments — is any sanctions screening in place or required?)

6. **Notary section in COO — is it always required?** Yes
   (COO spec includes notary seal/signature from Asset model — is this asset
   always present in MongoDB or sometimes missing?) not sure

---

*Discovery confidence: HIGH*
*Based on: full read of models, API routes, lib files, components, cursor rules, context.md*
*Not scanned: functions/src/ (Firebase Functions TS source), full /api/documents/[id]/ routes*
*Firebase Firestore schema: UNKNOWN*
