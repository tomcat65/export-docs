# docu-export — Export Documentation System

Web application for Texas Worldwide Oil Services LLC (TXWOS) that automates
generation of international export compliance documents from uploaded Bills of Lading.

**Live:** https://txwos-docs.fyi  
**Access:** Admin-only — 4 authorized Google accounts defined in `src/lib/auth.ts`

---

## How It Works

### The Core Flow

```
Admin uploads BOL (PDF, JPEG, PNG, or other image format)
       │
       ▼
Next.js API (/api/documents/upload)
  └─ Saves file to MongoDB GridFS
  └─ Calls Firebase Cloud Function (processBolDocument)
           │
           ▼
     Firebase Function
       └─ Passes PDF (base64) to Claude vision API
       └─ Claude extracts: BOL number, vessel, voyage, ports,
          containers, weights, shipper, consignee
           │
           ▼
  Next.js API receives extracted data
  └─ Verifies consignee name matches selected client
  └─ Saves structured bolData to MongoDB Document record
           │
           ▼
  Admin generates documents from the BOL:
    - Certificate of Origin (COO) → generated via pdf-lib
    - Packing List (PL)           → generated via pdf-lib

  Admin uploads associated documents linked to the BOL:
    - Export Invoice (INVOICE_EXPORT)
    - Certificate of Analysis (COA)
    - Shipper's Export Declaration (SED)
```

### Document Types

All documents are stored in a single MongoDB `Document` collection with a `type` field:

| Type | How it's created | Notes |
|---|---|---|
| `BOL` | Admin upload → Claude extracts data | Source of truth for a shipment |
| `COO` | Generated server-side via pdf-lib | Requires notary assets in `Asset` collection |
| `PL` | Generated server-side via pdf-lib | Built from BOL container/weight data |
| `INVOICE_EXPORT` | Admin upload (PDF) | Linked to BOL via `relatedBolId` |
| `COA` | Admin upload (PDF) | Linked to BOL via `relatedBolId` |
| `SED` | Admin upload (PDF) | Linked to BOL via `relatedBolId` |

All documents for a shipment are linked by `relatedBolId → BOL _id`.  
When a document is replaced, the old record is marked `status: superseded` and `supersededBy`
points to the new one. GridFS files are never deleted — only superseded.

### The BOL Document Folder

Each BOL has a **document folder view** at `/dashboard/documents/[id]` that shows:
- The BOL itself with its extracted shipment data
- All 5 associated document slots (COO, PL, Invoice, COA, SED)
- Per-slot actions: **View**, **Download**, **Regenerate** (COO/PL) or **Replace** (uploaded docs)
- Empty slots show an **Upload** button

---

## Data Model

### Document (primary collection)
```
clientId        → Client ObjectId
type            → BOL | COO | PL | INVOICE_EXPORT | COA | SED | ...
fileId          → GridFS ObjectId (the actual PDF bytes)
relatedBolId    → ObjectId of parent BOL (null for BOL itself)
status          → active | superseded
supersededBy    → ObjectId of replacement document (if superseded)

bolData         → Structured extract (populated for BOL type)
  bolNumber, vessel, voyage, portOfLoading, portOfDischarge,
  dateOfIssue, totalContainers, totalWeight{kg, lbs}, shipper,
  carrierReference, bookingNumber

items[]         → Container-level line items (used for PL generation)
  containerNumber, seal, description, product, packaging,
  packagingQuantity, quantity{litros, kg}

cooData         → COO certificate fields (populated when COO generated)
packingListData → PL header fields (populated when PL generated)
```

### Client
```
name    → Display name (must match BOL consignee for upload to succeed)
rif     → Venezuelan tax ID (used as secondary match check)
```

### Asset
```
Used to store notary signature/stamp images required for COO generation.
COO generation fails hard if required assets are missing.
```

---

## Key Technical Decisions

**Why Firebase Cloud Functions for BOL parsing?**  
Claude's vision API requires a long-running call (~30–60s for complex BOLs). Firebase Functions
support 9-minute timeouts; Next.js API routes timeout at ~60s. The Firebase Function receives
the PDF as base64, calls Claude, and returns structured JSON.

**Why pdf-lib for document generation?**  
Server-side, no browser dependency, precise layout control for compliance documents.
COO generation is the most complex (~1,700 lines) — it embeds notary stamps, signature images,
and formatted tables that must match the official certificate format exactly.

**Why MongoDB GridFS for file storage?**  
All document binaries (PDFs) are stored in GridFS alongside their metadata in MongoDB.
This keeps everything in one database and avoids a separate file storage service.
Files are retrieved via `/api/documents/[id]/view` and `/api/documents/[id]/download`.

**Client verification on BOL upload**  
When a BOL is uploaded, the consignee name extracted by Claude is matched against the
selected client using normalized string comparison (punctuation stripped, case-insensitive,
substring match with >50% overlap threshold). The upload fails with a clear error if the
BOL appears to belong to a different client.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 (App Router), TypeScript |
| UI | Tailwind CSS, shadcn/ui, Radix UI |
| Auth | NextAuth.js + Firebase Auth (Google OAuth) |
| Database | MongoDB Atlas + Mongoose |
| File storage | MongoDB GridFS (document binaries) |
| Cloud functions | Firebase Cloud Functions (BOL processing) |
| AI | Anthropic Claude (`ANTHROPIC_MODEL` env var) — BOL PDF extraction |
| PDF generation | pdf-lib (server-side, COO + PL) |
| Data fetching | TanStack Query (v5) + SWR (legacy, being phased out) |
| Testing | Vitest |

---

## Local Development

```bash
npm install
npm run dev
```

App runs at http://localhost:3000.  
Admin access requires one of the four authorized email addresses in `src/lib/auth.ts`.

To use the Firebase local emulator instead of production:
```bash
cd functions && firebase emulators:start --only functions
```
Then set `NEXT_PUBLIC_USE_FIREBASE_EMULATOR=true` in `.env.local`.

---

## Environment Variables

Copy `.env.example` to `.env.local`.

```env
# MongoDB
MONGODB_URI=mongodb+srv://...

# NextAuth
NEXTAUTH_SECRET=...
NEXTAUTH_URL=http://localhost:3000

# Anthropic (Claude API) — used inside Firebase Function, not Next.js
ANTHROPIC_API_KEY=...
ANTHROPIC_MODEL=claude-opus-4-6

# Firebase (client-side config — safe to expose)
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=...
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
NEXT_PUBLIC_FIREBASE_APP_ID=...

# Optional: use local Firebase emulator
NEXT_PUBLIC_USE_FIREBASE_EMULATOR=true
NEXT_PUBLIC_NODE_ENV=development
```

> **Security note:** `ANTHROPIC_API_KEY` is used server-side only (inside the Firebase Function
> and Next.js API routes). It must never appear in client-side code or be prefixed with `NEXT_PUBLIC_`.

---

## Firebase Functions

BOL processing logic lives in `functions/src/`. The main function is `processBolDocument`.

```bash
cd functions && npm install

# Deploy
firebase deploy --only functions

# Local emulator
firebase emulators:start --only functions
```

---

## API Routes Reference

### Documents
| Route | Method | Purpose |
|---|---|---|
| `/api/documents/upload` | POST | Upload a BOL (PDF or image); triggers Claude extraction |
| `/api/documents/[id]` | GET | Get document metadata |
| `/api/documents/[id]/documents` | GET | Get all documents linked to a BOL (folder view) |
| `/api/documents/[id]/generate/coo` | POST | Generate COO PDF for a BOL |
| `/api/documents/[id]/generate/pl` | POST | Generate Packing List PDF for a BOL |
| `/api/documents/[id]/upload-associated` | POST | Upload Invoice/COA/SED linked to a BOL |
| `/api/documents/[id]/view` | GET | Stream PDF for in-browser viewing |
| `/api/documents/[id]/download` | GET | Download PDF |
| `/api/documents/[id]/edit-field` | PATCH | Edit an extracted BOL field |
| `/api/documents/[id]/update-details` | PATCH | Update PL/COO metadata |

### Other
| Route | Purpose |
|---|---|
| `/api/clients` | Client CRUD |
| `/api/assets` | Notary asset management (signatures, stamps) |
| `/api/health` | Health check |
| `/api/debug/*` | Debug utilities (gated to `NODE_ENV=development` only) |

---

## Running Tests

```bash
npm test               # Run all tests
npm run test:watch     # Watch mode
```

212 tests across 9 files:

| File | Coverage | Tests |
|---|---|---|
| `coo-utils.test.ts` | COO utility functions | 32 |
| `coo-route-integration.test.ts` | COO generation route | 18 |
| `pl-utils.test.ts` | PL utility functions | 20 |
| `pl-route-integration.test.ts` | PL generation route | 21 |
| `bol-folder.test.ts` | BOL document folder view | 24 |
| `upload-associated.test.ts` | Invoice/COA/SED upload to GridFS | 31 |
| `replace-document.test.ts` | Document supersede / replace logic | 28 |
| `security-claude.test.ts` | API key not exposed client-side | 5 |
| `debug-routes-guard.test.ts` | Debug endpoint security | 33 |
