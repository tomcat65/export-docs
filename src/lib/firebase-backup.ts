import mongoose from 'mongoose'
import { db, bucket, admin } from '@/lib/firebase-admin'

/**
 * Phase 2 helpers for the DR Path 2 backup surface.
 *
 * Consumed by the Mongoose plugin (Phase 3, hot path per-save) and the
 * weekly PIT scheduled Function (Phase 5, dated snapshots). See
 * `.spectra/plan-dr-path2.md` Constitution items 2 and 3 for the
 * contract this code implements.
 *
 * No SDK initialization here — we reuse the singleton from
 * `src/lib/firebase-admin.ts`.
 */

// ----------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------

export type SnapshotId = 'current' | string // 'current' or 'YYYY-MM-DD'
export type MirrorOutcome = 'written' | 'stale'
export type FilesCollection = 'documents.files' | 'assets.files'
export type ChunkOwnerCollection = 'documents' | 'assets'

export interface ChunkPayload {
  n: number
  data: Buffer
}

export interface BackupFailureEntry {
  collection: string
  docId: string
  operation: string
  error: string
  stack?: string
  retryCount?: number
  elapsedMs?: number
}

// ----------------------------------------------------------------------
// cleanForFirestore
// ----------------------------------------------------------------------

/**
 * Convert arbitrary Mongoose / MongoDB / Extended-JSON value into a
 * Firestore-compatible shape.
 *
 * Handles both native types (from `.toObject()` / `.lean()` outputs in the
 * hot path and PIT Function) and Extended-JSON wrappers (defensive — the
 * original transform in `scripts/backup/upload-to-firestore.cjs:128-151`
 * only saw EJSON because it read JSON dump files).
 *
 * - native ObjectId → hex string                  (recursive; covers FK fields)
 * - `{ $oid: string }` → string                   (EJSON defensive)
 * - native Date → Firestore Timestamp
 * - `{ $date: string|number }` → Firestore Timestamp
 * - native Buffer → placeholder string            (chunks go through writeChunks separately)
 * - `{ $base64: string }` → placeholder string    (EJSON defensive)
 * - `__v` key renamed to `_v`                     (Firestore rejects leading __)
 */
export function cleanForFirestore(value: any): any {
  if (value === null || value === undefined) return null

  if (value instanceof Date) {
    return admin.firestore.Timestamp.fromDate(value)
  }

  if (Buffer.isBuffer(value)) {
    return '[binary-in-local-backup]'
  }

  // Native BSON ObjectId — duck-typed so we don't depend on a specific
  // bson/mongoose version constructor.
  if (
    typeof value === 'object' &&
    typeof (value as any).toHexString === 'function' &&
    ((value as any)._bsontype === 'ObjectId' ||
      (value as any)._bsontype === 'ObjectID' ||
      (value as any).constructor?.name === 'ObjectId')
  ) {
    return (value as any).toHexString()
  }

  if (Array.isArray(value)) {
    return value.map(cleanForFirestore)
  }

  if (typeof value === 'object') {
    // Extended-JSON defensive detection
    if (typeof (value as any).$oid === 'string') return (value as any).$oid
    if ((value as any).$date !== undefined) {
      const d = (value as any).$date
      return admin.firestore.Timestamp.fromDate(new Date(d))
    }
    if (typeof (value as any).$base64 === 'string') return '[binary-in-local-backup]'

    const out: Record<string, any> = {}
    for (const [key, val] of Object.entries(value)) {
      const cleanKey = key === '__v' ? '_v' : key
      out[cleanKey] = cleanForFirestore(val)
    }
    return out
  }

  return value
}

// ----------------------------------------------------------------------
// Firestore mirror writes
// ----------------------------------------------------------------------

function docIdOf(doc: Record<string, any>): string {
  const id = doc._id
  if (id == null) throw new Error('cannot mirror doc without _id')
  if (typeof id === 'string') return id
  if (typeof id.toHexString === 'function') return id.toHexString()
  return String(id)
}

async function mirrorWithVersionGate(
  ref: FirebaseFirestore.DocumentReference,
  cleaned: Record<string, any>,
  syncVersion: number,
  isPit: boolean,
): Promise<MirrorOutcome> {
  if (isPit) {
    // Dated snapshots are immutable writes — no version comparison.
    await ref.set(cleaned)
    return 'written'
  }

  // Fast pre-check outside the transaction — lets stale arrivals
  // short-circuit without paying the round-trip cost of a runTransaction.
  const existing = await ref.get()
  if (existing.exists) {
    const priorVersion = (existing.data()?._syncVersion as number | undefined) ?? 0
    if (priorVersion >= syncVersion) return 'stale'
  }

  // Conditional write inside a transaction closes the race window that the
  // pre-check alone leaves open. Last-writer-wins by _syncVersion.
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    if (snap.exists) {
      const priorVersion = (snap.data()?._syncVersion as number | undefined) ?? 0
      if (priorVersion >= syncVersion) return 'stale' as const
    }
    tx.set(ref, cleaned)
    return 'written' as const
  })
}

/**
 * Mirror a model document (Document / Client / Asset / AdminUser) to
 * `mongodb_backup/{snapshotId}/{collection}/{docId}`.
 *
 * Returns `'stale'` when the incoming `syncVersion` doesn't win against the
 * currently stored `_syncVersion` — caller must treat this as a no-op and
 * must NOT run post-write cleanup on stale results (prevents the
 * delete-then-resurrect orphan leak).
 */
export async function mirrorDocument(
  doc: Record<string, any>,
  collection: string,
  syncVersion: number,
  snapshotId: SnapshotId,
): Promise<MirrorOutcome> {
  const docId = docIdOf(doc)
  const ref = db.doc(`mongodb_backup/${snapshotId}/${collection}/${docId}`)
  const cleaned = cleanForFirestore(doc) as Record<string, any>
  cleaned._syncVersion = syncVersion
  return mirrorWithVersionGate(ref, cleaned, syncVersion, snapshotId !== 'current')
}

/**
 * Mirror a GridFS `*.files` sibling record. Same version-gated contract
 * as `mirrorDocument`; path segment is the caller-supplied collection
 * (`documents.files` or `assets.files`).
 */
export async function mirrorFilesDoc(
  filesDoc: Record<string, any>,
  collection: FilesCollection,
  syncVersion: number,
  snapshotId: SnapshotId,
): Promise<MirrorOutcome> {
  const docId = docIdOf(filesDoc)
  const ref = db.doc(`mongodb_backup/${snapshotId}/${collection}/${docId}`)
  const cleaned = cleanForFirestore(filesDoc) as Record<string, any>
  cleaned._syncVersion = syncVersion
  return mirrorWithVersionGate(ref, cleaned, syncVersion, snapshotId !== 'current')
}

// ----------------------------------------------------------------------
// Storage chunk writes + deletes
// ----------------------------------------------------------------------

/**
 * Write GridFS chunks for a specific (docId, fileId) pair into
 * `backups/{snapshotId}/{docId}/{fileId}/chunks/{n}.bin`.
 *
 * fileId-scoped prefix is load-bearing (plan Constitution item 2):
 * concurrent rotations for the same docId never collide on object names,
 * and the loser-prefix cleanup path becomes a safe `deleteFiles` over a
 * single prefix.
 *
 * `resumable: false` — probe p95 on a 225 KB chunk was 210 ms via the
 * simple upload path; resumable would add handshake overhead.
 */
export async function writeChunks(
  docId: string,
  fileId: string,
  chunks: ChunkPayload[],
  snapshotId: SnapshotId,
): Promise<void> {
  if (chunks.length === 0) return
  const prefix = `backups/${snapshotId}/${docId}/${fileId}/chunks`
  await Promise.all(
    chunks.map((c) =>
      bucket.file(`${prefix}/${c.n}.bin`).save(c.data, {
        resumable: false,
        contentType: 'application/octet-stream',
      }),
    ),
  )
}

/**
 * Delete every object under `backups/{snapshotId}/{docId}/{fileId}/chunks/`.
 *
 * Used both for:
 *   - old-fileId cleanup after a winning rotation transaction, and
 *   - loser-prefix cleanup after a stale / failed transaction on
 *     a rotation path.
 */
export async function deleteChunkPrefix(
  docId: string,
  fileId: string,
  snapshotId: SnapshotId,
): Promise<void> {
  const prefix = `backups/${snapshotId}/${docId}/${fileId}/chunks/`
  await bucket.deleteFiles({ prefix, force: true })
}

// ----------------------------------------------------------------------
// cleanupStaleFileId (R13 mitigation)
// ----------------------------------------------------------------------

/**
 * Delete the old `*.files` Firestore doc for `oldFileId` and its Storage
 * chunk prefix. Non-negotiable — without this, `mongodb_backup/current/`
 * accumulates stale file metadata + chunk blobs on every PL/COO regen
 * (plan Risk R13).
 *
 * Caller is responsible for only invoking this AFTER the corresponding
 * Firestore mirror transaction has succeeded on a rotation (i.e. the new
 * fileId has already won). Stale arrivals must skip this entirely.
 */
export async function cleanupStaleFileId(
  docId: string,
  oldFileId: string,
  collection: ChunkOwnerCollection,
  snapshotId: SnapshotId,
): Promise<void> {
  const filesCollection: FilesCollection =
    collection === 'documents' ? 'documents.files' : 'assets.files'
  await db
    .doc(`mongodb_backup/${snapshotId}/${filesCollection}/${oldFileId}`)
    .delete()
  await deleteChunkPrefix(docId, oldFileId, snapshotId)
}

// ----------------------------------------------------------------------
// recordBackupFailure (best-effort MongoDB insert + soft cap)
// ----------------------------------------------------------------------

const SOFT_CAP = 1000

/**
 * Insert a failure row into the MongoDB `backupfailures` collection.
 *
 * Soft cap at 1000 rows — non-atomic (countDocuments + find+limit+delete).
 * Under heavy concurrent failure bursts this may overshoot transiently;
 * the 90-day TTL index (Phase 4) is the real retention bound.
 *
 * Uses a driver-level collection handle so it doesn't depend on the
 * `BackupFailure` Mongoose model (which lands in Phase 4).
 */
export async function recordBackupFailure(entry: BackupFailureEntry): Promise<void> {
  const conn = mongoose.connection
  if (!conn || conn.readyState !== 1 || !conn.db) {
    // MongoDB connection not up — nowhere to record. Swallow; the PIT
    // snapshot remains the ground-truth recovery path.
    return
  }
  const coll = conn.db.collection('backupfailures')
  await coll.insertOne({
    collection: entry.collection,
    docId: entry.docId,
    operation: entry.operation,
    error: entry.error,
    stack: entry.stack,
    retryCount: entry.retryCount ?? 0,
    elapsedMs: entry.elapsedMs,
    createdAt: new Date(),
  })

  // Best-effort soft cap. Failures here are non-fatal (TTL bounds growth).
  try {
    const count = await coll.countDocuments()
    if (count > SOFT_CAP) {
      const excess = count - SOFT_CAP
      const oldest = await coll
        .find({}, { projection: { _id: 1 } })
        .sort({ createdAt: 1 })
        .limit(excess)
        .toArray()
      if (oldest.length > 0) {
        await coll.deleteMany({ _id: { $in: oldest.map((d: any) => d._id) } })
      }
    }
  } catch {
    // soft-cap pruning failure is non-fatal
  }
}
