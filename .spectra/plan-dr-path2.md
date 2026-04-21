# docu-parse DR Path 2 — Execution Plan
# Project: docu-export | Level: 3 | Track: spectra | Branch: feat/dr-path2-plan

## Goal

Turn the `mongodb_backup` Firestore mirror into a genuine DR fallback: event-driven per-save backup of metadata + binary chunks, a weekly point-in-time snapshot, a working restore script, and a drilled end-to-end recovery — all staying on Atlas M0.

## Constitution (locked by claude-desktop / Tommy — do not revisit)

1. **Event-driven backup** via Mongoose post-save hooks on schema (Document, Client, Asset, AdminUser). Fires inside the Next.js API request context. No per-route calls, no separate Function.
2. **Admin SDK from Next.js runtime** via Vercel env vars: `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`. Assembled via `admin.credential.cert()` at init. Separate from the local `scripts/backup/service-account-key.json` (manual-script use only).
3. **Rolling current mirror**: `mongodb_backup/current/{collection}/{docId}` — overwritten on every save, always reflects latest MongoDB state.
4. **Firebase Storage for binary chunks**: `backups/current/{docId}/chunks/{chunk_n}.bin`. Tommy enables Storage on `docu-parse` as a one-time Console step. Storage rules deny-all (Admin SDK bypass).
5. **Weekly PIT snapshots** — ONE Vercel cron → protected API route → full MongoDB → Firestore/Storage dump to `mongodb_backup/{YYYY-MM-DD}/`. Self-healing. Retention: last 8 weekly snapshots. Sunday 03:00 America/Chicago.
6. **`backup_failures` MongoDB collection** captures silent hook failures (collection, docId, timestamp, error, retryCount). Log only in this sprint, no UI.
7. **Restore script local-only**: `scripts/backup/firestore-to-mongodb.cjs` with Admin SDK + local service account key. Manual invocation, never prod.
8. **Deny-all Firestore rules stay deployed** (commit `52c6f26`). Admin SDK bypasses from all backup paths.
9. **Bootstrap required**: one full manual backup populates `mongodb_backup/current/` + `backups/current/` before hooks ship to prod. Avoids racing in-flight saves.

## Investigation findings (from this branch, read-only)

- **Current app state**: Next.js 15.1.9, React 19, Mongoose 8. 246/246 tests passing on `main` (HEAD `fff3e92`). Production at https://www.txwos-docs.fyi live.
- **GridFS scale (from `backups/2026-04-21/`):**
  - 75 documents, 75 `documents.files`, **240 `documents.chunks`**, 2 clients, 4 admin users, 6 assets + 6 `assets.files`
  - **~52 MB of document chunk bytes** (decoded from base64) + ~1 MB in asset chunks = **~53 MB per full snapshot**
  - 8-week retention → ≈425 MB in Firebase Storage steady-state. Storage cost trivially below Spark-plan free tier as of 2026 (5 GB Storage / 1 GB egress daily).
- **Existing Vercel cron** (`vercel.json` at `main`):
  ```json
  { "crons": [ { "path": "/api/health", "schedule": "0 0 * * 0" } ] }
  ```
  Uses `Authorization: Bearer <CRON_SECRET>` pattern in `src/app/api/health/route.ts`. No `maxDuration` anywhere in `src/app/api/` (all routes on default timeout).
- **`firebase-admin` is in root `devDependencies`** (`^13.7.0`). Must be promoted to `dependencies` for the Next.js runtime — phase 1 pre-req. (`functions/package.json` has its own copy; unaffected.)
- **Mongoose model surface** (`src/models/`):
  - `Document.ts`, `Client.ts`, `Asset.ts`, `AdminUser.ts` — the four targets for post-save hooks.
  - `SystemStatus.ts` exists but is backup-infra metadata — exclude from hooks (would cause loop on `backup_failures` writes).
- **Next 15 `after()` / `waitUntil`**: no existing usage in repo. Next.js 15 supports `unstable_after` (stable in 15.1) for post-response work and `waitUntil` via `@vercel/functions`. Mongoose post-save hooks run inside the request handler, so fire-and-forget inside a hook is naturally post-write but blocks response unless explicitly deferred. Plan: use async post-save hooks without `await` at call sites, with try/catch writing failures to `backup_failures`. Document in phase 3.
- **Admin SDK timestamp helper**: prefer `admin.firestore.FieldValue.serverTimestamp()` for write metadata (audit fields), `admin.firestore.Timestamp.fromDate(d)` for translating MongoDB `Date` values (existing `cleanForFirestore` logic in `upload-to-firestore.cjs`).

## Open questions (need answers before / during execution)

1. **Vercel plan**: Hobby, Pro, or Fluid? Determines weekly cron feasibility.
   - Hobby: 10 s default, no extension possible on cron endpoints → need to chunk the weekly dump or stream.
   - Pro: 60 s default, `maxDuration` up to 300 s on Node functions.
   - Fluid Compute: `maxDuration` up to 800 s (with 14 min max for crons on Pro/Fluid).
   - At ~53 MB, a single-pass dump is borderline on Hobby; comfortable on Pro+Fluid. Confirm before phase 5.
2. **Keep `/api/health` cron or merge with new weekly snapshot cron?** claude-desktop leans keep-separate (different purposes/failure modes). Recommendation concurred — the snapshot route implicitly pings Mongo via `connectDB()` every write, but the dedicated health cron lives to catch Atlas pausing independently of backup outages. Decision: **keep separate**; surface for Tommy's final sign-off.
3. **First-save race during bootstrap**: `current/` mirror overwrites on every save. Bootstrap order: (a) deploy hooks in dry-run mode logging only, (b) run bootstrap script to populate `current/`, (c) flip hooks to write mode. Or: maintenance window where upload/save is disabled. Which does Tommy prefer?
4. **Service account key rotation cadence**: once the three Vercel env vars are in place, what rotation policy? 90 days? Yearly? Flag a reminder mechanism (not part of this sprint).
5. **`backup_failures` retention**: unbounded growth risk. Hard cap (e.g. 1000 most recent), TTL index, or explicit cleanup route in a later sprint?

## Phases

### Phase 1 — Bootstrap: Storage, env vars, Admin SDK init
Pre-requisite plumbing. No app behavior change yet.

- [ ] 001: Enable Firebase Storage on `docu-parse` (Tommy manual step — Firebase Console → Storage → Get Started → select nam5 region)
- [ ] 002: Generate service account key for Vercel env var use (Firebase Console → Project settings → Service accounts → Generate new private key). DO NOT commit.
- [ ] 003: Set Vercel env vars (Vercel dashboard → docu-export → Settings → Environment Variables, scope: Production + Preview):
  - `FIREBASE_PROJECT_ID=docu-parse`
  - `FIREBASE_CLIENT_EMAIL=<from key JSON>`
  - `FIREBASE_PRIVATE_KEY=<from key JSON, newlines intact>`
  - `FIREBASE_STORAGE_BUCKET=docu-parse.firebasestorage.app`
- [ ] 004: Promote `firebase-admin` from `devDependencies` to `dependencies` in root `package.json`. Run `npm install` to update lockfile.
- [ ] 005: Add `src/lib/firebase-admin.ts` — singleton Admin SDK initializer reading the three env vars, idempotent (`admin.apps.length` guard), exports `db`, `bucket`, `admin`. No-op in test environment.
- [ ] 006: Deploy Storage rules from repo. `firebase.json` already declares `storage.rules` (deny-all).
- AC:
  - `npm run build` succeeds with `firebase-admin` resolvable at runtime.
  - `import { db } from '@/lib/firebase-admin'` resolves in a throwaway test route; `db.collection('mongodb_backup').doc('healthcheck').get()` returns empty (not permission-denied).
  - `firebase deploy --only storage --project docu-parse` succeeds after Tommy enables Storage (API becomes available).
- Verify:
  - `node -e "require('firebase-admin')"` from project root → no error.
  - `grep -n firebase-admin package.json` → under `dependencies`.
  - `npx tsc --noEmit` → no errors.
  - Tommy confirms via Firebase Console that Storage bucket `docu-parse.firebasestorage.app` exists.
- Risk: service account key handling. Private key newline encoding in Vercel env vars is a known footgun (literal `\n` vs real newline). Test locally with `.env.local` before deploying.
- Rollback: remove env vars, revert `package.json`, delete `src/lib/firebase-admin.ts`. Nothing user-facing changed.

### Phase 2 — Backup helper (pure functions + tests)
Reusable write helpers consumed by hooks and weekly cron.

- [ ] 007: `src/lib/firebase-backup.ts` — exports:
  - `backupDocument(doc: AnyMongoDoc, collection: string, snapshotId: 'current' | string): Promise<void>` — writes to `mongodb_backup/{snapshotId}/{collection}/{docId}`. Uses existing `cleanForFirestore` transform (port from `scripts/backup/upload-to-firestore.cjs`).
  - `backupChunks(docId: string, chunks: ChunkDoc[], snapshotId: 'current' | string): Promise<void>` — writes raw bytes to `backups/{snapshotId}/{docId}/chunks/{n}.bin` in Firebase Storage. Content-Type `application/octet-stream`. Metadata: chunk index, length, sha256 optional.
  - `recordBackupFailure(collection: string, docId: string, err: Error): Promise<void>` — inserts into Mongoose `BackupFailure` model.
- [ ] 008: TS types co-located. Unit tests at `tests/firebase-backup.test.ts`. Mock the Admin SDK (`admin.firestore`, `admin.storage`) via vitest module mocks — do NOT hit real Firebase.
- AC:
  - Cover: successful `backupDocument` write, chunk streaming, failure path invoking `recordBackupFailure`, idempotent overwrite of `current/` path, Timestamp translation of Date fields.
  - All new tests pass; existing 246 tests still pass.
- Verify:
  - `npx vitest run tests/firebase-backup.test.ts --reporter=verbose` → all green.
  - `npx vitest run` → 246 + new tests green.
  - `npx tsc --noEmit` → no errors.
- Risk: Admin SDK tree-shaking / mock surface drift between versions. Keep mock tight.
- Rollback: delete `src/lib/firebase-backup.ts` and the test file.

### Phase 3 — Mongoose post-save hooks (wired, behind a flag)
Hooks live on schemas; behavior gated by `BACKUP_ENABLED` env var so phase 3 can merge without flipping prod.

- [ ] 009: Add `BACKUP_ENABLED` env var (boolean). Default `false` locally, `false` in Vercel until bootstrap complete.
- [ ] 010: Add post-save hooks to `src/models/Document.ts`, `Client.ts`, `Asset.ts`, `AdminUser.ts`:
  ```ts
  schema.post('save', async function (doc) {
    if (process.env.BACKUP_ENABLED !== 'true') return;
    try {
      await backupDocument(doc.toObject(), <collection>, 'current');
      if (<collection> === 'documents' && doc.gridfsId) {
        const chunks = await mongoose.connection.db.collection('documents.chunks').find({ files_id: doc.gridfsId }).toArray();
        await backupChunks(doc._id.toString(), chunks, 'current');
      }
    } catch (err) {
      await recordBackupFailure(<collection>, doc._id.toString(), err);
    }
  });
  ```
- [ ] 011: `Document.ts` hook additionally mirrors `documents.files` + `documents.chunks` (the GridFS sibling records). Same for `Asset.ts` if assets own GridFS files.
- [ ] 012: Hooks run async but the model `.save()` call does NOT `await` them — use the non-awaiting `.post('save', fn)` without returning a promise? NOTE: Mongoose post-save hooks that are `async` are awaited by `.save()` by default. Wrap hook body in `setImmediate(() => { /* hook body */ })` or use `process.nextTick` to truly defer, OR accept the latency and document. Investigate before coding. Default plan: defer via `setImmediate` and catch errors inside — response path stays fast.
- AC:
  - With `BACKUP_ENABLED=false`, all 246 existing tests continue to pass; `.save()` latency is unchanged.
  - With `BACKUP_ENABLED=true`, a new integration test saves a Document, asserts `backupDocument` was called with the correct args (mocked), asserts `recordBackupFailure` invoked on thrown error from mock.
  - BOL upload flow (dashboard → upload → save) end-to-end time does not regress more than 50 ms in the instrumented case (`BACKUP_ENABLED=false`). No blocking wait on Firebase.
- Verify:
  - `BACKUP_ENABLED=false npx vitest run` → 246 tests green.
  - `BACKUP_ENABLED=true npx vitest run tests/backup-hooks.test.ts` → new tests green.
  - Manual: run dev server with `BACKUP_ENABLED=true` + mocked SDK, upload a test PDF, inspect logs for hook execution order.
- Risk: **highest risk phase**. A bad hook can block every save or silently drop data. Explicit try/catch per hook, never throw out of a post-save hook. Instrument with console.log at phase end for at least the first week in prod.
- Rollback: set `BACKUP_ENABLED=false` in Vercel (instant) or revert the schema files. The hook guards on the env var so rollback is zero-deploy.

### Phase 4 — Failure surfacing
Minimal infra so failures are forensically inspectable. No UI.

- [ ] 013: `src/models/BackupFailure.ts` — Mongoose schema: `{ collection: string, docId: string, error: string, stack?: string, retryCount: number (default 0), createdAt: Date }`. TTL index on `createdAt` with 90-day expiry (bounds growth).
- [ ] 014: Unit test that `recordBackupFailure` creates the document correctly.
- [ ] 015: `scripts/backup/list-failures.cjs` — local read-only tool printing recent failures from MongoDB (for Tommy to inspect). Gitignored under existing rule.
- AC:
  - Failure docs appear in MongoDB `backupfailures` collection when hook throws.
  - TTL index present (`db.backupfailures.getIndexes()` shows `expireAfterSeconds`).
  - `npx vitest run` remains green.
- Verify:
  - `npx vitest run tests/backup-failure.test.ts` → green.
  - Manual: force a hook failure (mock Firebase to throw) with `BACKUP_ENABLED=true`, confirm failure record appears.
- Risk: unbounded growth without TTL. Addressed by TTL index + 90-day cap.
- Rollback: drop the `backupfailures` collection; delete the model file.

### Phase 5 — Weekly PIT snapshot cron
Self-healing PIT. Single endpoint, single cron, watch the timeout.

- [ ] 016: `src/app/api/cron/backup-snapshot/route.ts`:
  - Bearer-auth on `CRON_SECRET` (match `/api/health` pattern).
  - Sets `export const maxDuration` per phase-5 risk decision (see open question #1).
  - Iterates the four collections + GridFS; writes each doc via `backupDocument(doc, coll, snapshotId)` with `snapshotId = new Date().toISOString().slice(0,10)`.
  - Streams chunk bytes directly to Storage — avoid buffering the full 52 MB in memory.
  - Retention cleanup at end: list `mongodb_backup/*` collections via Admin SDK, delete snapshots older than the 8th most recent (keep last 8 weekly). Mirror cleanup in Storage under `backups/<date>/`.
  - Returns JSON summary: `{ snapshotId, collections: {...counts}, chunks: N, bytes: N, durationMs: N, cleaned: [...] }`.
- [ ] 017: `vercel.json` — add second cron entry. **Do NOT merge with `/api/health`** (decision #2):
  ```json
  {
    "crons": [
      { "path": "/api/health", "schedule": "0 0 * * 0" },
      { "path": "/api/cron/backup-snapshot", "schedule": "0 8 * * 0" }
    ]
  }
  ```
  (03:00 CDT = 08:00 UTC Sundays.)
- [ ] 018: Feasibility check before shipping — time a bootstrap dry-run locally (no network); if >10 s and Vercel plan is Hobby, implement chunked resume (checkpoint last-completed-docId in `backup_state` MongoDB doc, resume on next invocation, add `?resume=1` query param manual trigger).
- AC:
  - Endpoint returns 401 without bearer token, 401 with wrong token, 200 with correct token.
  - Single cron run produces `mongodb_backup/{date}/` with all six subcollections populated and corresponding Storage chunks.
  - After 9 successful weekly runs, only the latest 8 remain.
  - Total duration < `maxDuration` for chosen plan.
- Verify:
  - `curl -sS -H "Authorization: Bearer $CRON_SECRET" https://www.txwos-docs.fyi/api/cron/backup-snapshot | jq .` (manual, post-deploy) — summary returned.
  - Firebase Console → `mongodb_backup/{today's date}/` populated.
  - Firebase Console → Storage → `backups/{today's date}/` populated.
- Risk: **10 s Hobby timeout** at 53 MB, **Vercel Hobby commercial-use ToS** — flag both in risk register. Mitigations: streaming upload, resume on timeout, or require Pro/Fluid.
- Rollback: remove cron entry in `vercel.json` and redeploy. Route stays (harmless without cron trigger). Old snapshots stay (read-only).

### Phase 6 — Restore script (local-only)
One command to reconstruct MongoDB from Firestore + Storage.

- [ ] 019: `scripts/backup/firestore-to-mongodb.cjs` (gitignored):
  - CLI flags: `--date=current|YYYY-MM-DD` (required), `--dry-run`, `--target-uri=<MONGODB_URI>` (required for safety — never read default env to avoid accidentally overwriting prod).
  - Loads service account from `scripts/backup/service-account-key.json` or `$GOOGLE_APPLICATION_CREDENTIALS` (mirror `upload-to-firestore.cjs` pattern).
  - For each of the four collections + `*.files`, reads all docs under `mongodb_backup/{date}/{collection}/`, reconstructs `_id` / `$oid`, writes to target MongoDB via Mongoose raw collection API.
  - For `documents.chunks` and `assets.chunks`: streams Storage `backups/{date}/{docId}/chunks/*.bin` → inserts chunk docs with correct `files_id` linkage.
  - `--dry-run` prints what would be written without touching MongoDB.
- [ ] 020: `scripts/backup/verify-restore.cjs` (gitignored) — diff helper: counts per collection + sha256 of a random-sample chunk against the source.
- AC:
  - `--dry-run` against `--date=2026-04-21` prints expected insert counts matching the source dump.
  - Restore to a throwaway local MongoDB (e.g. `mongodb://localhost:27017/docu-restore-test`) produces identical doc counts and byte-identical chunks (sha256 match).
- Verify:
  - `node scripts/backup/firestore-to-mongodb.cjs --date=current --target-uri=mongodb://localhost:27017/drtest --dry-run` → expected summary.
  - `node scripts/backup/verify-restore.cjs --source=... --target=mongodb://localhost:27017/drtest` → PASS.
- Risk: restore to wrong URI. Mitigation: require explicit `--target-uri`, refuse to run if URI contains the prod hostname `cluster0.4lyb9.mongodb.net`.
- Rollback: delete the scripts; drop the test DB.

### Phase 7 — Bootstrap run
One-time manual population of `current/` + `backups/current/` before hooks go hot.

- [ ] 021: Tommy runs the existing refactored `upload-to-firestore.cjs` against the latest local dump for metadata → writes to `mongodb_backup/current/` (requires minor flag add: `--snapshot=current` to override default date-based path).
- [ ] 022: New `scripts/backup/upload-chunks-to-storage.cjs` (gitignored) — bulk uploads chunks from `backups/{date}/*.chunks.json` to Firebase Storage `backups/current/{docId}/chunks/*.bin`. Uses Admin SDK + local service account key.
- [ ] 023: Verify `current/` matches live MongoDB via a read-only compare script.
- AC:
  - Firestore shows `mongodb_backup/current/*` populated; Storage shows `backups/current/*` populated.
  - Doc/chunk counts match the source backup directory.
- Verify:
  - Firebase Console visual inspection.
  - `node scripts/backup/verify-restore.cjs --source=... --firestore=current` → PASS.
- Risk: race if prod saves land between the manual upload and hook activation. Mitigation: use a maintenance window (Vercel protection bypass → site offline ~10 minutes), or run hooks in dry-run mode first (phase 3 AC already accommodates).
- Rollback: manually delete `mongodb_backup/current/` from Firestore and `backups/current/` from Storage.

### Phase 8 — End-to-end DR drill
Real restore to a real MongoDB instance.

- [ ] 024: Stand up a local MongoDB instance (Docker: `docker run -d -p 27017:27017 mongo:7`) and/or a free MongoDB Atlas M0 test cluster.
- [ ] 025: Run `firestore-to-mongodb.cjs --date=current --target-uri=<test>` → restore.
- [ ] 026: `verify-restore.cjs` compares: doc counts per collection, sha256 of random 10% chunk sample, Mongoose schema roundtrip (load each Document via the app's model, assert no validation errors).
- [ ] 027: Run app against restored DB (`MONGODB_URI=<test> npm run dev`), open dashboard, open an existing BOL, regenerate COO — confirm it produces byte-identical PDF to a pre-drill baseline.
- AC:
  - 100% doc count match per collection.
  - 100% sha256 match on sampled chunks.
  - COO regeneration produces identical PDF (or at least identical metadata/layout).
- Verify:
  - Scripted diff report committed to the branch (or archived under `.spectra/logs/dr-drill-*`).
- Risk: none beyond normal testing. This phase is the payoff — if it fails, find the gap before trusting the system.
- Rollback: drop the test DB; no prod impact.

### Phase 9 — Hygiene + credential sweep
Tidy up surfaced issues so they don't regress.

- [ ] 028: `scripts/backup/backup-database.js` — replace hardcoded `MONGODB_URI` default (contains real Atlas password) with `throw` if env var unset. File is gitignored; change still worthwhile as future-proofing.
- [ ] 029: Document in the plan or a `.spectra/dr-runbook.md`: manual restore procedure, how to rotate service account, what to do when weekly cron fails 2x in a row.
- [ ] 030: Flag for separate task (do NOT fix here): BOM / UTF-16 artifact at line 1 of `backup-database.js` making the file visually garbled in editors. File still runs because Node is permissive, but it's confusing.
- AC:
  - `grep "mongodb+srv://.*:.*@" scripts/backup/backup-database.js` → no match.
  - Runbook exists and is committed to `.spectra/`.
- Verify:
  - Above grep + file exists check.
- Risk: low.
- Rollback: revert the two files.

## Risk register (consolidated)

| # | Risk | Likelihood | Impact | Mitigation |
|---|------|------------|--------|------------|
| R1 | 10 s Vercel Hobby timeout on full weekly dump | HIGH if Hobby | HIGH | Streaming upload + chunked resume (phase 5.018) OR require Pro/Fluid plan |
| R2 | Vercel Hobby commercial-use ToS non-compliance | EXTERNAL | HIGH | Flag to Tommy; resolution = plan upgrade, unrelated to DR work |
| R3 | Hook blocks `.save()` response → user-facing latency regression | MEDIUM | HIGH | `setImmediate`/fire-and-forget, never `await` hook body; latency test in AC |
| R4 | Hook throws → save fails or data silently lost | MEDIUM | CRITICAL | try/catch per hook + `recordBackupFailure`; hook NEVER rethrows |
| R5 | First-save race during bootstrap | MEDIUM | MEDIUM | Dry-run-mode-first deploy (phase 3 env flag), or maintenance window (phase 7) |
| R6 | Service account key leaked via env var logging / crash dump | LOW | CRITICAL | Standard Vercel env var hygiene; rotate on suspected exposure; no key in error messages |
| R7 | Service account key rotation forgotten | MEDIUM over time | MEDIUM | Calendar reminder; documented in runbook (phase 9) |
| R8 | `backup_failures` growth unbounded | LOW | LOW | TTL index in schema (phase 4) |
| R9 | Restore script run against prod MongoDB by accident | LOW | CATASTROPHIC | `--target-uri` required, host-blocklist for prod cluster (phase 6.019) |
| R10 | Firebase Storage bill runaway (e.g. bug writes loop) | LOW | MEDIUM | Billing alert at $5 on docu-parse; 8-week retention cleanup in phase 5 |
| R11 | Firestore writes concentrating on hot `current/` doc keys hit contention | LOW | LOW | Per-doc keys already hash-distributed via ObjectId; not a pattern Firestore flags unless >1 write/sec per doc |

## Rollback strategy (overall)

- Every phase is independently revertible. Phases 1–2 are no-ops behind unused code. Phases 3+ guard on `BACKUP_ENABLED`.
- Emergency off switch: set `BACKUP_ENABLED=false` in Vercel env vars. Takes effect on next cold start (~seconds).
- Full undo: revert the merge commits for the feature branch; redeploy. No user-facing schema changes (only internal hooks).

## Sequencing

Phases 1 → 2 → 3 → 4 are serial (each depends on the prior).
Phase 5 can start after phase 2 and run in parallel with phases 3–4.
Phase 6 can start any time after phase 2.
Phase 7 requires phases 1, 2, 3 (dry-run capable).
Phase 8 requires phases 2, 6, 7.
Phase 9 is independent; do last or in parallel.

Estimated effort (rough): 1–2 days for phases 1–4, 1 day for phase 5, 1 day for phase 6, 0.5 day for phase 7, 1 day for phase 8, 0.25 day for phase 9. Call it ~5 engineering days for one developer.
