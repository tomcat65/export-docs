import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { db, bucket } from '@/lib/firebase-admin'

// firebase-admin needs Node runtime (native modules via grpc transitively).
export const runtime = 'nodejs'
// Ten-iter bench + cleanup can exceed default Hobby 10s; Fluid supports 60s.
export const maxDuration = 60

/*
 * Short-lived DR hot-path latency probe.
 * Phase 1 item 007 of .spectra/plan-dr-path2.md.
 *
 * Writes to isolated _latency_test paths under mongodb_backup/ + backups/,
 * cleans up on exit. Gated by CRON_SECRET bearer. To be removed after the
 * measurement that informs Phase 3 BACKUP_ENABLED=true go/no-go.
 *
 * NOTE: plan text says /api/_probe/... but Next.js App Router treats folders
 * beginning with "_" as private (opt out of routing). Actual route is
 * /api/probe/backup-latency. Non-semantic deviation from the frozen plan.
 */

const ITER = 10
const ROTATION_ITER = 5
const CHUNK_SIZE = 225 * 1024 // ≈ avg documents.chunks size in real dump
const FIRESTORE_ROOT = 'mongodb_backup/_latency_test'
const STORAGE_ROOT = 'backups/_latency_test'

type Bucket = { p50: number; p95: number; max: number }

function pct(arr: number[], p: number): number {
  const s = [...arr].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.floor(s.length * p))]
}

function stats(arr: number[]): Bucket {
  if (arr.length === 0) return { p50: 0, p95: 0, max: 0 }
  return {
    p50: +pct(arr, 0.5).toFixed(1),
    p95: +pct(arr, 0.95).toFixed(1),
    max: +Math.max(...arr).toFixed(1),
  }
}

async function cleanup(): Promise<void> {
  try {
    const docsSnap = await db.collection(`${FIRESTORE_ROOT}/documents`).get()
    if (!docsSnap.empty) {
      const batch = db.batch()
      docsSnap.docs.forEach((d) => batch.delete(d.ref))
      await batch.commit()
    }
    const filesSnap = await db.collection(`${FIRESTORE_ROOT}/documents.files`).get()
    if (!filesSnap.empty) {
      const batch = db.batch()
      filesSnap.docs.forEach((d) => batch.delete(d.ref))
      await batch.commit()
    }
    const [stFiles] = await bucket.getFiles({ prefix: STORAGE_ROOT })
    await Promise.all(stFiles.map((f) => f.delete().catch(() => {})))
  } catch {
    // non-fatal; best-effort cleanup
  }
}

const SAMPLE_DOC = {
  clientId: '000000000000000000000000',
  fileName: 'probe-sample.pdf',
  fileId: '111111111111111111111111',
  type: 'BOL',
  extractedData: {
    containers: Array.from({ length: 3 }, (_, i) => ({
      containerNumber: `PROBE${i}`,
      sealNumber: `SEAL${i}`,
      lineItems: [
        {
          packaging: 'DRUM',
          packagingQuantity: 10,
          product: 'Base Oil',
          volume: 1000,
          weight: 2500,
        },
      ],
    })),
    parties: {
      shipper: { name: 'Probe Shipper' },
      consignee: { name: 'Probe Consignee' },
    },
    commercial: { poNumber: 'PO-PROBE' },
  },
  createdAt: new Date(),
  updatedAt: new Date(),
}

const SAMPLE_FILES = {
  _id: '111111111111111111111111',
  length: CHUNK_SIZE * 3,
  chunkSize: CHUNK_SIZE,
  uploadDate: new Date(),
  filename: 'probe-sample.pdf',
  contentType: 'application/pdf',
}

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    return NextResponse.json(
      { ok: false, error: 'CRON_SECRET not configured on server' },
      { status: 500 },
    )
  }
  if (req.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  if (!db || !bucket) {
    return NextResponse.json(
      { ok: false, error: 'firebase-admin not initialized — check env vars' },
      { status: 500 },
    )
  }

  const started = Date.now()

  try {
    await cleanup()

    // T1 — Firestore Document metadata write (representative ~2 KB payload)
    const t1: number[] = []
    for (let i = 0; i < ITER; i++) {
      const id = `probe-doc-${i}-${Date.now()}`
      const t0 = process.hrtime.bigint()
      await db.doc(`${FIRESTORE_ROOT}/documents/${id}`).set(SAMPLE_DOC)
      t1.push(Number(process.hrtime.bigint() - t0) / 1e6)
    }

    // T2 — Firestore documents.files sibling write (~500 B payload)
    const t2: number[] = []
    for (let i = 0; i < ITER; i++) {
      const id = `probe-files-${i}-${Date.now()}`
      const t0 = process.hrtime.bigint()
      await db.doc(`${FIRESTORE_ROOT}/documents.files/${id}`).set(SAMPLE_FILES)
      t2.push(Number(process.hrtime.bigint() - t0) / 1e6)
    }

    // T3 — Storage chunk write (225 KB non-resumable)
    const payload = crypto.randomBytes(CHUNK_SIZE)
    const t3: number[] = []
    for (let i = 0; i < ITER; i++) {
      const path = `${STORAGE_ROOT}/probe-chunk-${i}-${Date.now()}.bin`
      const t0 = process.hrtime.bigint()
      await bucket.file(path).save(payload, {
        contentType: 'application/octet-stream',
        resumable: false,
      })
      t3.push(Number(process.hrtime.bigint() - t0) / 1e6)
    }

    // T4 — Full fileId rotation (write new files + 3 chunks, delete old files + 3 chunks)
    const t4: number[] = []
    for (let i = 0; i < ROTATION_ITER; i++) {
      const docId = `probe-rot-${i}-${Date.now()}`
      const oldFileId = `old-${i}`
      const newFileId = `new-${i}`
      const oldPaths = [0, 1, 2].map(
        (k) => `${STORAGE_ROOT}/${docId}/${oldFileId}/chunks/${k}.bin`,
      )
      const newPaths = [0, 1, 2].map(
        (k) => `${STORAGE_ROOT}/${docId}/${newFileId}/chunks/${k}.bin`,
      )

      // Seed stale state
      await db
        .doc(`${FIRESTORE_ROOT}/documents.files/${docId}__${oldFileId}`)
        .set({ _id: oldFileId })
      await Promise.all(
        oldPaths.map((p) =>
          bucket
            .file(p)
            .save(payload, { resumable: false, contentType: 'application/octet-stream' }),
        ),
      )

      // Measure rotation
      const t0 = process.hrtime.bigint()
      await db
        .doc(`${FIRESTORE_ROOT}/documents.files/${docId}__${newFileId}`)
        .set({ _id: newFileId })
      await Promise.all(
        newPaths.map((p) =>
          bucket
            .file(p)
            .save(payload, { resumable: false, contentType: 'application/octet-stream' }),
        ),
      )
      await db.doc(`${FIRESTORE_ROOT}/documents.files/${docId}__${oldFileId}`).delete()
      await Promise.all(oldPaths.map((p) => bucket.file(p).delete()))
      t4.push(Number(process.hrtime.bigint() - t0) / 1e6)

      // Cleanup new
      await db.doc(`${FIRESTORE_ROOT}/documents.files/${docId}__${newFileId}`).delete()
      await Promise.all(newPaths.map((p) => bucket.file(p).delete()))
    }

    await cleanup()

    const durationMs = Date.now() - started

    return NextResponse.json({
      ok: true,
      timestamp: new Date().toISOString(),
      bucket: bucket.name,
      iters: ITER,
      rotationIters: ROTATION_ITER,
      chunkSizeBytes: CHUNK_SIZE,
      durationMs,
      results: {
        firestoreDocWrite: stats(t1),
        firestoreFilesSibling: stats(t2),
        storageChunkWrite: stats(t3),
        fileIdRotation: stats(t4),
      },
    })
  } catch (err) {
    await cleanup().catch(() => {})
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - started,
      },
      { status: 500 },
    )
  }
}
