# docu-parse DR Path 2 — Execution Plan (v3)
# Project: docu-export | Level: 3 | Track: spectra | Branch: feat/dr-path2-plan-v2

## Goal

Turn the `mongodb_backup` Firestore mirror into a genuine DR fallback via schema-level Mongoose middleware with diff-aware sync and version-gated mirror writes, a weekly Firebase scheduled Function as the authoritative recovery primitive, a reversible restore script, and an end-to-end recovery drill — all staying on Atlas M0 / Vercel Hobby.

## Architectural delta from v1 and v2

- **v1** (branch `feat/dr-path2-plan`, commit `e7c3dee`) was codex-audited (msg `5d46487e`) — RED on phases 3/5/6/7.
- **v2** (commit `64479ea` on this branch) replaced v1 with schema-level Mongoose middleware + diff-aware sync + Gen 2 PIT. Codex re-audited at msg `1b5c8cb9` — 2 HIGH + 3 MEDIUM + 1 LOW findings.
- **v3 (this revision)** folds in codex v2 findings and Tommy's resolution of the 4 open questions. Headline changes:
  - **Posture rewritten** (codex HIGH-1): 500 ms `Promise.race` cancel mechanic is broken (firebase-admin SDKs don't expose `AbortSignal` on write paths — orphan writes could overwrite newer state). Replaced with **Hybrid C: pre-check read + Firestore `runTransaction` conditional write + monotonic `_syncVersion`**. Hook awaits full chain. 500 ms timer becomes telemetry-only (logs slow saves, no control-flow effect).
  - **Restore ObjectId roundtrip fix** (codex HIGH-2): schema-walked recursive conversion across all `instance === 'ObjectId'` paths, not just top-level `_id`. Catches `Document.clientId`, `Document.fileId`, `Document.relatedBolId`, `Document.supersededBy`, `Asset.fileId`.
  - **Restore URI allowlist parsed, not substring** (codex MED-3): `mongodb-connection-string-url` validates hostname AND dbname independently.
  - **Gen 2 secret binding declared** (codex MED-4): `secrets: [defineSecret('MONGODB_URI')]` in `onSchedule()` options + `MONGODB_URI.value()` at runtime.
  - **Retention retry / failure tracking** (codex MED-5): `recursiveDelete` wrapped with try/catch → `retention_failures` collection; weekly check surfaces entries older than 24 h.
  - **Soft-cap language** (codex LOW-6): `backupfailures` retention is "90-day TTL + best-effort soft cap at 1000 rows", not a hard cap.
  - **Open questions resolved into constitution / phases** (Tommy): US-EAST1 bucket kept; sync-with-catch posture confirmed (mechanism per Hybrid C above); Phase 7 accepts bounded initial drift (no maintenance window; first PIT reconciles, RPO < 7 d); scheduled Function co-located in existing `functions/` codebase.

## Constitution (locked by claude-desktop / Tommy — do not revisit)

1. **Schema-level Mongoose middleware** (not route-level calls, not per-save-only) on `src/models/Document.ts`, `Client.ts`, `Asset.ts`, `AdminUser.ts`:
   - `post('save')` — covers `.save()` + `Model.create()`.
   - `pre`/`post` on `findOneAndUpdate`, `updateOne`, `findOneAndDelete`. Mongoose 8 aliases `findByIdAndUpdate` → `findOneAndUpdate` and `findByIdAndDelete` → `findOneAndDelete` automatically — covered.
   - Use `this.getFilter()` / `this.getUpdate()` in query middleware; for post-image, issue an explicit `Model.findOne(this.getFilter())` after the update.
   - Future guardrails: middleware stubs for `insertMany` / `bulkWrite` (no current hot paths, fail-closed safety net).
2. **Diff-aware sync with fileId-scoped chunk keys and version gating.** Every mirror write path runs **pre-check → chunk writes (new `fileId` prefix) → Firestore transaction → cleanup** inside the hook:
   - **Pre-check**: read existing `mongodb_backup/current/{collection}/{docId}` Firestore doc. If `existing._syncVersion >= incoming._syncVersion`, return immediately (stale arrival, zero writes, no cleanup — prevents delete-then-resurrect orphan leak).
   - **Chunk writes**: if `hasFiles: true` and `fileId` changed (or on create), write new Storage chunks under `backups/current/{docId}/{fileId}/chunks/{n}.bin`. Concurrent rotations for the same `docId` do **not** share object names; `fileId` is part of the key, not just metadata.
   - **Firestore transaction**: `db.runTransaction(async tx => { const snap = await tx.get(ref); if (snap.exists && snap.data()._syncVersion >= incoming._syncVersion) return; tx.set(ref, incoming); })`. Last-writer-wins enforced by the transaction, not by pre-check alone. Pre-check narrows the race window; the transaction closes it.
   - **Cleanup**:
     - If the transaction succeeded and `fileId` rotated, call `cleanupStaleFileId()` to delete the old Firestore `*.files` doc + the old chunk prefix `backups/current/{docId}/{oldFileId}/chunks/`.
     - If new chunks were written but the transaction returned `'stale'` or threw before commit, best-effort delete the just-written loser prefix `backups/current/{docId}/{newFileId}/chunks/` before returning / logging failure.
   - Non-negotiable — without fileId-scoped chunk keys plus version gating, `current/` can drift permanently on every PL/COO regeneration or file replacement, or suffer blob corruption on concurrent rotations.
3. **`_syncVersion` ordering token.** Every mirror doc carries `_syncVersion` as a top-level Firestore field. Source is the Mongoose-managed `updatedAt.getTime()` on the saved / post-image document for all four mirrored models. `AdminUser` is brought onto `timestamps: true` so it participates in the same mechanism. This is an app-clock ordering token, not Atlas commit order; pre-check + transaction enforce ordering against that token, and the preview real-Firebase probe is the correctness gate for equal-ms / clock-skew residuals.
4. **Admin SDK from Next.js runtime** via Vercel env vars (`FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`, `FIREBASE_STORAGE_BUCKET`). Assembled via `admin.credential.cert()` at init. `FIREBASE_PRIVATE_KEY` is stored escaped and MUST be decoded with `.replace(/\\n/g, '\n')` at init (Vercel env var newline footgun). Separate from the local `scripts/backup/service-account-key.json` used only by manual scripts.
5. **Rolling `current/` mirror**: `mongodb_backup/current/{collection}/{docId}` in Firestore. Overwritten only when incoming `_syncVersion` strictly exceeds stored (per item 2). Reflects latest MongoDB state at the moment of the last transaction that won version comparison.
6. **Firebase Storage for binary chunks**: `backups/current/{docId}/{fileId}/chunks/{n}.bin` in bucket `docu-parse.firebasestorage.app` (location **US-EAST1** — verified existing, retained per Tommy's decision). Storage rules deny-all; Admin SDK bypasses.
7. **Weekly PIT snapshots on Firebase scheduled Functions Gen 2** (not Vercel cron): `functions/src/scheduled/backupSnapshot.ts` co-located in the existing `functions/` codebase (same `firebase deploy --only functions` handles both BOL extraction + scheduled backup). Runs Sunday 03:00 America/Chicago, `timeZone: 'America/Chicago'`, `timeoutSeconds: 1800`, `retryCount: 1`, `memory: '512MiB'`, `secrets: [defineSecret('MONGODB_URI')]`. Writes `mongodb_backup/{YYYY-MM-DD}/...` + `backups/{YYYY-MM-DD}/...`. Retention: **keep the last 8 dated snapshots** (exclude `current/` from ordering) via `recursiveDelete` wrapped in try/catch → `retention_failures` collection for partial-failure tracking. `/api/health` Vercel cron stays as-is.
8. **`backupfailures` MongoDB collection** captures silent hook failures (`collection`, `docId`, `operation`, `error`, `stack?`, `retryCount`, `elapsedMs?`, `createdAt`). Retention is **90-day TTL + best-effort soft cap at 1000 rows** (non-atomic `countDocuments` + oldest-N `deleteMany` may overshoot under concurrent burst, acceptable — TTL is the real bound). Canonical collection name: `backupfailures` (Mongoose auto-pluralization of `BackupFailure`).
9. **Restore script local-only**: `scripts/backup/firestore-to-mongodb.cjs`, Admin SDK + local service account key. Target URI validated via **parsed URI** (not substring): `mongodb-connection-string-url` or equivalent parses the URI; hostname and dbname both checked against independent allowlists. Explicit `dbName: 'docu-export'` **overridden** per target in the allowlist (not relied on from URI). Never runs in production.
10. **Deny-all Firestore rules stay deployed** (commit `52c6f26`). Admin SDK from all backup paths bypasses.
11. **Bootstrap accepts bounded initial drift** (Tommy decision): no maintenance window. Deploy middleware + helpers with `BACKUP_ENABLED=false`, run one-time manual bootstrap populating `mongodb_backup/current/*` + `backups/current/*`, flip `BACKUP_ENABLED=true`. Writes between dump creation and flag-flip are reconciled by the first weekly PIT (RPO for that window = time-to-first-PIT, bounded by < 7 days).
12. **Service account key rotation: yearly**, calendar-triggered, documented in runbook. Rotation procedure: generate new key in Firebase Console, update Vercel env vars (Production + Preview), redeploy, disable old key, delete after 14-day grace.
13. **No Atlas M10 / no Vercel Pro** — staying on free tiers.
14. **OAuth / lineitems / BOM-corruption-in-backup-database.js** are explicitly out of scope for this plan (separate work).

## Investigation findings

Carries forward everything from v1 investigation plus new facts from v2 bootstrap + v3 revision:

### From v1 (re-verified against main @ `fff3e92`)

- Next.js 15.1.9, React 19, Mongoose 8. 246/246 tests on main. Production at https://txwos-docs.fyi live.
- GridFS scale (from `backups/2026-04-21/`): 75 documents + 75 `documents.files` + 240 `documents.chunks`, 2 clients, 4 admin users, 6 assets + 6 `assets.files`. ~53 MB per full metadata+chunks snapshot. 8-week retention → ≈425 MB steady-state (trivially below Spark free tier).
- Existing Vercel cron (`vercel.json`): `{ "path": "/api/health", "schedule": "0 0 * * 0" }` with `Authorization: Bearer <CRON_SECRET>` pattern. Stays unchanged.
- `firebase-admin@^13.7.0` is in root `devDependencies` — **must be promoted to `dependencies` for Next.js runtime** (Phase 1 pre-req). `functions/package.json` has its own copy; unaffected.
- Mongoose model surface: `Document.ts`, `Client.ts`, `Asset.ts`, `AdminUser.ts` — four targets. All four are assumed to expose Mongoose-managed `updatedAt`; `AdminUser` therefore needs `timestamps: true` before Phase 3 flips on. `SystemStatus.ts` + `BackupFailure` are excluded from plugin (infra metadata; hooking them would loop).

### From v2 investigation (2026-04-21)

- **Firebase Storage bucket `docu-parse.firebasestorage.app` exists**, created 2026-04-21 03:03 UTC, location **US-EAST1** regional. `firebasestorage.googleapis.com` enabled. Phase 1.001 is "confirm, not enable."
- **Cloud Functions Gen 2 infrastructure already present** on `docu-parse`: deployment buckets `gcf-v2-sources-723054079241-us-central1` + `gcf-v2-uploads-723054079241...` in `us-central1`. Existing `functions/` codebase deploys there. Scheduled function co-locates in same folder.
- **Schema field is `fileId`, not `gridfsId`**: `src/models/Document.ts:57` and `src/models/Asset.ts:7`.
- **Cross-region Functions ↔ Storage**: Functions in `us-central1` reading/writing Storage in `us-east1` incurs ~10–30 ms RTT per API call + egress cost ($0.01/GB inter-region). At 53 MB/week, ~$0.001/week — negligible.
- **`cleanForFirestore` transforms** (`scripts/backup/upload-to-firestore.cjs:128-151`): `$oid → string` (recursively, includes nested FK fields), `$date → Timestamp.fromDate()`, `$base64 → '[binary-in-local-backup]'`, `__v → _v`. **Restore reverses all four, ObjectId recursively across schema paths** (Phase 6 AC).
- **Hardcoded Atlas URI in `backup-to-json.cjs:13-14`** — fallback default with real credentials. Gitignored but still a risk. Phase 9 sweeps both this file and `backup-database.js`.
- **Query-write coverage** (codex grep, active code): `src/app/api/clients/[id]/route.ts:69`, `src/app/api/documents/[id]/generate/pl/route.ts:646`, `src/app/api/documents/[id]/upload-associated/route.ts:174`, `src/app/api/documents/[id]/update-details/route.ts:70`, `src/app/api/documents/[id]/update-carrier-ref/route.ts:70`, `src/lib/auth.ts:58`, `src/app/api/admin/route.ts:75`. All covered structurally by query middleware — no per-route calls needed.
- **Delete paths** (codex grep): `src/app/api/documents/[id]/route.ts:102`, `src/app/api/assets/[id]/route.ts:58`, `src/app/api/admin/route.ts:75`. Covered by `findOneAndDelete` middleware.

### From v3 revision (codex v2 audit feedback)

- **firebase-admin SDK write methods DO NOT accept `AbortSignal`**: `@google-cloud/firestore` `DocumentReference.set()` has no `signal` option; `@google-cloud/storage` `File.save()` exposes `timeout` (deadline, not cancellation) but no `signal`. The v2 `Promise.race([backup(), timeout(500)])` pattern was a no-op for cancellation — underlying work kept running after timeout and could overwrite newer mirror state. v3 posture replaces this with `_syncVersion` + transaction.
- **ObjectId fields stringified recursively** by `cleanForFirestore`: `Document.clientId` (`Document.ts:140-164`), `Document.fileId` (`:57`), `Document.relatedBolId` (`:60`), `Document.supersededBy` (`:279-282`), `Asset.fileId` (`:30-33`). Restore must walk `Schema.paths` and convert every path with `instance === 'ObjectId'` recursively including nested subdocs and arrays.
- **Gen 2 scheduled function secret binding**: `firebase-functions@6` requires `secrets: [defineSecret('MONGODB_URI')]` in `onSchedule()` options for the secret to be injected at runtime (`functions/node_modules/firebase-functions/lib/v2/options.d.ts:107`). Just calling `functions:secrets:set` is not sufficient.
- **`db.recursiveDelete()` deletes the parent regardless of child-delete failure**: a partial failure leaves orphaned descendants under `mongodb_backup/{stale-date}` that future retention listings won't rediscover. Needs retry + failure bookkeeping.

### Hot-path latency measurement (Phase 4 sub-question, resolved with data)

Benchmark run 2026-04-21 from WSL (residential US) → `docu-parse` in US-EAST1, using the existing service account key, 10 iterations per test, ephemeral `mongodb_backup/_latency_test/` + `backups/_latency_test/` paths (cleaned up after):

| Operation | p50 | p95 | Notes |
|---|---|---|---|
| Firestore `Document` write (~2 KB) | 153 ms | 251 ms | Representative metadata doc |
| Firestore `documents.files` sibling (~500 B) | 116 ms | 423 ms | Smaller sibling record |
| Storage chunk write (225 KB, non-resumable) | 233 ms | 329 ms | Per-chunk upload |
| **Full `fileId` rotation** (files + 3 new chunks write + 1 files + 3 stale chunks delete) | **616 ms** | 736 ms | Worst-case steady-state |

Estimate for a representative single-save with 3 parallel chunks: **~500 ms median from WSL**.

**Projected Vercel → Firebase latency** (intra-GCP, same network fabric as us-east1 Vercel edge/lambda region): typically 40–70 % lower than WSL residential. Expected p95: ~150–250 ms single save, ~300–400 ms rotation. v3 posture adds one pre-check read (~80–100 ms) + one transaction (~200–300 ms vs straight `set()` ~150 ms) vs v2's pattern; net Vercel p95 projected ~300–400 ms single save, ~500–600 ms rotation. Re-measured in Phase 1 AC from Vercel runtime before flipping `BACKUP_ENABLED=true`. If materially worse than projected, stop and come back to claude-desktop before Phase 3 flip — do not silently adjust the telemetry threshold without data.

### Locked posture: sync-with-catch via pre-check + Firestore transaction (Hybrid C)

Neither pure sync-in-hook nor pure best-effort is workable:

- **Pure sync-in-hook** (save aborts on backup failure) violates "DR must never block primary write." A transient Firestore blip would fail user-facing saves.
- **Pure best-effort fire-and-forget** has the serverless-freeze risk: Vercel can freeze before detached work + its own failure log write finishes.
- **v2 `Promise.race` timeout + cancel** is broken: firebase-admin doesn't accept `AbortSignal` on writes, so "cancel" is cosmetic; the underlying backup keeps running and can overwrite newer mirror state.

Locked v3 posture:

- Hooks are `async`, awaited by Mongoose 8 (per official docs, `async post('save', fn)` with <2 params IS awaited). No `setImmediate` hack, no cancel mechanic.
- Hook captures `_syncVersion = doc.updatedAt.getTime()` after Mongoose timestamps have been applied. This is an app-clock ordering token, so the preview real-Firebase probe remains the correctness gate for equal-ms / skew residuals.
- Hook body runs **pre-check → chunk writes to `backups/current/{docId}/{fileId}/chunks/{n}.bin` → Firestore `runTransaction` → cleanup** in order. Any step that reads `existing._syncVersion >= incoming._syncVersion` short-circuits with a no-op return (stale arrival). If chunks were written before the stale result, the hook deletes the loser prefix before returning.
- Hook body is wrapped in `try { … } catch (err) { await recordBackupFailure({ collection, docId, operation, error: err.message, stack: err.stack, elapsedMs }) }`. Hook **never throws** — primary save always returns 200.
- `setTimeout(() => recordBackupFailure({ type: 'backup_slow', docId, elapsed_ms: 500 }), 500)` wraps the hook body and clears on completion. This logs slow backups without affecting control flow. Telemetry, not cancel.
- Weekly PIT snapshot is the authoritative recovery primitive; it reconciles any row in `backupfailures` (drift, slow, error) within 7 days (RPO for failed syncs = 7 days; successful syncs are synchronous).

Latency cost: bounded by Firebase's natural p95. Projected Vercel us-east1 ~300–400 ms single save, ~500–600 ms rotation. For BOL upload (Claude API 3–8 s), this is noise. For admin login / session refresh (`auth.ts:58`, ~200 ms base), it roughly doubles — survivable and deterministic, not worse than v2's projection.

Why **not** `@vercel/functions.waitUntil` or Next.js `unstable_after`: both require route-handler integration (pass `ctx` into every write route, drain pending hook promises before return). That reopens Path A's route-by-route tax that the middleware architecture specifically eliminates. Keeping all DR work inside the hook is structurally cleaner — the middleware is the sole DR surface.

## Resolved decisions (formerly Open Questions; resolved by Tommy 2026-04-21)

1. **Storage bucket region: US-EAST1 kept.** Bucket location is immutable. Cross-region Functions (us-central1) → Storage (us-east1) topology accepted; ~10–30 ms RTT per API call, ~$0.001/week egress. Phase 1.001 is "confirm, not enable."
2. **Posture: sync-with-catch confirmed** as the high-level name; internal mechanism is Hybrid C (pre-check + transaction + `_syncVersion`) per v3 revision. Phase 1 AC still re-measures p95 from Vercel runtime before Phase 3 flips `BACKUP_ENABLED=true`; if materially worse than projection, stop and come back to claude-desktop.
3. **Bootstrap: bounded initial drift accepted.** No maintenance window, no Vercel deployment protection gate. First weekly PIT reconciles any writes that land between dump creation and `BACKUP_ENABLED=true` flag flip. RPO during bootstrap = time-to-first-PIT, bounded by < 7 days. Simpler operationally.
4. **`functions/` layout: same folder.** Scheduled function lives at `functions/src/scheduled/backupSnapshot.ts`. One `firebase deploy --only functions` handles both BOL extraction (existing) + scheduled backup (new).

## Phases

Each phase: Tasks → Acceptance Criteria → Verify commands → Risks → Rollback. No `curl localhost` in Verify (no dev server during execution).

### Phase 1 — Bootstrap: Storage confirmation + env vars + Admin SDK init

Pre-requisite plumbing. No app behavior change yet. `BACKUP_ENABLED` defaults false.

- [ ] 001: **Confirm** Firebase Storage bucket `docu-parse.firebasestorage.app` exists + region (already verified 2026-04-21 via `gcloud storage buckets list --project docu-parse` → US-EAST1). No enable step needed per resolved decision #1.
- [ ] 002: Generate service account key in Firebase Console → Project settings → Service accounts → Generate new private key. **Do NOT commit.** One-off local download.
- [ ] 003: Set four Vercel env vars (Production + Preview scope):
  - `FIREBASE_PROJECT_ID=docu-parse`
  - `FIREBASE_CLIENT_EMAIL=<from key JSON>`
  - `FIREBASE_PRIVATE_KEY=<from key JSON, newlines escaped as \n>`
  - `FIREBASE_STORAGE_BUCKET=docu-parse.firebasestorage.app`
- [ ] 004: Promote `firebase-admin` from `devDependencies` to `dependencies` in root `package.json`. `npm install` updates lockfile.
- [ ] 005: Add `src/lib/firebase-admin.ts` — singleton initializer, idempotent (`admin.apps.length` guard), exports `{ db, bucket, admin }`. **Explicit newline decode** for `FIREBASE_PRIVATE_KEY`: `privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')`. No-op branch when `process.env.NODE_ENV === 'test'` and key missing (prevents unit tests from hitting real Firebase).
- [ ] 006: Deploy Storage rules (already deny-all in `storage.rules`): `firebase deploy --only storage --project docu-parse`.
- [ ] 007: **Vercel-runtime latency probe** (one-shot, removed immediately after measurement). Temporary route `/api/_probe/backup-latency` protected by `CRON_SECRET` bearer, runs the Phase 4 bench logic (10-iter Firestore doc + Storage chunk + rotation), returns JSON summary. Call from local machine, record p50/p95, delete route. Data informs Phase 3 `BACKUP_ENABLED=true` go/no-go.
- AC:
  - `npm run build` succeeds with `firebase-admin` resolvable at runtime.
  - `gcloud storage buckets describe gs://docu-parse.firebasestorage.app --project docu-parse` returns location `US-EAST1`.
  - `node -e "require('firebase-admin')"` from project root → no error.
  - `grep -n firebase-admin package.json` → appears under `dependencies`, not `devDependencies`.
  - `npx tsc --noEmit` → no errors.
  - Vercel probe reports p95 single save ≤ 500 ms and p95 rotation ≤ 800 ms; if exceeded, stop and notify claude-desktop before Phase 3.
- Verify:
  - `grep -A1 '"dependencies"' package.json | grep firebase-admin`
  - `npx tsc --noEmit 2>&1 | head`
  - `firebase deploy --only storage --project docu-parse`
  - `gcloud storage buckets list --project docu-parse --format="value(name,location)" | grep docu-parse.firebasestorage.app`
  - `curl -sS -H "Authorization: Bearer $CRON_SECRET" https://<preview-url>/api/_probe/backup-latency | jq .`
- Risk: `FIREBASE_PRIVATE_KEY` newline corruption via Vercel env UI. Mitigation: newline decode in init (item 005); verify via probe route logs on first deploy.
- Rollback: remove env vars, revert `package.json`, delete `src/lib/firebase-admin.ts` + probe route. No user-facing surface changed.

### Phase 2 — Backup helper (pure functions + tests)

Reusable write/cleanup primitives consumed by the plugin and the weekly Function.

- [ ] 008: `src/lib/firebase-backup.ts` exports:
  - `mirrorDocument(doc, collection, syncVersion, snapshotId): Promise<'written' | 'stale'>` — single entry point for the hot path. Runs the pre-check → Firestore `runTransaction` sequence for `mongodb_backup/{snapshotId}/{collection}/{docId}`. Adds `_syncVersion` to the written payload. Returns `'stale'` if pre-check or transaction determined this arrival lost. Internal: uses ported `cleanForFirestore` (same transforms as `upload-to-firestore.cjs:128-151`).
  - `mirrorFilesDoc(filesDoc, collection, syncVersion, snapshotId): Promise<'written' | 'stale'>` — same version-gated pattern for `documents.files` / `assets.files` siblings.
  - `writeChunks(docId, fileId, chunks, snapshotId): Promise<void>` — writes `bucket.file(path).save(bytes, { resumable: false, contentType: 'application/octet-stream' })` per chunk at `backups/{snapshotId}/{docId}/{fileId}/chunks/{n}.bin`. Caller decides when to invoke (only on create or `fileId` rotation).
  - `deleteChunkPrefix(docId, fileId, snapshotId): Promise<void>` — deletes the entire prefix `backups/{snapshotId}/{docId}/{fileId}/chunks/`. Used both for old-file cleanup after a winning rotation and for best-effort loser-prefix cleanup after a stale / failed transaction.
  - `cleanupStaleFileId(docId, oldFileId, collection, snapshotId): Promise<void>` — deletes old Firestore `*.files` docs + `deleteChunkPrefix(docId, oldFileId, snapshotId)`. Non-negotiable (R13). Caller invokes ONLY after the Firestore transaction succeeded on a rotation.
  - `recordBackupFailure(entry: { collection, docId, operation, error, stack?, elapsedMs? }): Promise<void>` — inserts into `BackupFailure` model, then best-effort soft-cap prune (if `countDocuments() > 1000`, delete oldest N; non-atomic, may overshoot under concurrent burst — TTL is the real bound).
  - For PIT snapshot mode (`snapshotId = YYYY-MM-DD`), version-gating is skipped — dated snapshots are immutable writes.
- [ ] 009: TS types co-located. `tests/firebase-backup.test.ts` — mock `admin.firestore`, `admin.storage` via vitest module mocks. Do NOT hit real Firebase in unit tests.
- AC:
  - Test coverage: successful write path, stale-arrival returns `'stale'` (no mirror write; any prewritten loser prefix is deleted), rotation path (chunks write → transaction → cleanup order asserted), failure path invoking `recordBackupFailure`, `Timestamp.fromDate()` translation of `Date`, `__v → _v` rename, `cleanupStaleFileId` deletes exactly the old fileId prefix and leaves the winning fileId prefix untouched, PIT snapshot mode skips version gating.
  - 246 existing tests still pass; new tests pass.
- Verify:
  - `npx vitest run tests/firebase-backup.test.ts --reporter=verbose`
  - `npx vitest run`
  - `npx tsc --noEmit`
- Risk: Admin SDK mock surface drift across versions. Mitigation: mock narrowly (only the methods called); pin `firebase-admin` in `dependencies`.
- Rollback: delete `src/lib/firebase-backup.ts` + test file.

### Phase 3 — Mongoose middleware plugin (diff-aware, version-gated, gated by `BACKUP_ENABLED`)

The DR coverage surface. Behavior gated by env var so Phase 3 merges dark.

- [ ] 010: Add `BACKUP_ENABLED` env var (boolean). Default `false` locally, `false` in Vercel until Phase 7 bootstrap complete.
- [ ] 011: Add `src/lib/backup-plugin.ts` — a Mongoose plugin: `backupPlugin(schema, { collection, hasFiles })` where `hasFiles: true` enables `fileId` rotation logic (Document, Asset). Installs:
  - `schema.post('save', async function(doc) { ... })` — create + save coverage.
  - `schema.pre('findOneAndUpdate', async function() { if (hasFiles) this._backup_pre = await this.model.findOne(this.getFilter()).lean(); })` — captures pre-image when file rotation is possible.
  - `schema.post('findOneAndUpdate', async function() { ... })` — re-fetches post-image via `this.model.findOne(this.getFilter()).lean()`, drives the full Hybrid-C sequence (pre-check → chunks to fileId-scoped prefix if rotation → transaction → cleanup).
  - Same pattern for `updateOne`.
  - `schema.pre('findOneAndDelete', async function() { this._backup_pre = await this.model.findOne(this.getFilter()).lean(); })`.
  - `schema.post('findOneAndDelete', async function() { ... })` — pre-check on delete (`syncVersion = Date.now()`), then transactional delete of mirror doc + sibling files doc + cleanup of all chunks under pre.fileId.
  - **Stubs** (log + `recordBackupFailure({operation: 'unsupported'})`) for `insertMany`, `bulkWrite` — fail-closed guardrail so future code using these surfaces the coverage gap.
  - Every hook body:
    ```ts
    if (process.env.BACKUP_ENABLED !== 'true') return;
    const started = Date.now();
    const slowTimer = setTimeout(() => {
      recordBackupFailure({ collection, docId, operation: 'slow', error: 'exceeded 500ms', elapsedMs: 500 }).catch(() => {});
    }, 500);
    try {
      const syncVersion = doc.updatedAt.getTime();
      // Hybrid C sequence: pre-check → chunks to fileId-scoped prefix (rotation) → runTransaction → cleanup
      // If chunks were written but the transaction returns stale / throws, delete the new-fileId prefix before returning / logging failure.
      // ... see implementation sketch in Phase 2.008 helpers
    } catch (err) {
      await recordBackupFailure({ collection, docId, operation, error: err.message, stack: err.stack, elapsedMs: Date.now() - started });
    } finally {
      clearTimeout(slowTimer);
    }
    ```
  - Hooks **never throw** — all errors routed to `backupfailures`, primary save never aborted.
- [ ] 012: Apply plugin in `src/models/Document.ts` with `hasFiles: true`, `Client.ts` with `hasFiles: false`, `Asset.ts` with `hasFiles: true`, `AdminUser.ts` with `hasFiles: false`. `SystemStatus.ts` + `BackupFailure` get NO plugin (prevents write loops).
- [ ] 013: Integration test at `tests/backup-plugin.test.ts` — uses `mongodb-memory-server` (verify presence; add as devDep if not), mocks `firebase-admin`, exercises:
  - `.save()` mirrors correctly + writes `_syncVersion`.
  - `findByIdAndUpdate` (aliases to `findOneAndUpdate`) triggers both pre + post hooks; `fileId` rotation: chunks written to a fileId-scoped prefix BEFORE transaction, old prefix cleanup runs AFTER transaction success, loser prefix cleanup runs on stale / failed transaction.
  - `findByIdAndDelete` (aliases to `findOneAndDelete`) removes mirror doc + files + chunks.
  - **Concurrent-write test (R15)**: fire two `.save()` operations for the same docId with different `updatedAt`; assert only the later `_syncVersion` persists in the mirror, the earlier one returns `'stale'`, and the loser fileId prefix is deleted.
  - **Stale-arrival test**: manually seed mirror with `_syncVersion = X+1`, run hook with `syncVersion = X`; assert no writes, no cleanup, no chunks touched.
  - **Cleanup-failure test (R16)**: mock `cleanupStaleFileId` to throw after transaction success; assert mirror Firestore doc is consistent, `backupfailures` row appears, save returns successfully.
  - Hook error in transaction → `recordBackupFailure` called, save returns successfully.
  - Slow-timer telemetry: mock a 600 ms backup; assert one `backupfailures` row with `operation: 'slow'` appears regardless of eventual success/failure.
  - `BACKUP_ENABLED=false` → zero Firebase calls, zero `backupfailures` rows.
- AC:
  - With `BACKUP_ENABLED=false`, 246 existing tests green; `.save()` latency unchanged.
  - With `BACKUP_ENABLED=true`, all new integration tests green.
  - Vercel preview deploy with `BACKUP_ENABLED=true` + real Firebase (probe testing only, not prod): concurrent-write test against the mirror via sequential fetch of `.doc().get()._syncVersion` shows mirror ordering consistent with save order. This preview probe is the correctness gate; local mocks only validate orchestration.
- Verify:
  - `BACKUP_ENABLED=false npx vitest run`
  - `BACKUP_ENABLED=true npx vitest run tests/backup-plugin.test.ts`
  - `npx tsc --noEmit`
- Risk (**highest in plan**): a bad hook blocks or corrupts the save path.
  - R3 mitigation: no cancel mechanic; hook awaits full chain at Firebase's natural latency. Bounded by Firebase p95 (~300–400 ms projected Vercel us-east1).
  - R4 mitigation: `try/catch` at outermost hook level — errors never escape.
  - R12 mitigation: query middleware covers all seven flagged write call sites structurally.
  - R13 mitigation: fileId-scoped chunk keys prevent concurrent rotations from sharing blob names; cleanup only removes the old winning prefix.
  - R15 mitigation: `_syncVersion` pre-check + `runTransaction` ordering token; preview real-Firebase concurrent-write probe in AC is the correctness gate.
  - R16 mitigation: if a stale / failed transaction happens after new chunks were written, delete the loser prefix best-effort and record failure on cleanup miss.
- Rollback: set `BACKUP_ENABLED=false` in Vercel (instant, zero-deploy); or revert plugin file + model `.plugin()` calls.

### Phase 4 — Failure surfacing

Minimal infra so failures are forensically inspectable.

- [ ] 014: `src/models/BackupFailure.ts` — schema: `{ collection: string, docId: string, operation: 'save' | 'update' | 'delete' | 'slow' | 'unsupported' | 'timeout', error: string, stack?: string, retryCount: number (default 0), elapsedMs?: number, createdAt: Date }`. Mongoose auto-pluralizes model name `BackupFailure` → collection `backupfailures`. TTL index: `createdAt` with `expireAfterSeconds: 90 * 24 * 3600`. **No plugin applied** to this model (would loop).
- [ ] 015: Unit test `tests/backup-failure.test.ts` covering: creation correctness, TTL index present (`indexes()` assertion), soft-cap best-effort prune (assert row count converges to ≤ 1000 under sequential inserts past 1000; overshoot under artificial concurrency is accepted behavior and explicitly documented in the test).
- [ ] 016: `scripts/backup/list-failures.cjs` (gitignored under `/scripts/*`) — local read-only CLI printing last N failures.
- AC:
  - `db.backupfailures.getIndexes()` shows `expireAfterSeconds: 7776000`.
  - Sequential insert test converges row count ≤ 1000 after bulk load of 1500 rows.
  - 246 + new tests all green.
- Verify:
  - `npx vitest run tests/backup-failure.test.ts`
  - (Manual, post-deploy) `mongosh "$MONGODB_URI" --eval 'db.backupfailures.getIndexes()'`
- Risk: unbounded growth if TTL index fails to build. Mitigation: AC verifies index presence; additional soft-cap pruning as belt-and-suspenders.
- Rollback: drop `backupfailures` collection; delete model file + test.

### Phase 5 — Weekly PIT snapshot on Firebase scheduled Functions Gen 2

Self-healing authoritative DR primitive. Co-located in existing `functions/` codebase.

- [ ] 017: `functions/src/scheduled/backupSnapshot.ts`:
  ```ts
  import { onSchedule } from 'firebase-functions/v2/scheduler';
  import { defineSecret } from 'firebase-functions/params';
  import { logger } from 'firebase-functions';

  const MONGODB_URI = defineSecret('MONGODB_URI');

  export const backupSnapshot = onSchedule({
    schedule: '0 3 * * 0',
    timeZone: 'America/Chicago',
    timeoutSeconds: 1800,
    retryCount: 1,
    memory: '512MiB',
    secrets: [MONGODB_URI],
  }, async (event) => {
    const uri = MONGODB_URI.value();
    // connect, iterate, write to dated paths, then retention cleanup
  });
  ```
  Body: connect to Atlas using the secret, iterate the four target collections + GridFS sibling files + chunks, stream each to `mongodb_backup/{YYYY-MM-DD}/{collection}/{docId}` + `backups/{YYYY-MM-DD}/{docId}/{fileId}/chunks/{n}.bin`. Uses helpers from Phase 2 (`mirrorDocument`/`mirrorFilesDoc`/`writeChunks`) in PIT-snapshot mode (version-gating skipped for dated snapshots).
- [ ] 018: Export `backupSnapshot` from `functions/src/index.ts` so the existing `firebase deploy --only functions` picks it up alongside current BOL-extraction functions.
- [ ] 019: **Retention cleanup** at end of function run. Delete everything **older than the 8th most recent dated snapshot**. Implementation:
  - List direct subdocs of `mongodb_backup/` via Admin SDK (parent-doc + date-named subcollections).
  - **Explicitly exclude `current/` from date ordering**.
  - For each stale date, wrap `recursiveDelete` with retry + failure tracking:
    ```ts
    try {
      await db.recursiveDelete(db.doc(`mongodb_backup/${date}`));
      await bucket.deleteFiles({ prefix: `backups/${date}/`, force: true });
    } catch (err) {
      await db.collection('retention_failures').add({
        snapshotDate: date,
        error: err.message,
        stack: err.stack,
        timestamp: FieldValue.serverTimestamp(),
      });
      logger.error('retention delete failed', { date, err });
    }
    ```
  - Respect Storage batch list/delete caps (1000 per page); `deleteFiles` paginates internally.
  - **Weekly operator check**: a second smaller scheduled function (or same function's prelude) surfaces `retention_failures` rows older than 24 h to `logger.error` for ops to act on. Tracked in runbook.
- [ ] 020: Set Atlas URI secret: `firebase functions:secrets:set MONGODB_URI --project docu-parse` (interactive; value is the prod Atlas SRV URI).
- [ ] 021: Do NOT touch `vercel.json` — `/api/health` cron unchanged. Do NOT add a Vercel cron for backup-snapshot.
- AC:
  - Secret binding check: deploy + `firebase functions:secrets:access MONGODB_URI --project docu-parse | head -1` returns non-empty (manual admin-only); runtime `MONGODB_URI.value()` returns the SRV URI (verify via one-shot invoke + function log).
  - Manual one-shot: `firebase deploy --only functions --project docu-parse` + `gcloud scheduler jobs run <job> --location=us-central1` → creates `mongodb_backup/{today}/` with all four collections + sibling files + Storage `backups/{today}/*` populated.
  - After 9 successful weekly runs: only 8 latest dated snapshots remain; `current/` untouched.
  - Retention partial-failure drill: manually seed a partial-delete condition (e.g., make `recursiveDelete` fail via IAM revocation on one subpath), trigger function, confirm `retention_failures` row appears + function continues with other dates.
  - Function duration < 1800 s at 53 MB payload (expected ~2–4 min).
- Verify:
  - `firebase functions:list --project docu-parse | grep backupSnapshot`
  - `gcloud scheduler jobs list --location=us-central1 --project docu-parse | grep backupSnapshot`
  - Firebase Console → `mongodb_backup/` root shows exactly 8 dated docs (+ `current`).
  - `gcloud storage ls gs://docu-parse.firebasestorage.app/backups/` → 8 dated prefixes (+ `current`).
  - Function logs: `firebase functions:log --only backupSnapshot --project docu-parse | tail -40`.
  - `mongosh $MONGODB_URI --eval 'db.backupfailures.countDocuments()'` — monitor for drift captured during the week.
- Risk: function cold start + Atlas connection (~2–5 s) inside the 1800 s budget — trivial. Atlas M0 max 500 connections contended with prod Next.js — mitigation: function uses its own short-lived connection, closes after run.
- Rollback: `firebase functions:delete backupSnapshot --project docu-parse`. Existing snapshots stay (read-only, harmless).

### Phase 6 — Restore script (local-only, reversible transforms, parsed URI allowlist)

One command to reconstruct MongoDB from Firestore + Storage.

- [ ] 022: `scripts/backup/firestore-to-mongodb.cjs` (gitignored):
  - Flags: `--date=current|YYYY-MM-DD` (required), `--target-uri=<MONGODB_URI>` (required), `--dry-run`, `--force` (allow non-empty target).
  - **Parsed-URI allowlist** (R9 refinement): parse target URI with `mongodb-connection-string-url` (add as devDep) or equivalent:
    ```js
    const ConnectionString = require('mongodb-connection-string-url').default;
    const u = new ConnectionString(uri);
    const hosts = u.hosts.map(h => h.toLowerCase());
    const db = u.pathname.slice(1);
    const HOST_ALLOW = ['localhost', '127.0.0.1', '0.0.0.0'];
    const HOST_PATTERN = [/^mongo-drtest\./, /\.docker\.internal$/];
    const DB_ALLOW = ['docu-export-drtest', 'docu-export-restore-test'];
    if (u.isSRV) reject('SRV URIs not allowed');
    if (!hosts.every(h => HOST_ALLOW.includes(h) || HOST_PATTERN.some(p => p.test(h)))) reject('host not allowed');
    if (!DB_ALLOW.includes(db)) reject('db name not allowed');
    ```
    Both host AND dbname must pass. Reject with explicit error + log the failing component.
  - Loads service account key from `scripts/backup/service-account-key.json` (primary) or `$GOOGLE_APPLICATION_CREDENTIALS` (fallback); fail-fast with Console walkthrough if neither.
  - Mongoose connect with **explicit `{ dbName: <allowlisted-name> }`** option — does NOT trust URI path beyond the allowlist check.
  - **Reverse transforms** (symmetric to `cleanForFirestore`):
    - Firestore `Timestamp` → `new Date(ts.toDate())` → Mongoose `Date`.
    - `_v` → `__v` (rename back).
    - **Recursive ObjectId restoration**: walk `Schema.paths` for each Mongoose model. For every path with `instance === 'ObjectId'`, wrap the string value via `new mongoose.Types.ObjectId(str)`. Includes nested subdocuments (recurse into `Subdocument.schema.paths`) and array fields (recurse per-element). Concrete paths for this codebase: `Document._id`, `Document.clientId`, `Document.fileId`, `Document.relatedBolId`, `Document.supersededBy`, `Asset._id`, `Asset.fileId`, `AdminUser._id`, `Client._id`, plus any discovered via schema walk.
    - Skipped-in-Firestore `[binary-in-local-backup]` placeholder → error (restore fallback is Storage chunk stream, not the Firestore marker).
  - Per-collection ordering: `adminusers`, `clients`, `assets`, `assets.files`, `assets.chunks` (streamed), `documents`, `documents.files`, `documents.chunks` (streamed).
  - Chunk streaming: for each restored owner doc (`Asset` / `Document`), use owner `_id` plus its `fileId` to download `bucket.file('backups/{date}/{ownerDocId}/{fileId}/chunks/{n}.bin')` and reinsert chunk docs with `files_id: fileId`.
- [ ] 023: `scripts/backup/verify-restore.cjs` (gitignored) — diff: per-collection `count`, sha256 of 10 % sampled `documents.chunks` and `assets.chunks` vs source local backup dump, ObjectId-type assertions per restored collection (`assert(doc.clientId instanceof mongoose.Types.ObjectId)`).
- [ ] 024: Runbook entry: restore command, required env, allowlisted hosts + dbnames.
- AC:
  - `--dry-run` against `--date=2026-04-21 --target-uri=mongodb://localhost:27017/docu-export-drtest` prints expected insert counts matching the 2026-04-21 dump header.
  - Live restore to `mongodb://localhost:27017/docu-export-drtest` produces byte-identical chunks (sha256 match on random 10 % sample) and doc counts matching source per collection.
  - **ObjectId roundtrip**: `assert(restored.clientId instanceof mongoose.Types.ObjectId)` passes for at least one instance of each ObjectId-typed schema path.
  - Rejecting prod SRV: `node scripts/backup/firestore-to-mongodb.cjs --target-uri=mongodb+srv://user:pass@cluster0.xxxxx.mongodb.net/docu-export --date=current` exits non-zero with `SRV URIs not allowed`.
  - Rejecting prod host in non-SRV form: `mongodb://user:pass@cluster0.xxxxx.mongodb.net:27017/docu-export` → exits with `host not allowed`.
  - Rejecting wrong dbname on allowed host: `mongodb://localhost:27017/docu-export` → exits with `db name not allowed` (because `docu-export` is not in the allowlist; only `*-drtest` / `*-restore-test` are).
  - Type round-trip: Mongoose model validation passes on restored docs (`Document.findOne({}).then(doc => doc.validateSync())` returns undefined).
- Verify:
  - `node scripts/backup/firestore-to-mongodb.cjs --target-uri=mongodb+srv://blah.mongodb.net/x --date=current` → non-zero exit + explicit allowlist error.
  - `node scripts/backup/firestore-to-mongodb.cjs --date=current --target-uri=mongodb://localhost:27017/docu-export-drtest --dry-run` → summary printout.
  - `node scripts/backup/verify-restore.cjs --source=backups/2026-04-21 --target=mongodb://localhost:27017/docu-export-drtest` → PASS.
- Risk: restore to prod (R9 catastrophic). Mitigation: parsed-URI allowlist with independent host AND dbname checks; SRV rejected outright; `--dry-run` default-off.
- Rollback: delete script files; drop test DB.

### Phase 7 — Bootstrap run (no maintenance window, bounded initial drift)

One-time manual population of `current/` + Storage. Resolved decision #3: accept bounded drift; first PIT reconciles.

- [ ] 025: Tommy runs: `node scripts/backup/backup-to-json.cjs` → dumps current MongoDB to `backups/{today}/`. Site stays live. Writes during this window reach Atlas normally but are not yet mirrored.
- [ ] 026: Tommy runs (adjusted): `node scripts/backup/upload-to-firestore.cjs --snapshot=current` (flag addition — minor patch to existing script to override date-based default path with `current`).
- [ ] 027: Tommy runs new `scripts/backup/upload-chunks-to-storage.cjs --snapshot=current` (gitignored) — bulk uploads chunks from local dump to `backups/current/{docId}/{fileId}/chunks/*.bin`.
- [ ] 028: Verify Firestore + Storage `current/` state matches source dump (`node scripts/backup/verify-restore.cjs --source=backups/{today} --firestore=current`).
- [ ] 029: Flip `BACKUP_ENABLED=true` in Vercel env vars. Redeploy. Any writes between dump creation and flag-flip are **reconciled by the first weekly PIT** (RPO for that window < 7 days).
- [ ] 030: Monitor `backupfailures` for 30 min. Non-zero row count at T+30 min is expected only for transient Firebase errors on new writes, not for bootstrap-window drift.
- AC:
  - `mongodb_backup/current/*` populated in Firestore; `backups/current/*` populated in Storage.
  - Doc counts per collection match `backups/{today}/*.json` exactly at time of dump.
  - `BACKUP_ENABLED=true` flag is live in Vercel Production + Preview scope.
  - **Bootstrap drift RPO documented**: any Atlas writes during the window from dump creation to flag-flip (typically ≤ 30 min) are captured by the next weekly PIT (bounded by < 7 days).
  - `backupfailures` at T+30 min shows only transient errors from live writes, if any.
- Verify:
  - Firebase Console visual inspection.
  - `node scripts/backup/verify-restore.cjs --source=backups/{today} --firestore=current` → PASS.
  - `mongosh ... --eval 'db.backupfailures.find().sort({createdAt:-1}).limit(5).pretty()'` → review recent entries.
- Risk: initial drift window is user-visible if Phase 5 PIT hasn't run yet. Mitigation: bounded by < 7 days; PIT is self-healing authoritative DR primitive. Fallback: if initial drift is unacceptable for a given release window, manually re-run bootstrap scripts to refresh `current/`.
- Rollback: flip `BACKUP_ENABLED=false`; optionally delete `mongodb_backup/current/*` + `backups/current/*` from Firebase.

### Phase 8 — End-to-end DR drill

Real restore + app regression.

- [ ] 031: Stand up local MongoDB: `docker run -d -p 27017:27017 --name docu-drtest mongo:7`.
- [ ] 032: `node scripts/backup/firestore-to-mongodb.cjs --date=current --target-uri=mongodb://localhost:27017/docu-export-drtest` → restore.
- [ ] 033: `node scripts/backup/verify-restore.cjs --source=backups/{today} --target=mongodb://localhost:27017/docu-export-drtest` → PASS.
- [ ] 034: `MONGODB_URI=mongodb://localhost:27017/docu-export-drtest npm run dev`, open dashboard, open existing BOL, regenerate PL + COO.
- [ ] 035: Diff PL + COO PDFs byte-identical to pre-drill baseline (regenerate against prod snapshot first, archive under `.spectra/logs/dr-drill-{date}/`).
- AC:
  - 100 % doc count match per collection.
  - 100 % sha256 match on 10 % sampled chunks.
  - PL + COO regen outputs byte-identical (or structurally identical — layout + metadata) to baseline.
  - Mongoose schema validation clean across all restored docs.
  - All ObjectId-typed paths have `instanceof Types.ObjectId` after restore.
- Verify:
  - `diff <(sha256sum PL-baseline.pdf) <(sha256sum PL-drill.pdf)` → identical or documented difference (e.g. generation timestamp field).
  - `.spectra/logs/dr-drill-{date}/report.md` archived.
- Risk: none beyond normal testing. Payoff phase — if it fails, find the gap before trusting the system in a real disaster.
- Rollback: `docker rm -f docu-drtest`; no prod impact.

### Phase 9 — Hygiene + credential sweep

- [ ] 036: `scripts/backup/backup-database.js` — replace hardcoded `mongodb+srv://...:...@cluster0.xxxxx.mongodb.net/...` default with `throw new Error('MONGODB_URI env var required')` when unset. File stays gitignored; still worth closing the credentials-in-source surface.
- [ ] 037: `scripts/backup/backup-to-json.cjs:13-14` — same fix: remove hardcoded fallback URI.
- [ ] 038: `.spectra/dr-runbook.md` — commit to main (NOT gitignored — operational docs). Contents: restore command + allowlist rules, SA key rotation (yearly), Firebase Storage bucket region (US-EAST1 lock-in), `backupfailures` monitoring, `retention_failures` monitoring (weekly check), bootstrap drift expectations, "what to do when weekly cron fails 2× in a row" (check Function logs, rotate key if auth errors, page Tommy on 3rd failure).
- [ ] 039: Flag for separate task (explicitly NOT fixed here): BOM / UTF-16 artifact at line 1 of `backup-database.js`. File runs but is visually garbled. Tracked in runbook as known-issue.
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
| R3 | Hook blocks `.save()` → user-facing latency regression | MEDIUM | HIGH | No cancel mechanic (removed broken `Promise.race`); hook awaits full Hybrid-C chain at Firebase's natural latency (~300–400 ms p95 Vercel us-east1 projected). 500 ms slow-timer is telemetry-only (`backupfailures` row, no control-flow effect). Phase 1 AC gates Phase 3 flip on measured Vercel p95. | Bounded latency tax at Firebase p95 |
| R4 | Hook throws → save fails or data silently lost | LOW | CRITICAL | Hook body `try/catch` at outermost scope; all errors → `backupfailures`; hook NEVER rethrows | Transient drift, PIT reconciles |
| R5 | Bootstrap drift during `current/` population | KNOWN | LOW | Bounded initial drift accepted (Tommy decision); writes between dump creation and flag-flip captured by first weekly PIT; RPO < 7 days | Documented, not masked |
| R6 | Service account key leaked via env var logging / crash dump | LOW | CRITICAL | Standard Vercel env var hygiene; rotate on suspected exposure; no key in error messages | Low |
| R7 | SA key rotation forgotten | MEDIUM over time | MEDIUM | Yearly calendar reminder; runbook section | Low with discipline |
| R8 | `backupfailures` unbounded growth | LOW | LOW | 90-day TTL index (primary bound) + best-effort soft cap at 1000 rows in `recordBackupFailure` (non-atomic, may overshoot under concurrent burst) | Bounded by TTL at ~1000 steady-state |
| R9 | Restore script run against prod MongoDB | LOW | CATASTROPHIC | Parsed URI allowlist — hostname AND dbname validated independently via `mongodb-connection-string-url`; SRV rejected; prod hostname / prod dbname both fail | Low |
| R10 | Firebase Storage bill runaway (bug writes loop) | LOW | MEDIUM | Billing alert at $5 on docu-parse; 8-week retention in Phase 5; `BackupFailure` model has NO plugin (loop blocker) | Low |
| R11 | Firestore hot-key contention on `current/` doc keys | LOW | LOW | Per-doc keys distributed via ObjectId; not a Firestore pattern concern < 1 write/sec per doc | Zero in practice |
| R12 | Query-write bypass of post-save hooks | RESIDUAL | HIGH | Query middleware on `findOneAndUpdate`, `updateOne`, `findOneAndDelete` + Mongoose alias coverage for `findByIdAnd*`; stubs for `insertMany` / `bulkWrite` route to `recordBackupFailure({operation: 'unsupported'})` fail-closed | Low |
| R13 | Stale `*.files` + Storage chunks on `fileId` rotation | RESIDUAL | HIGH | FileId-scoped chunk keys prevent concurrent rotations from sharing object names; winning transaction cleans old prefix only; stale / failed arrivals delete their own new prefix best-effort | Low (tested in Phase 2 + 3 AC) |
| R14 | Restore type corruption if `cleanForFirestore` transforms not reversed | RESIDUAL | HIGH | Phase 6 AC: reverse `Timestamp → Date`, `_v → __v`, recursive `ObjectId` conversion across `Schema.paths`; Mongoose model `validateSync()` + `instanceof` assertions on restored docs | Low (tested in Phase 8) |
| R15 | Out-of-order mirror writes if `_syncVersion` / pre-check / transaction logic is incorrect or omitted | LOW | HIGH | Phase 3 AC concurrent-write test; preview real-Firebase probe is the correctness gate because `_syncVersion` is app-clock-derived rather than Atlas commit order; `runTransaction` still serializes by that token | Low with probe validation |
| R16 | Orphaned Storage prefixes if loser-prefix cleanup or old-prefix cleanup fails | LOW | MEDIUM | FileId-scoped chunk keys bound the blast radius to a single fileId prefix; stale / failed arrivals delete their own prefix best-effort and log on miss; winning rotations log cleanup failures for old prefixes | Low |

## Rollback strategy (overall)

- Every phase independently revertible. Phases 1–2 are inert without Phase 3.
- **Emergency off switch**: set `BACKUP_ENABLED=false` in Vercel env vars. Takes effect on next cold start (~seconds). All hook bodies short-circuit to `return`.
- **Per-phase rollback** documented in-phase.
- **Full undo**: revert the merge commits for the v2+v3 branch; redeploy. No user-facing schema changes (only internal model plugin).

## Sequencing + effort estimate

- Phase 1 → 2 → 3 → 4 are serial.
- Phase 5 can start after Phase 2 and run in parallel with 3–4.
- Phase 6 can start any time after Phase 2.
- Phase 7 requires 1, 2, 3, 6 (dry-run via restore script proves chunks made it).
- Phase 8 requires 2, 6, 7.
- Phase 9 is independent; do last or in parallel.

Effort: 2 days for phases 1–4 (Hybrid-C pre-check + transaction + concurrent-write tests add ~0.5 day vs v2), 1 day for phase 5 (Cloud Functions work + retention retry), 1 day for phase 6 (schema-walked ObjectId + parsed URI), 0.25 day for phase 7 (no maintenance window — simpler than v2), 1 day for phase 8, 0.25 day for phase 9. Roughly **5.5–6 engineering days** for one developer.

## Carry-forward fixes

### From codex v1 audit (all ten landed in v2, retained in v3)

1. ✅ `doc.gridfsId` → `fileId`. All plan references use `fileId` per `Document.ts:57` and `Asset.ts:7`.
2. ✅ Restore reverses Date↔Timestamp AND `__v`↔`_v` transforms. Phase 6 AC.
3. ✅ R9 refined to localhost/test allowlist — in v3, parsed-URI allowlist (codex MED-3 below deepens this).
4. ✅ Restore sets `dbName` explicitly (to allowlisted value, not URI-derived).
5. ✅ Phase 7 bootstrap race: in v3, accepts bounded drift instead of maintenance window (Tommy decision).
6. ✅ Credential sweep covers both `backup-database.js` AND `backup-to-json.cjs:13-14`. Phase 9.
7. ✅ `FIREBASE_PRIVATE_KEY` newline decode explicit in `src/lib/firebase-admin.ts`. Phase 1.
8. ✅ Phase 5 retention: recursive subcollection deletion + `current/` exclusion + Storage batch pagination.
9. ✅ `backupfailures` — v2 called it a hard cap; v3 relabels as "90-day TTL + best-effort soft cap at 1000 rows" (codex LOW-6 below).
10. ✅ Storage region flagged as Open Question in v2; resolved as KEEP US-EAST1 in v3 (Tommy decision).

### From codex v2 audit (all six landed in v3)

1. **codex HIGH-1** ✅ 500 ms `Promise.race` cancel mechanic replaced with Hybrid C: pre-check read + Firestore `runTransaction` + `_syncVersion`. Hook awaits full chain; 500 ms timer is telemetry-only (`backupfailures` row, no control-flow effect). Constitution items 2–3, 5; Phase 3 item 011; R3 + R15 mitigations.
2. **codex HIGH-2** ✅ Phase 6 restore walks `Schema.paths` and recursively converts every `instance === 'ObjectId'` path — not just top-level `_id`. Covers `Document.clientId`, `Document.fileId`, `Document.relatedBolId`, `Document.supersededBy`, `Asset.fileId`, plus any discovered via schema walk. Phase 6 item 022; AC asserts `instanceof Types.ObjectId`.
3. **codex MED-3** ✅ Restore URI allowlist replaced with parsed-URI validation via `mongodb-connection-string-url`: hostname AND dbname both validated independently; SRV rejected. Phase 6 item 022.
4. **codex MED-4** ✅ Gen 2 scheduled function declares `secrets: [defineSecret('MONGODB_URI')]` in `onSchedule()` options + references `MONGODB_URI.value()` at runtime. Phase 5 item 017 + AC secret binding check.
5. **codex MED-5** ✅ `recursiveDelete` wrapped with try/catch → `retention_failures` collection; weekly operator check surfaces entries older than 24 h. Phase 5 item 019; R16 mitigation.
6. **codex LOW-6** ✅ `backupfailures` cap relabeled as "90-day TTL + best-effort soft cap at 1000 rows (non-atomic, may overshoot under concurrent burst)". No implementation change — TTL is the real bound. Constitution item 8; Phase 4 AC.

### From Tommy's open-question resolutions (folded into constitution + phases)

1. ✅ **Storage bucket US-EAST1 kept.** Phase 1.001 is "confirm, not enable." Cross-region Functions → Storage topology accepted. Constitution item 6.
2. ✅ **Posture sync-with-catch confirmed** with Hybrid C internal mechanism. Phase 1 AC re-measures from Vercel before Phase 3 flip; if materially worse than projection, stop and escalate. Constitution item 2–3, 5; "Locked posture" section.
3. ✅ **Bootstrap: bounded initial drift accepted**, no maintenance window. First weekly PIT reconciles dump-to-flag-flip window. Constitution item 11; Phase 7 rewrite; R5 update.
4. ✅ **`functions/` co-location**: `backupSnapshot.ts` in existing Functions codebase. Constitution item 7; Phase 5 items 017–018.
