# Docu-Export Remediation Plan

## PR 1 — Security + Schema Fix (today)

### Security Hotfix
- [x] 1.1 Remove `console.log('MongoDB URI:', MONGODB_URI)` from `db.ts:23`
- [x] 1.2 Gate auth callback logging (emails, admin status) behind `NODE_ENV === 'development'`
- [x] 1.2b Remove db name + collection list from connection success log

### Schema: extractedData (data loss fix)
- [x] 1.3 Add explicit sub-schemas for `extractedData` (containers, parties, commercial) + `meta: Schema.Types.Mixed` to Document model
- [x] 1.3b Add product{name,description,hsCode} and quantity{volume,weight} to container schema
- [x] 1.3c Fix Mongoose `type` key collision — wrap as `{ type: String }`
- [x] 1.4 Update `IDocument` TypeScript interface to match new schema fields
- [x] 1.5 Verify `save-bol/route.ts` writes align with new schema shape

### Schema: status enum expansion
- [x] 1.6 Expand status enum to `['processing', 'processed', 'active', 'superseded', 'duplicate', 'verification_failed', 'error']`
- [x] 1.7 Update `IDocument` TypeScript interface for status type

### Verification
- [x] 1.8 Type-check passes (`npx tsc --noEmit` — no new errors)
- [x] 1.9 Tests pass (`npx vitest run` — 238/238)
- [x] 1.10 Codex audit — no blocking findings (3 rounds, commit `f82d314`)

---

## PR 2 — Route Cleanup + Timeout-proofing (this week)

### Route cleanup
- [x] 2.1 Delete BOL processing path from `upload/route.ts` (745→183 lines)
- [x] 2.2 Delete `process-bol/route.ts` — confirmed unreferenced, removed

### Replace flow fix
- [x] 2.3 Rewrite `handleReplaceExisting` as soft-delete (PATCH superseded) + save-bol

### Retry consolidation
- [x] 2.4 Remove retries from `firebase-client.ts` (single call, throw on failure)
- [x] 2.5 Keep retries in `document-upload.tsx` component only

### Config + UX
- [x] 2.6 Use `NEXTAUTH_URL` env var for redirect_uri in `auth.ts`
- [x] 2.7 Use `showSuccessAndRedirect()` (router.push) after successful save-bol

### Cleanup
- [x] 2.8 Remove dead functions: onDrop, isTimeoutError, handleUploadError, showSkipOption, fileInputRef
- [x] 2.9 Remove manual `createdAt`/`updatedAt` from save-bol + upload route

### Verification
- [x] 2.10 Type-check + tests pass (238/238)
- [ ] 2.11 Codex audit — no blocking findings

---

## Review
(To be filled after completion)
