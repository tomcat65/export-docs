# docu-parse DR Path 2 — Execution Plan (v2)
# Project: docu-export | Level: 3 | Track: spectra | Branch: feat/dr-path2-plan-v2

## Goal

Turn the `mongodb_backup` Firestore mirror into a genuine DR fallback via schema-level Mongoose middleware with diff-aware sync, a weekly Firebase scheduled Function as the authoritative recovery primitive, a reversible restore script, and an end-to-end recovery drill — all staying on Atlas M0 / Vercel Hobby.

## Architectural delta from v1

v1 (branch `feat/dr-path2-plan`, commit `e7c3dee`) was codex-audited (msg `5d46487e`) — RED on phases 3/5/6/7. v2 supersedes v1 without amending it.

- **Replaces v1 constitution item 1** (post-save hooks only): now schema-level Mongoose middleware covering `post('save')` + query middleware (`findOneAndUpdate`, `updateOne`, `findOneAndDelete`). Closes the query-write coverage gap (R12) structurally.
- **New constitution item**: diff-aware sync with `fileId` rotation cleanup. Addresses R13 (stale `*.files` docs + Storage chunks on file replacement) — without this, `current/` drifts indefinitely.
- **Phase 5 runtime moves off Vercel**: weekly PIT runs on Firebase scheduled Functions Gen 2 (1800 s timeout, `timeZone`, retry). `/api/health` cron stays on Vercel unchanged.
- **All ten codex v1 findings landed** (see Carry-forward fixes below).

## Constitution (locked by claude-desktop / Tommy — do not revisit)

1. **Schema-level Mongoose middleware** (not route-level calls, not per-save-only) on `src/models/Document.ts`, `Client.ts`, `Asset.ts`, `AdminUser.ts`:
   - `post('save')` — covers `.save()` + `Model.create()`.
   - `pre`/`post` on `findOneAndUpdate`, `updateOne`, `findOneAndDelete`. Mongoose 8 aliases `findByIdAndUpdate` → `findOneAndUpdate` and `findByIdAndDelete` → `findOneAndDelete` automatically — covered.
   - Use `this.getFilter()` / `this.getUpdate()` in query middleware; for post-image, issue an explicit `Model.findOne(this.getFilter())` after the update.
   - Future guardrails: middleware stubs for `insertMany` / `bulkWrite` (no current hot paths, fail-closed safety net).
2. **Diff-aware sync.** Pre-hooks snapshot pre-image where a delete or `fileId` rotation is possible; post-hooks re-fetch post-image; mirror logic diffs `old.fileId` vs `new.fileId`. On rotation: write new Firestore `*.files` doc + new Storage chunks, **delete** old Firestore `*.files` doc + all Storage chunks under the old `fileId`. Non-negotiable — without this, `current/` drifts permanently on every PL/COO regeneration or file replacement.
3. **Admin SDK from Next.js runtime** via Vercel env vars (`FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`, `FIREBASE_STORAGE_BUCKET`). Assembled via `admin.credential.cert()` at init. `FIREBASE_PRIVATE_KEY` is stored escaped and MUST be decoded with `.replace(/\\n/g, '\n')` at init (Vercel env var newline footgun). Separate from the local `scripts/backup/service-account-key.json` used only by manual scripts.
4. **Rolling `current/` mirror**: `mongodb_backup/current/{collection}/{docId}` in Firestore. Overwritten on every write. Reflects latest MongoDB state at the moment of the last mirrored write (modulo timeouts / drift captured in `backup_failures`).
5. **Firebase Storage for binary chunks**: `backups/current/{docId}/chunks/{n}.bin` in bucket `docu-parse.firebasestorage.app` (location **US-EAST1** — verified existing, not nam5 as v1 assumed). Storage rules deny-all; Admin SDK bypasses.
6. **Weekly PIT snapshots on Firebase scheduled Functions Gen 2** (not Vercel cron): `functions/src/scheduled/backupSnapshot.ts` runs Sunday 03:00 America/Chicago, `timeZone: 'America/Chicago'`, `timeoutSeconds: 1800`, `retry: true`. Writes `mongodb_backup/{YYYY-MM-DD}/...` + `backups/{YYYY-MM-DD}/...`. Retention: **keep the last 8 dated snapshots** (exclude `current/` from ordering) via recursive subcollection deletion. `/api/health` Vercel cron stays as-is.
7. **`backup_failures` MongoDB collection** captures silent hook failures (collection, docId, operation, error, retryCount, createdAt). **90-day TTL index + 1000-row hard cap enforced in code** via `recordBackupFailure()` (post-insert: if `db.backupfailures.countDocuments() > 1000`, delete oldest N). Canonical collection name: `backupfailures` (Mongoose auto-pluralization of `BackupFailure` model) — referenced everywhere as `backupfailures`.
8. **Restore script local-only**: `scripts/backup/firestore-to-mongodb.cjs`, Admin SDK + local service account key. Target URI via `--target-uri` CLI flag with **localhost / test-URI allowlist** (not prod-host blocklist — R9 refinement). Explicit `dbName: 'docu-export'` passed to Mongoose connection (matches `src/lib/db.ts:26`). Never runs in production.
9. **Deny-all Firestore rules stay deployed** (commit `52c6f26`). Admin SDK from all backup paths bypasses.
10. **Option A bootstrap**: `BACKUP_ENABLED=false` default. Deploy middleware + helpers, run one-time manual bootstrap populating `mongodb_backup/current/*` + `backups/current/*`, then flip `BACKUP_ENABLED=true`. Bootstrap race window is mitigated by a documented maintenance window covering dump creation → upload → flag flip (R5 refinement).
11. **Service account key rotation: yearly**, calendar-triggered, documented in runbook. Rotation procedure: generate new key in Firebase Console, update Vercel env vars (Production + Preview), redeploy, disable old key, delete after 14-day grace.
12. **No Atlas M10 / no Vercel Pro** — staying on free tiers.
13. **OAuth / lineitems / BOM-corruption-in-backup-database.js** are explicitly out of scope for this plan (separate work).

## Investigation findings

Carries forward everything from v1 investigation plus new facts from v2 bootstrap:

### From v1 (re-verified against main @ `fff3e92`)

- Next.js 15.1.9, React 19, Mongoose 8. 246/246 tests on main. Production at https://txwos-docs.fyi live.
- GridFS scale (from `backups/2026-04-21/`): 75 documents + 75 `documents.files` + 240 `documents.chunks`, 2 clients, 4 admin users, 6 assets + 6 `assets.files`. ~53 MB per full metadata+chunks snapshot. 8-week retention → ≈425 MB steady-state (trivially below Spark free tier).
- Existing Vercel cron (`vercel.json`): `{ "path": "/api/health", "schedule": "0 0 * * 0" }` with `Authorization: Bearer <CRON_SECRET>` pattern. Stays unchanged.
- `firebase-admin@^13.7.0` is in root `devDependencies` — **must be promoted to `dependencies` for Next.js runtime** (Phase 1 pre-req). `functions/package.json` has its own copy; unaffected.
- Mongoose model surface: `Document.ts`, `Client.ts`, `Asset.ts`, `AdminUser.ts` — four targets. `SystemStatus.ts` excluded from plugin (infra metadata; hooking it would loop on `backup_failures` writes).

### New for v2 (from code re-read + 2026-04-21 bench)

- **Firebase Storage bucket `docu-parse.firebasestorage.app` already exists**, created 2026-04-21 03:03 UTC, location **US-EAST1** regional. `firebasestorage.googleapis.com` enabled. This changes v1 Phase 1.001 from "Tommy enables Storage" to "confirm bucket + region already live." See Open Questions for region lock-in.
- **Cloud Functions Gen 2 infrastructure already present** on `docu-parse`: deployment buckets `gcf-v2-sources-723054079241-us-central1` + `gcf-v2-uploads-723054079241...` in `us-central1`. Existing `functions/` codebase in repo deploys there. No new region work needed for Phase 5.
- **Schema field is `fileId`, not `gridfsId`** (v1 error at line 106): `src/models/Document.ts:57` and `src/models/Asset.ts:7`. Every plan reference updated.
- **Cross-region Functions ↔ Storage**: Functions in `us-central1` reading/writing Storage in `us-east1` incurs ~10–30 ms RTT per API call + egress cost ($0.01/GB inter-region). At 53 MB/week weekly, ~$0.001/week egress — negligible. Flag if noticed, don't block on it.
- **`cleanForFirestore` transforms** (`scripts/backup/upload-to-firestore.cjs:128-151`): `$oid → string`, `$date → Timestamp.fromDate()`, `$base64 → '[binary-in-local-backup]'`, `__v → _v`. **Restore must reverse all four** (Phase 6 AC).
- **Hardcoded Atlas URI in `backup-to-json.cjs:13-14`** — fallback default with real credentials. File is gitignored via blanket `/scripts/*` rule but credentials-in-source-at-all is a risk. Phase 9 sweeps both this file and `backup-database.js`.
- **Query-write coverage** (codex grep, active code): `src/app/api/clients/[id]/route.ts:69`, `src/app/api/documents/[id]/generate/pl/route.ts:646`, `src/app/api/documents/[id]/upload-associated/route.ts:174`, `src/app/api/documents/[id]/update-details/route.ts:70`, `src/app/api/documents/[id]/update-carrier-ref/route.ts:70`, `src/lib/auth.ts:58`, `src/app/api/admin/route.ts:75`. All covered structurally by query middleware — no per-route calls needed.
- **Delete paths** (codex grep): `src/app/api/documents/[id]/route.ts:102`, `src/app/api/assets/[id]/route.ts:58`, `src/app/api/admin/route.ts:75`. Covered by `findOneAndDelete` middleware.

### Hot-path latency measurement (Phase 4 sub-question, resolved with data)

Benchmark run 2026-04-21 from WSL (residential US) → `docu-parse` in US-EAST1, using the existing service account key, 10 iterations per test, ephemeral `mongodb_backup/_latency_test/` + `backups/_latency_test/` paths (cleaned up after):

| Operation | p50 | p95 | Notes |
|---|---|---|---|
| Firestore `Document` write (~2 KB) | 153 ms | 251 ms | Representative metadata doc |
| Firestore `documents.files` sibling (~500 B) | 116 ms | 423 ms | Smaller sibling record |
| Storage chunk write (225 KB, non-resumable) | 233 ms | 329 ms | Per-chunk upload |
| **Full `fileId` rotation** (files + 3 new chunks write + 1 files + 3 stale chunks delete) | **616 ms** | 736 ms | Worst-case steady-state |

Estimate for a representative single-save with 3 parallel chunks: **~500 ms median from WSL**.

**Projected Vercel → Firebase latency** (intra-GCP, same network fabric as us-east1 Vercel edge/lambda region): typically 40–70 % lower than WSL residential. Expected p95: ~150–250 ms single save, ~300–400 ms rotation. Will re-measure in Phase 1 AC once Admin SDK is wired from Vercel.

### Posture proposal: synchronous-with-failure-tolerance (sync-with-catch)

Neither of the two framings offered is optimal:

- **Pure sync-in-hook** (save aborts on backup failure) violates "DR must never block primary write." A transient Firestore blip would fail user-facing saves.
- **Pure best-effort fire-and-forget** has the serverless-freeze risk explicitly called out in the semantics note: Vercel can freeze before detached work + its own failure log write finishes.

Proposed posture threads both:

- Hooks are `async`, awaited by Mongoose 8 (per official docs, `async post('save', fn)` with <2 params IS awaited). No `setImmediate` hack.
- Hook body wrapped in `try { await Promise.race([backup(), timeout(500)]) } catch (err) { await recordBackupFailure(...) }`. Timeout via `AbortSignal`; Firestore + Storage v13+ respect `AbortSignal`.
- Hook **never throws** — all errors caught and written to `backupfailures` synchronously before hook returns. Primary save never aborted by DR.
- Weekly PIT snapshot is the authoritative recovery primitive; it reconciles timeouts and transient failures within 7 days (RPO = 7 days for failed syncs, ~200 ms typically for successful syncs).

Latency cost: bounded ~500 ms p95 added per save (actual p95 expected 200–300 ms from Vercel us-east1 once measured). For BOL upload (Claude API already 3–8 s), this is noise. For admin login / session refresh (`auth.ts:58`, ~200 ms base), this is ~2× slowdown but survivable and deterministic.

Why **not** `@vercel/functions.waitUntil` or Next.js `unstable_after`: both require route-handler integration (pass `ctx` into every write route, drain pending hook promises before return). That reopens Path A's route-by-route tax that the middleware architecture specifically eliminates. Keeping all DR work inside the hook is structurally cleaner — the middleware is the sole DR surface.

## Open questions (flagged for Tommy; do not block Phase 1 start)

1. **Storage bucket region (US-EAST1) lock-in.** Bucket location is immutable. v1 assumed nam5 (multi-region, ~$0.026/GB/month). Codex suggested us-central1. Actual: US-EAST1 single-region ($0.023/GB/month). At 425 MB steady-state, cost delta across options is <$0.01/month — trivial. Cross-region RTT from Functions (us-central1) to Storage (us-east1): ~10–30 ms per API call. Acceptable. **Keep as-is unless Tommy wants to recreate.**
2. **Posture lock-in.** Proposal above is sync-with-catch + 500 ms timeout. Confirm after Phase 1 AC re-measurement from actual Vercel runtime, before Phase 3 turns on `BACKUP_ENABLED=true`.
3. **Maintenance window for bootstrap** (Phase 7). Dump → upload → flag flip covers the race. Acceptable to put the site into Vercel deployment protection / password-gate for ~15 minutes on a Sunday? Or prefer to stagger and accept bounded drift that PIT catches?
4. **Separate `functions/` project or same folder?** Existing `functions/` codebase handles BOL extraction (Claude API). Adding the scheduled function there co-locates deployment (one `firebase deploy --only functions`). Ok to mix or prefer new folder? Recommend: same folder, separate file `functions/src/scheduled/backupSnapshot.ts`.

## Phases

Each phase: Tasks → Acceptance Criteria → Verify commands → Risks → Rollback. No `curl localhost` in Verify (no dev server during execution).

### Phase 1 — Bootstrap: Storage + env vars + Admin SDK init

Pre-requisite plumbing. No app behavior change yet. `BACKUP_ENABLED` defaults false.

- [ ] 001: Confirm Firebase Storage bucket `docu-parse.firebasestorage.app` exists + region. Already verified 2026-04-21 via `gcloud storage buckets list --project docu-parse`. No-op if confirmed; else enable via Firebase Console.
- [ ] 002: Generate service account key in Firebase Console → Project settings → Service accounts → Generate new private key. **Do NOT commit.** One-off local download.
- [ ] 003: Set four Vercel env vars (Production + Preview scope):
  - `FIREBASE_PROJECT_ID=docu-parse`
  - `FIREBASE_CLIENT_EMAIL=<from key JSON>`
  - `FIREBASE_PRIVATE_KEY=<from key JSON, newlines escaped as \n>`
  - `FIREBASE_STORAGE_BUCKET=docu-parse.firebasestorage.app`
- [ ] 004: Promote `firebase-admin` from `devDependencies` to `dependencies` in root `package.json`. `npm install` updates lockfile.
- [ ] 005: Add `src/lib/firebase-admin.ts` — singleton initializer, idempotent (`admin.apps.length` guard), exports `{ db, bucket, admin }`. **Explicit newline decode** for `FIREBASE_PRIVATE_KEY`: `privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')`. No-op branch when `process.env.NODE_ENV === 'test'` and key missing (prevents unit tests from hitting real Firebase).
- [ ] 006: Deploy Storage rules (already deny-all in `storage.rules`): `firebase deploy --only storage --project docu-parse`.
- AC:
  - `npm run build` succeeds with `firebase-admin` resolvable at runtime.
  - `gcloud storage buckets describe gs://docu-parse.firebasestorage.app --project docu-parse` returns location `US-EAST1`.
  - `node -e "require('firebase-admin')"` from project root → no error.
  - `grep -n firebase-admin package.json` → appears under `dependencies`, not `devDependencies`.
  - `npx tsc --noEmit` → no errors.
  - Re-run latency bench from Vercel runtime (one-shot probe route, removed after measurement): p95 values reported to `backup_failures` once threshold proposal data available.
- Verify:
  - `grep -A1 '"dependencies"' package.json | grep firebase-admin`
  - `npx tsc --noEmit 2>&1 | head`
  - `firebase deploy --only storage --project docu-parse`
  - `gcloud storage buckets list --project docu-parse --format="value(name,location)" | grep docu-parse.firebasestorage.app`
- Risk: `FIREBASE_PRIVATE_KEY` newline corruption via Vercel env UI. Mitigation: newline decode in init (item 005); verify with a temporary probe route that logs `db.collection('_init_probe').doc('test').get()` status in first deploy, removed immediately after.
- Rollback: remove env vars, revert `package.json`, delete `src/lib/firebase-admin.ts`. No user-facing surface changed.

### Phase 2 — Backup helper (pure functions + tests)

Reusable write/cleanup primitives consumed by the plugin and the weekly Function.

- [ ] 007: `src/lib/firebase-backup.ts` exports:
  - `backupDocument(doc: AnyMongoDoc, collection: string, snapshotId: 'current' | string): Promise<void>` — Firestore write to `mongodb_backup/{snapshotId}/{collection}/{docId}`. Uses ported `cleanForFirestore` (same transforms as `upload-to-firestore.cjs:128-151`).
  - `backupFilesDoc(filesDoc: AnyMongoDoc, collection: 'documents.files' | 'assets.files', snapshotId: 'current' | string): Promise<void>`.
  - `backupChunks(docId: string, fileId: string, chunks: ChunkDoc[], snapshotId: 'current' | string): Promise<void>` — streams `bucket.file(path).save(bytes, { resumable: false, contentType: 'application/octet-stream' })` per chunk. Path: `backups/{snapshotId}/{docId}/chunks/{n}.bin`.
  - `cleanupStaleFileId(docId: string, oldFileId: string, collection: 'documents' | 'assets', snapshotId: 'current' | string): Promise<void>` — deletes old Firestore `*.files` docs + all Storage chunks under `backups/{snapshotId}/{docId}/chunks/` whose metadata.fileId matches `oldFileId`. **Diff-aware cleanup, non-negotiable.**
  - `recordBackupFailure(entry: { collection, docId, operation, error, stack? }): Promise<void>` — inserts into `BackupFailure` model, then enforces 1000-row cap (`countDocuments()` + `find().sort({createdAt:1}).limit(N).deleteMany()`). Cap enforcement is explicit code, not hand-waved.
- [ ] 008: TS types co-located. `tests/firebase-backup.test.ts` — mock `admin.firestore`, `admin.storage` via vitest module mocks. Do NOT hit real Firebase in unit tests.
- AC:
  - Test coverage: successful write path, chunk streaming, failure path invoking `recordBackupFailure`, idempotent `current/` overwrite, `Timestamp.fromDate()` translation of `Date`, `__v → _v` rename, `cleanupStaleFileId` deletes exactly matching old chunks and leaves new chunks untouched.
  - 246 existing tests still pass; new tests pass.
- Verify:
  - `npx vitest run tests/firebase-backup.test.ts --reporter=verbose`
  - `npx vitest run`
  - `npx tsc --noEmit`
- Risk: Admin SDK mock surface drift across versions. Mitigation: mock narrowly (only the methods called); pin `firebase-admin` in `dependencies`.
- Rollback: delete `src/lib/firebase-backup.ts` + test file.

### Phase 3 — Mongoose middleware plugin (diff-aware, gated by `BACKUP_ENABLED`)

The DR coverage surface. Behavior gated by env var so Phase 3 merges dark.

- [ ] 009: Add `BACKUP_ENABLED` env var (boolean). Default `false` locally, `false` in Vercel until Phase 7 bootstrap complete.
- [ ] 010: Add `src/lib/backup-plugin.ts` — a Mongoose plugin: `backupPlugin(schema, { collection, hasFiles })` where `hasFiles: true` enables `fileId` rotation logic (Document, Asset). Installs:
  - `schema.post('save', async function(doc) { ... })` — non-rotation path: mirror doc + sibling files + chunks to `current/`.
  - `schema.pre('findOneAndUpdate', async function() { if (hasFiles) this._backup_pre = await this.model.findOne(this.getFilter()).lean(); })`.
  - `schema.post('findOneAndUpdate', async function() { ... })` — re-fetch post-image, diff `pre.fileId` vs `post.fileId`, on mismatch call `cleanupStaleFileId(post._id, pre.fileId, ...)` + `backupFilesDoc(post, ...)` + `backupChunks(post._id, post.fileId, ..., 'current')`.
  - Same pattern for `updateOne`.
  - `schema.pre('findOneAndDelete', async function() { this._backup_pre = await this.model.findOne(this.getFilter()).lean(); })`.
  - `schema.post('findOneAndDelete', async function() { ... })` — delete mirror doc + sibling files + all chunks for that `fileId`.
  - **Stubs** (log-and-ignore for now, fail-closed guardrail) for `insertMany`, `bulkWrite` — log a warning if `BACKUP_ENABLED=true` and this hook fires, so future code using these APIs surfaces the coverage gap.
  - Every hook body wrapped in: `if (process.env.BACKUP_ENABLED !== 'true') return; try { await Promise.race([doBackup(), sleepThenThrow(500)]) } catch (err) { await recordBackupFailure({...}) }`.
  - Hooks **never throw** — all errors routed to `backupfailures`, primary save never aborted.
- [ ] 011: Apply plugin in `src/models/Document.ts` with `hasFiles: true`, `Client.ts` with `hasFiles: false`, `Asset.ts` with `hasFiles: true`, `AdminUser.ts` with `hasFiles: false`. `SystemStatus.ts` + any `BackupFailure` model get NO plugin (prevents write loops).
- [ ] 012: Integration test at `tests/backup-plugin.test.ts` — uses `mongodb-memory-server` (already in the repo's testing stack? verify; if not, add as devDep), mocks `firebase-admin`, exercises:
  - `.save()` mirrors correctly.
  - `findByIdAndUpdate` (aliases to `findOneAndUpdate`) triggers both pre + post hooks; fileId rotation cleans stale chunks; non-rotation update doesn't touch chunks.
  - `findByIdAndDelete` (aliases to `findOneAndDelete`) removes mirror doc + files + chunks.
  - Hook error → `recordBackupFailure` called, save returns successfully.
  - Timeout (force `Promise.race` timeout side to win via mock delay >500 ms) → `recordBackupFailure` called, save returns successfully.
  - `BACKUP_ENABLED=false` → zero Firebase calls, zero `backupfailures` rows.
- AC:
  - With `BACKUP_ENABLED=false`, 246 existing tests green; `.save()` latency unchanged (grep for regression).
  - With `BACKUP_ENABLED=true`, new integration tests green; forced backup failure → `backupfailures` row created, save still returns 200.
  - Schema middleware fires on query API: `findByIdAndUpdate` triggers `findOneAndUpdate` hooks per Mongoose 8 aliasing.
  - `fileId` rotation: confirm old chunks deleted + new chunks written via mock call assertions.
- Verify:
  - `BACKUP_ENABLED=false npx vitest run`
  - `BACKUP_ENABLED=true npx vitest run tests/backup-plugin.test.ts`
  - `npx tsc --noEmit`
- Risk (**highest in plan**): a bad hook blocks or corrupts the save path.
  - R3 mitigation: 500 ms `Promise.race` timeout + `backupfailures` catch — hook is bounded and tolerant.
  - R4 mitigation: `try/catch` at outermost hook level — errors never escape.
  - R12 mitigation: query middleware covers all six flagged write call sites structurally.
  - R13 mitigation: diff-aware cleanup in post-update hook.
- Rollback: set `BACKUP_ENABLED=false` in Vercel (instant, zero-deploy); or revert plugin file + model `.plugin()` calls.

### Phase 4 — Failure surfacing

Minimal infra so failures are forensically inspectable.

- [ ] 013: `src/models/BackupFailure.ts` — schema: `{ collection: string, docId: string, operation: 'save' | 'update' | 'delete' | 'timeout', error: string, stack?: string, retryCount: number (default 0), createdAt: Date }`. Mongoose auto-pluralizes model name `BackupFailure` → collection `backupfailures`. TTL index: `createdAt` with `expireAfterSeconds: 90 * 24 * 3600`. **No plugin applied** to this model (would loop).
- [ ] 014: Unit test `tests/backup-failure.test.ts` covering: creation correctness, TTL index present (`indexes()` assertion), 1000-row cap trims oldest when `recordBackupFailure` called at 1001st row.
- [ ] 015: `scripts/backup/list-failures.cjs` (gitignored under `/scripts/*`) — local read-only CLI printing last N failures.
- AC:
  - `db.backupfailures.getIndexes()` shows `expireAfterSeconds: 7776000`.
  - 1000-row cap test asserts row count stays ≤ 1000 and oldest (smallest `createdAt`) is evicted.
  - 246 + new tests all green.
- Verify:
  - `npx vitest run tests/backup-failure.test.ts`
  - (Manual, post-deploy) `mongosh "$MONGODB_URI" --eval 'db.backupfailures.getIndexes()'`
- Risk: unbounded growth if cap enforcement code is bypassed by another path. Mitigation: only `recordBackupFailure` inserts to this collection; cap enforcement is inside that function; no other write path exists.
- Rollback: drop `backupfailures` collection; delete model file + test.

### Phase 5 — Weekly PIT snapshot on Firebase scheduled Functions Gen 2

Self-healing authoritative DR primitive. Runs off Vercel.

- [ ] 016: `functions/src/scheduled/backupSnapshot.ts` — Gen 2 scheduled function:
  ```ts
  export const backupSnapshot = onSchedule({
    schedule: '0 3 * * 0',
    timeZone: 'America/Chicago',
    timeoutSeconds: 1800,
    retryCount: 1,
    memory: '512MiB',
  }, async (event) => { ... });
  ```
  Body: connect to Atlas (Functions env var `MONGODB_URI`), iterate the four target collections + GridFS sibling files + chunks, stream each to `mongodb_backup/{YYYY-MM-DD}/{collection}/{docId}` + `backups/{YYYY-MM-DD}/{docId}/chunks/{n}.bin`.
- [ ] 017: **Retention cleanup** at end of function run. Delete everything **older than the 8th most recent dated snapshot**. Implementation:
  - List direct subdocs of `mongodb_backup/` via Admin SDK (parent-doc + date-named subcollections).
  - **Explicitly exclude `current/` from date ordering** (R8-like retention bug).
  - For each stale date: **recursive subcollection deletion** (Firestore parent-doc delete does NOT cascade). Use `db.recursiveDelete()` (Admin SDK helper) over the full subcollection tree.
  - Mirror in Storage: `bucket.deleteFiles({ prefix: 'backups/{date}/' })` with `force: true`.
  - Respect Storage batch list cap (1000 per page) — paginate.
- [ ] 018: Add `MONGODB_URI` to Functions runtime config: `firebase functions:secrets:set MONGODB_URI`. (Secret Manager, not plain env var — Atlas SRV URI contains password.)
- [ ] 019: Do NOT touch `vercel.json` — `/api/health` cron unchanged. Do NOT add a Vercel cron for backup-snapshot.
- AC:
  - Manual one-shot: `firebase deploy --only functions:backupSnapshot --project docu-parse` + manual trigger via `gcloud scheduler jobs run <job> --location=us-central1` → creates `mongodb_backup/{today}/` with all four collections + sibling files + Storage `backups/{today}/*` populated.
  - After 9 successful weekly runs: only 8 latest dated snapshots remain; `current/` untouched.
  - Function duration < 1800 s at 53 MB payload (expected ~2–4 min).
  - Retention cleanup: drop a 9th-oldest snapshot into Firestore manually, trigger function, confirm recursive deletion.
- Verify:
  - `firebase functions:list --project docu-parse | grep backupSnapshot`
  - `gcloud scheduler jobs list --location=us-central1 --project docu-parse | grep backupSnapshot`
  - Firebase Console → `mongodb_backup/` root shows exactly 8 dated docs (+ `current`).
  - `gcloud storage ls gs://docu-parse.firebasestorage.app/backups/` → 8 dated prefixes (+ `current`).
  - Function logs: `firebase functions:log --only backupSnapshot --project docu-parse | tail -40`.
- Risk: (R1 retired — no longer on 10 s Hobby cron.) New: function cold start + Atlas connection (~2–5 s) inside the 1800 s budget — trivial. New: function read from Atlas M0 (max 500 connections) contends with prod Next.js. Mitigation: function uses its own short-lived connection, close after.
- Rollback: `firebase functions:delete backupSnapshot --project docu-parse`. Existing snapshots stay (read-only, harmless).

### Phase 6 — Restore script (local-only, reversible transforms)

One command to reconstruct MongoDB from Firestore + Storage.

- [ ] 020: `scripts/backup/firestore-to-mongodb.cjs` (gitignored):
  - Flags: `--date=current|YYYY-MM-DD` (required), `--target-uri=<MONGODB_URI>` (required), `--dry-run`.
  - **Target allowlist** (R9 refinement): accept target URI only if it matches `^mongodb://(localhost|127\\.0\\.0\\.1|0\\.0\\.0\\.0):` OR contains `drtest|restore-test|localhost` substring. Reject anything else with an explicit error. No prod-host blocklist.
  - Loads service account key from `scripts/backup/service-account-key.json` (primary) or `$GOOGLE_APPLICATION_CREDENTIALS` (fallback); fail-fast with Console walkthrough if neither.
  - Mongoose connect with **explicit `{ dbName: 'docu-export' }`** option (matches `src/lib/db.ts:26`) — does NOT rely on URI path.
  - **Reverse transforms** (symmetric to `cleanForFirestore`):
    - Firestore `Timestamp` → `new Date(ts.toDate())` → Mongoose `Date`.
    - `_v` → `__v` (rename back).
    - Strings that parse as ObjectId for document `_id` fields → `new ObjectId(str)`.
    - Skipped-in-Firestore `[binary-in-local-backup]` placeholder → error (restore fallback is Storage chunk stream, not the Firestore marker).
  - Per-collection ordering: `adminusers`, `clients`, `assets`, `assets.files`, `assets.chunks` (streamed), `documents`, `documents.files`, `documents.chunks` (streamed).
  - Chunk streaming: `bucket.file('backups/{date}/{docId}/chunks/{n}.bin').download()` → `db.collection('documents.chunks').insertOne({ files_id, n, data: Buffer })`.
- [ ] 021: `scripts/backup/verify-restore.cjs` (gitignored) — diff: per-collection `count`, sha256 of 10 % sampled `documents.chunks` and `assets.chunks` vs source local backup dump.
- [ ] 022: Runbook entry: restore command, required env, target URI constraint.
- AC:
  - `--dry-run` against `--date=2026-04-21` prints expected insert counts matching the 2026-04-21 dump header.
  - Live restore to `mongodb://localhost:27017/drtest` produces byte-identical chunks (sha256 match on random 10 % sample) and doc counts matching source per collection.
  - Rejecting prod URIs: `node scripts/backup/firestore-to-mongodb.cjs --target-uri=mongodb+srv://user:pass@cluster0.4lyb9.mongodb.net/docu-export --date=current` exits non-zero with explicit "target not in allowlist" error.
  - Type round-trip: Mongoose model validation passes on restored docs (`Document.findOne({}).then(doc => doc.validateSync())` returns undefined — means no errors).
- Verify:
  - `node scripts/backup/firestore-to-mongodb.cjs --target-uri=mongodb+srv://blah.mongodb.net --date=current` → non-zero exit + allowlist error.
  - `node scripts/backup/firestore-to-mongodb.cjs --date=current --target-uri=mongodb://localhost:27017/drtest --dry-run` → summary printout.
  - `node scripts/backup/verify-restore.cjs --source=backups/2026-04-21 --target=mongodb://localhost:27017/drtest` → PASS.
- Risk: restore to prod (R9 catastrophic). Mitigation: allowlist regex + `--dry-run` default-off. Secondary: restore overwrites test DB. Mitigation: script refuses non-empty target unless `--force` (added as AC).
- Rollback: delete script files; drop test DB.

### Phase 7 — Bootstrap run with maintenance window

One-time manual population of `current/` + Storage, with bounded race.

- [ ] 023: Schedule Sunday maintenance window (30 min). Vercel deployment protection gate enabled (password-protect), drains in-flight requests. **Bootstrap race starts at dump creation** (R5 refinement) — cover the entire window.
- [ ] 024: Tommy runs: `node scripts/backup/backup-to-json.cjs` → dumps current MongoDB to `backups/{today}/`. Site is gated during this step.
- [ ] 025: Tommy runs (adjusted): `node scripts/backup/upload-to-firestore.cjs --snapshot=current` (flag addition — minor patch to existing script to override date-based default path with `current`).
- [ ] 026: Tommy runs new `scripts/backup/upload-chunks-to-storage.cjs --snapshot=current` (gitignored) — bulk uploads chunks from local dump to `backups/current/{docId}/chunks/*.bin`.
- [ ] 027: Verify Firestore + Storage `current/` state matches source dump (`node scripts/backup/verify-restore.cjs --source=backups/{today} --firestore=current`).
- [ ] 028: Flip `BACKUP_ENABLED=true` in Vercel env vars. Redeploy (automatic via flag change, or manual). Remove deployment protection gate. Monitor `backupfailures` for 30 min.
- AC:
  - `mongodb_backup/current/*` populated in Firestore; `backups/current/*` populated in Storage.
  - Doc counts per collection match `backups/{today}/*.json` exactly.
  - `backupfailures` is empty at T+30 min post-flip.
- Verify:
  - Firebase Console visual inspection.
  - `node scripts/backup/verify-restore.cjs --source=backups/{today} --firestore=current` → PASS.
  - `mongosh ... --eval 'db.backupfailures.countDocuments()'` → 0.
- Risk: race between dump + upload + flag if maintenance window breaks. Mitigation: window covers full bootstrap (R5 refinement). Fallback: if window can't fit, accept initial bounded drift that first weekly PIT reconciles.
- Rollback: flip `BACKUP_ENABLED=false`; delete `mongodb_backup/current/*` + `backups/current/*` from Firebase.

### Phase 8 — End-to-end DR drill

Real restore + app regression.

- [ ] 029: Stand up local MongoDB: `docker run -d -p 27017:27017 mongo:7`.
- [ ] 030: `node scripts/backup/firestore-to-mongodb.cjs --date=current --target-uri=mongodb://localhost:27017/drtest` → restore.
- [ ] 031: `node scripts/backup/verify-restore.cjs --source=backups/{today} --target=mongodb://localhost:27017/drtest` → PASS.
- [ ] 032: `MONGODB_URI=mongodb://localhost:27017/drtest npm run dev`, open dashboard, open existing BOL, regenerate PL + COO.
- [ ] 033: Diff PL + COO PDFs byte-identical to pre-drill baseline (regenerate against prod snapshot first, archive under `.spectra/logs/dr-drill-{date}/`).
- AC:
  - 100 % doc count match per collection.
  - 100 % sha256 match on 10 % sampled chunks.
  - PL + COO regen outputs byte-identical (or structurally identical — layout + metadata) to baseline.
  - Mongoose schema validation clean across all restored docs.
- Verify:
  - `diff <(sha256sum PL-baseline.pdf) <(sha256sum PL-drill.pdf)` → identical or documented difference (e.g. generation timestamp field).
  - `.spectra/logs/dr-drill-{date}/report.md` archived.
- Risk: none beyond normal testing. Payoff phase — if it fails, find the gap before trusting the system in a real disaster.
- Rollback: drop drtest DB; no prod impact.

### Phase 9 — Hygiene + credential sweep

- [ ] 034: `scripts/backup/backup-database.js` — replace hardcoded `mongodb+srv://...:...@cluster0.4lyb9.mongodb.net/...` default with `throw new Error('MONGODB_URI env var required')` when unset. File stays gitignored; still worth closing the credentials-in-source surface.
- [ ] 035: `scripts/backup/backup-to-json.cjs:13-14` — same fix: remove hardcoded fallback URI.
- [ ] 036: `.spectra/dr-runbook.md` — commit to main (NOT gitignored — operational docs). Contents: restore command, target URI allowlist, SA key rotation (yearly), Firebase Storage bucket region (us-east1 lock-in), `backupfailures` monitoring, maintenance window for bootstrap, "what to do when weekly cron fails 2× in a row" (check Function logs, rotate key if auth errors, page Tommy on 3rd failure).
- [ ] 037: Flag for separate task (explicitly NOT fixed here): BOM / UTF-16 artifact at line 1 of `backup-database.js`. File runs but is visually garbled. Tracked in runbook as known-issue.
- AC:
  - `grep -E 'mongodb(\\+srv)?://[^:]+:[^@]+@' scripts/backup/backup-database.js scripts/backup/backup-to-json.cjs` → no match.
  - `.spectra/dr-runbook.md` exists and is committed to main.
  - 246 tests still pass (no code behavior change, just constants).
- Verify:
  - The grep above.
  - `ls .spectra/dr-runbook.md`.
  - `npx vitest run`.
- Risk: low. These files are gitignored anyway; change is defense-in-depth.
- Rollback: revert the two files.

## Risk register

| # | Risk | Likelihood | Impact | Mitigation | Residual |
|---|------|------------|--------|------------|----------|
| R1 | ~~10 s Vercel Hobby timeout on weekly full dump~~ | — | — | Retired: Phase 5 runs on Firebase scheduled Functions Gen 2 (1800 s budget) | — |
| R2 | Vercel Hobby commercial-use ToS | EXTERNAL | HIGH | Separate from DR; Tommy aware | — |
| R3 | Hook blocks `.save()` → user-facing latency regression | MEDIUM | HIGH | 500 ms `Promise.race` timeout inside hook; p95 ≤ ~300 ms projected from Vercel us-east1 | Bounded latency tax ~250 ms typical |
| R4 | Hook throws → save fails or data silently lost | LOW | CRITICAL | Hook body `try/catch` at outermost scope; all errors → `backupfailures`; hook NEVER rethrows | Transient drift, PIT reconciles |
| R5 | Bootstrap race (refined: starts at dump creation, not just flag-flip) | LOW | MEDIUM | Maintenance window covering dump + upload + flag flip; fallback = accept initial bounded drift, PIT heals | Minimal if window holds |
| R6 | Service account key leaked via env var logging / crash dump | LOW | CRITICAL | Standard Vercel env var hygiene; rotate on suspected exposure; no key in error messages | Low |
| R7 | SA key rotation forgotten | MEDIUM over time | MEDIUM | Yearly calendar reminder; runbook section | Low with discipline |
| R8 | `backupfailures` unbounded growth | LOW | LOW | TTL index (90-day) + code-enforced 1000-row cap in `recordBackupFailure` | Zero at steady state |
| R9 | Restore script run against prod MongoDB (refined: allowlist not blocklist) | LOW | CATASTROPHIC | `--target-uri` required; allowlist regex matching localhost / test URIs only | Low |
| R10 | Firebase Storage bill runaway (bug writes loop) | LOW | MEDIUM | Billing alert at $5 on docu-parse; 8-week retention in Phase 5; `BackupFailure` model has NO plugin (loop blocker) | Low |
| R11 | Firestore hot-key contention on `current/` doc keys | LOW | LOW | Per-doc keys distributed via ObjectId; not a Firestore pattern concern < 1 write/sec per doc | Zero in practice |
| R12 | Query-write bypass of post-save hooks | RESIDUAL | HIGH | Query middleware on `findOneAndUpdate`, `updateOne`, `findOneAndDelete` + Mongoose alias coverage for `findByIdAnd*`; stubs for `insertMany` / `bulkWrite` fail-closed | Low (stubs catch future `insertMany` / `bulkWrite` adoption) |
| R13 | Stale `*.files` + Storage chunks on `fileId` rotation | RESIDUAL | HIGH | Diff-aware sync: pre-hook captures pre-image; post-hook diffs `fileId`; `cleanupStaleFileId` deletes old chunks + files doc | Low (tested in Phase 2 AC) |
| R14 | Restore type corruption if `cleanForFirestore` transforms not reversed | RESIDUAL | HIGH | Phase 6 AC: reverse `Timestamp → Date`, `_v → __v`, `$oid` string → `ObjectId`; Mongoose model `validateSync()` clean on restored docs | Low (tested in Phase 8) |

## Rollback strategy (overall)

- Every phase independently revertible. Phases 1–2 are inert without Phase 3.
- **Emergency off switch**: set `BACKUP_ENABLED=false` in Vercel env vars. Takes effect on next cold start (~seconds). All hook bodies short-circuit to `return`.
- **Per-phase rollback** documented in-phase.
- **Full undo**: revert the merge commits for the v2 branch; redeploy. No user-facing schema changes (only internal model plugin).

## Sequencing + effort estimate

- Phase 1 → 2 → 3 → 4 are serial.
- Phase 5 can start after Phase 2 and run in parallel with 3–4.
- Phase 6 can start any time after Phase 2.
- Phase 7 requires 1, 2, 3, 6 (dry-run via restore script proves chunks made it).
- Phase 8 requires 2, 6, 7.
- Phase 9 is independent; do last or in parallel.

Effort: 1.5–2 days for phases 1–4, 1 day for phase 5 (Cloud Functions work), 1 day for phase 6, 0.5 day for phase 7 (including maintenance window coordination), 1 day for phase 8, 0.25 day for phase 9. Roughly **5–6 engineering days** for one developer.

## Carry-forward fixes from codex v1 audit (all ten landed)

1. ✅ `doc.gridfsId` → `fileId` (v1 plan line 106 error). All plan references use `fileId` per `Document.ts:57` and `Asset.ts:7`.
2. ✅ Restore reverses Date→Timestamp AND `__v`→`_v` transforms. Phase 6 AC (020).
3. ✅ R9 refined to localhost allowlist, not prod-host blocklist. Phase 6 AC (020).
4. ✅ Restore sets `dbName: 'docu-export'` explicitly. Phase 6 AC (020).
5. ✅ Phase 7 bootstrap race covers dump creation → upload → flag flip via maintenance window. Refined R5.
6. ✅ Credential sweep covers both `backup-database.js` AND `backup-to-json.cjs:13-14`. Phase 9 items 034 + 035.
7. ✅ `FIREBASE_PRIVATE_KEY` newline decode explicit in `src/lib/firebase-admin.ts`. Phase 1 item 005.
8. ✅ Phase 5 retention: recursive subcollection deletion + explicit `current/` exclusion + Storage batch pagination. Item 017.
9. ✅ `backupfailures` 1000-row cap code-enforced in `recordBackupFailure`. Canonical name `backupfailures`. Phase 2 item 007, Phase 4 item 013.
10. ✅ Storage region surfaced as Open Question. Actual region is US-EAST1 (not nam5 as v1, not us-central1 as codex suggested). Cost delta trivial.
