# docu-export — Export Documentation System

Web application for Texas Worldwide Oil Services LLC (TXWOS) that automates
generation of international export compliance documents from uploaded Bills of Lading.

**Live:** https://txwos-docs.fyi

---

## What It Does

1. Admin uploads a Bill of Lading PDF
2. Claude (Anthropic API) extracts shipment data via Firebase Cloud Function
3. System generates: Certificate of Origin (COO), Packing List (PL)
4. Admin uploads associated documents: Export Invoice, COA, Shipper's Export Declaration
5. All documents viewable together in a BOL document folder

**Current clients:** Productos Quimicos LMV CA (Venezuela), Keystone CA (Venezuela)

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 (App Router), TypeScript |
| UI | Tailwind CSS, shadcn/ui, Radix UI |
| Auth | NextAuth.js + Firebase Auth |
| Database | MongoDB Atlas + Mongoose |
| File storage | MongoDB GridFS |
| Cloud functions | Firebase Cloud Functions (BOL processing) |
| AI | Anthropic API (Claude) — BOL PDF extraction |
| PDF generation | pdf-lib (server-side) |
| Testing | Vitest |

---

## Local Development

```bash
npm install
npm run dev
```

App runs at http://localhost:3000. Admin access requires one of the four
authorized email addresses configured in `src/lib/auth.ts`.


## Environment Variables

Copy `.env.example` to `.env.local` for local development.

### Required

```env
# MongoDB
MONGODB_URI=mongodb+srv://...

# NextAuth
NEXTAUTH_SECRET=...
NEXTAUTH_URL=http://localhost:3000

# Anthropic (Claude API)
ANTHROPIC_API_KEY=...
ANTHROPIC_MODEL=claude-opus-4-6

# Firebase (client-side — safe to expose)
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=...
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
NEXT_PUBLIC_FIREBASE_APP_ID=...
```

### Optional

```env
# Use Firebase local emulator instead of production
NEXT_PUBLIC_USE_FIREBASE_EMULATOR=true
NEXT_PUBLIC_NODE_ENV=development
```

---

## Firebase Functions

BOL processing runs in Firebase Cloud Functions (not in Next.js API routes).

```bash
cd functions
npm install

# Deploy functions
firebase deploy --only functions

# Run local emulator
firebase emulators:start --only functions
```

Set `NEXT_PUBLIC_USE_FIREBASE_EMULATOR=true` in `.env.local` to use the local emulator.

---

## Running Tests

```bash
npm test                    # Run all tests
npm run test:watch          # Watch mode
npx vitest run tests/       # Run specific test directory
```

Test files are in `tests/`. Coverage includes:
- `coo-utils.test.ts` — COO utility functions (32 tests)
- `coo-route-integration.test.ts` — COO generation route (18 tests)
- `pl-utils.test.ts` — PL utility functions (20 tests)
- `pl-route-integration.test.ts` — PL generation route (21 tests)
- `bol-folder.test.ts` — BOL document folder view (24 tests)
- `upload-associated.test.ts` — Upload Invoice/CAO/SED to GridFS (31 tests)
- `replace-document.test.ts` — Document supersede / replace logic (28 tests)
- `security-claude.test.ts` — Claude API key not exposed client-side (5 tests)
- `debug-routes-guard.test.ts` — Debug endpoint security (33 tests)

