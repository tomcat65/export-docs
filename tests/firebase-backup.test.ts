import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/*
 * Unit tests for src/lib/firebase-backup.ts — pure helpers.
 *
 * Every external dependency is mocked. No real Firestore / Storage / MongoDB
 * calls are issued. Rotation ordering across helpers is a caller-level
 * concern and is exercised in Phase 3's backup-plugin.test.ts; here we
 * only verify per-helper behavior.
 *
 * Mock state is built inside vi.hoisted() so the factories passed to
 * vi.mock() (which vitest hoists to the top of the file) can reach it.
 */

const mocks = vi.hoisted(() => {
  type StoredDoc = Record<string, any>
  const firestoreStore = new Map<string, StoredDoc>()
  const setCalls: Array<{ path: string; data: StoredDoc }> = []
  const deleteCalls: Array<{ path: string }> = []
  const runTxCalls: Array<{ attempts: number }> = []
  const docRefCache = new Map<string, any>()

  const storageBlobs = new Map<string, Buffer>()
  const storageSaveCalls: Array<{ path: string; size: number }> = []
  const storageDeleteFilesCalls: Array<{ prefix: string; force: boolean | undefined }> = []

  function makeDocRef(path: string) {
    return {
      path,
      get: vi.fn(async () => {
        const data = firestoreStore.get(path)
        return {
          exists: data !== undefined,
          data: () => (data ? { ...data } : undefined),
        }
      }),
      set: vi.fn(async (data: StoredDoc) => {
        firestoreStore.set(path, { ...data })
        setCalls.push({ path, data: { ...data } })
      }),
      delete: vi.fn(async () => {
        firestoreStore.delete(path)
        deleteCalls.push({ path })
      }),
    }
  }

  function getDocRef(path: string) {
    let ref = docRefCache.get(path)
    if (!ref) {
      ref = makeDocRef(path)
      docRefCache.set(path, ref)
    }
    return ref
  }

  const mockDb = {
    doc: vi.fn((path: string) => getDocRef(path)),
    runTransaction: vi.fn(async <T>(fn: (tx: any) => Promise<T>): Promise<T> => {
      const call = { attempts: 0 }
      runTxCalls.push(call)
      const tx = {
        get: vi.fn(async (ref: any) => {
          call.attempts++
          const data = firestoreStore.get(ref.path)
          return {
            exists: data !== undefined,
            data: () => (data ? { ...data } : undefined),
          }
        }),
        set: vi.fn((ref: any, data: StoredDoc) => {
          firestoreStore.set(ref.path, { ...data })
          setCalls.push({ path: ref.path, data: { ...data } })
        }),
      }
      return fn(tx)
    }),
  }

  function makeFileRef(path: string) {
    return {
      save: vi.fn(async (data: Buffer) => {
        storageBlobs.set(path, Buffer.from(data))
        storageSaveCalls.push({ path, size: data.length })
      }),
    }
  }

  const mockBucket = {
    file: vi.fn((path: string) => makeFileRef(path)),
    deleteFiles: vi.fn(async (opts: { prefix: string; force?: boolean }) => {
      storageDeleteFilesCalls.push({ prefix: opts.prefix, force: opts.force })
      for (const key of Array.from(storageBlobs.keys())) {
        if (key.startsWith(opts.prefix)) storageBlobs.delete(key)
      }
    }),
  }

  class FakeTimestamp {
    constructor(
      public readonly seconds: number,
      public readonly nanoseconds: number,
    ) {}
    static fromDate(d: Date) {
      return new FakeTimestamp(Math.floor(d.getTime() / 1000), (d.getTime() % 1000) * 1e6)
    }
  }

  const mockAdmin = {
    firestore: {
      Timestamp: FakeTimestamp,
    },
  }

  const mongoCollection = {
    insertOne: vi.fn(async (_doc: any) => ({ acknowledged: true })),
    countDocuments: vi.fn(async () => 0),
    find: vi.fn(() => ({
      sort: vi.fn(() => ({
        limit: vi.fn(() => ({
          toArray: vi.fn(async () => []),
        })),
      })),
    })),
    deleteMany: vi.fn(async () => ({ deletedCount: 0 })),
  }

  const mongooseMock = {
    default: {
      connection: {
        readyState: 1,
        db: {
          collection: vi.fn(() => mongoCollection),
        },
      },
    },
  }

  return {
    firestoreStore,
    setCalls,
    deleteCalls,
    runTxCalls,
    docRefCache,
    storageBlobs,
    storageSaveCalls,
    storageDeleteFilesCalls,
    mockDb,
    mockBucket,
    mockAdmin,
    FakeTimestamp,
    mongoCollection,
    mongooseMock,
  }
})

vi.mock('@/lib/firebase-admin', () => ({
  db: mocks.mockDb,
  bucket: mocks.mockBucket,
  admin: mocks.mockAdmin,
}))

vi.mock('mongoose', () => mocks.mongooseMock)

import {
  cleanForFirestore,
  cleanupStaleFileId,
  deleteChunkPrefix,
  mirrorDocument,
  mirrorFilesDoc,
  recordBackupFailure,
  writeChunks,
} from '../src/lib/firebase-backup'

// ---- Shared reset --------------------------------------------------------

beforeEach(() => {
  mocks.firestoreStore.clear()
  mocks.setCalls.length = 0
  mocks.deleteCalls.length = 0
  mocks.runTxCalls.length = 0
  mocks.docRefCache.clear()
  mocks.storageBlobs.clear()
  mocks.storageSaveCalls.length = 0
  mocks.storageDeleteFilesCalls.length = 0
  vi.clearAllMocks()
  mocks.mongoCollection.countDocuments.mockResolvedValue(0 as any)
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ==========================================================================
// cleanForFirestore
// ==========================================================================

describe('cleanForFirestore', () => {
  it('converts native Date to Firestore Timestamp', () => {
    const d = new Date('2026-04-21T12:34:56Z')
    const out = cleanForFirestore({ createdAt: d })
    expect(out.createdAt).toBeInstanceOf(mocks.FakeTimestamp)
    expect((out.createdAt as any).seconds).toBe(Math.floor(d.getTime() / 1000))
  })

  it('renames __v to _v recursively', () => {
    const out = cleanForFirestore({ __v: 3, nested: { __v: 9, other: 1 } })
    expect(out._v).toBe(3)
    expect('__v' in out).toBe(false)
    expect(out.nested._v).toBe(9)
    expect('__v' in out.nested).toBe(false)
  })

  it('stringifies native BSON-ObjectId values (duck-typed)', () => {
    const fakeOid = {
      _bsontype: 'ObjectId',
      toHexString: () => 'abc123def456789012345678',
    }
    const out = cleanForFirestore({ _id: fakeOid, clientId: fakeOid })
    expect(out._id).toBe('abc123def456789012345678')
    expect(out.clientId).toBe('abc123def456789012345678')
  })

  it('unwraps Extended-JSON $oid / $date / $base64 defensively', () => {
    const out = cleanForFirestore({
      id: { $oid: 'deadbeef' },
      when: { $date: '2026-04-22T00:00:00Z' },
      bin: { $base64: 'aGVsbG8=' },
    })
    expect(out.id).toBe('deadbeef')
    expect(out.when).toBeInstanceOf(mocks.FakeTimestamp)
    expect(out.bin).toBe('[binary-in-local-backup]')
  })

  it('replaces Buffer values with the placeholder string', () => {
    const out = cleanForFirestore({ payload: Buffer.from([1, 2, 3]) })
    expect(out.payload).toBe('[binary-in-local-backup]')
  })

  it('recurses into arrays and preserves scalars', () => {
    const out = cleanForFirestore({ items: [1, 'x', { __v: 0 }], tag: 'y' })
    expect(out.items[0]).toBe(1)
    expect(out.items[1]).toBe('x')
    expect(out.items[2]._v).toBe(0)
    expect(out.tag).toBe('y')
  })
})

// ==========================================================================
// mirrorDocument — version gating
// ==========================================================================

describe('mirrorDocument', () => {
  it('writes the payload with _syncVersion when mirror is empty', async () => {
    const doc = { _id: 'doc-a', name: 'x', __v: 0 }
    const result = await mirrorDocument(doc, 'documents', 100, 'current')

    expect(result).toBe('written')
    const stored = mocks.firestoreStore.get('mongodb_backup/current/documents/doc-a')
    expect(stored).toBeDefined()
    expect(stored!._syncVersion).toBe(100)
    expect(stored!.name).toBe('x')
    expect(stored!._v).toBe(0)
    expect(mocks.setCalls).toHaveLength(1)
  })

  it('short-circuits to stale without a transaction when pre-check loses', async () => {
    const doc = { _id: 'doc-b', name: 'x' }
    mocks.firestoreStore.set('mongodb_backup/current/documents/doc-b', {
      name: 'older',
      _syncVersion: 500,
    })

    const result = await mirrorDocument(doc, 'documents', 100, 'current')

    expect(result).toBe('stale')
    expect(mocks.mockDb.runTransaction).not.toHaveBeenCalled()
    expect(mocks.setCalls).toHaveLength(0)
  })

  it('runs the transaction when pre-check passes and commits when it wins', async () => {
    const doc = { _id: 'doc-c', name: 'new' }
    const result = await mirrorDocument(doc, 'documents', 200, 'current')

    expect(result).toBe('written')
    expect(mocks.mockDb.runTransaction).toHaveBeenCalledTimes(1)
    expect(
      mocks.firestoreStore.get('mongodb_backup/current/documents/doc-c')?._syncVersion,
    ).toBe(200)
  })

  it('returns stale if the transaction observes a newer version after pre-check passed', async () => {
    const doc = { _id: 'doc-d', name: 'racer' }

    // pre-check returns empty...
    // ...but simulate a concurrent writer landing first by seeding the store
    // the moment runTransaction runs its inner get.
    mocks.mockDb.runTransaction.mockImplementationOnce(
      async <T>(fn: (tx: any) => Promise<T>) => {
        mocks.firestoreStore.set('mongodb_backup/current/documents/doc-d', {
          _syncVersion: 999,
        })
        const tx = {
          get: vi.fn(async (ref: any) => {
            const data = mocks.firestoreStore.get(ref.path)
            return { exists: data !== undefined, data: () => (data ? { ...data } : undefined) }
          }),
          set: vi.fn(),
        }
        return fn(tx)
      },
    )

    const result = await mirrorDocument(doc, 'documents', 300, 'current')
    expect(result).toBe('stale')
    // store keeps the concurrent writer's version, not ours
    expect(
      mocks.firestoreStore.get('mongodb_backup/current/documents/doc-d')?._syncVersion,
    ).toBe(999)
  })

  it('PIT-mode (dated snapshotId) skips both pre-check and transaction', async () => {
    const doc = { _id: 'doc-e', name: 'dated' }
    const result = await mirrorDocument(doc, 'documents', 42, '2026-04-22')

    expect(result).toBe('written')
    expect(mocks.mockDb.runTransaction).not.toHaveBeenCalled()
    // Pre-check get() is also skipped — only the final .set() should fire.
    const ref = mocks.docRefCache.get('mongodb_backup/2026-04-22/documents/doc-e')
    expect(ref?.get).not.toHaveBeenCalled()
    expect(ref?.set).toHaveBeenCalledTimes(1)
    expect(
      mocks.firestoreStore.get('mongodb_backup/2026-04-22/documents/doc-e')?._syncVersion,
    ).toBe(42)
  })

  it('stringifies BSON ObjectId _id when building the path', async () => {
    const fakeOid = {
      _bsontype: 'ObjectId',
      toHexString: () => 'abc123def456789012345678',
    }
    const doc = { _id: fakeOid, name: 'oid' }
    await mirrorDocument(doc, 'documents', 1, 'current')
    expect(
      mocks.firestoreStore.has('mongodb_backup/current/documents/abc123def456789012345678'),
    ).toBe(true)
  })
})

// ==========================================================================
// mirrorFilesDoc
// ==========================================================================

describe('mirrorFilesDoc', () => {
  it('writes files-collection sibling with version gate', async () => {
    const filesDoc = { _id: 'file-1', length: 1024 }
    const result = await mirrorFilesDoc(filesDoc, 'documents.files', 50, 'current')
    expect(result).toBe('written')
    expect(
      mocks.firestoreStore.get('mongodb_backup/current/documents.files/file-1')?._syncVersion,
    ).toBe(50)
  })
})

// ==========================================================================
// writeChunks + deleteChunkPrefix
// ==========================================================================

describe('writeChunks', () => {
  it('writes fileId-scoped chunk objects', async () => {
    await writeChunks(
      'doc-x',
      'file-a',
      [
        { n: 0, data: Buffer.from([1, 2, 3]) },
        { n: 1, data: Buffer.from([4, 5, 6]) },
      ],
      'current',
    )
    expect(mocks.storageSaveCalls.map((c) => c.path).sort()).toEqual([
      'backups/current/doc-x/file-a/chunks/0.bin',
      'backups/current/doc-x/file-a/chunks/1.bin',
    ])
  })

  it('no-ops on empty chunk array', async () => {
    await writeChunks('doc-x', 'file-a', [], 'current')
    expect(mocks.mockBucket.file).not.toHaveBeenCalled()
  })
})

describe('deleteChunkPrefix', () => {
  it('deletes only the target fileId prefix, leaves siblings intact', async () => {
    mocks.storageBlobs.set('backups/current/doc-y/old/chunks/0.bin', Buffer.from([1]))
    mocks.storageBlobs.set('backups/current/doc-y/old/chunks/1.bin', Buffer.from([2]))
    mocks.storageBlobs.set('backups/current/doc-y/new/chunks/0.bin', Buffer.from([9]))
    mocks.storageBlobs.set('backups/current/doc-z/old/chunks/0.bin', Buffer.from([8]))

    await deleteChunkPrefix('doc-y', 'old', 'current')

    expect(mocks.storageBlobs.has('backups/current/doc-y/old/chunks/0.bin')).toBe(false)
    expect(mocks.storageBlobs.has('backups/current/doc-y/old/chunks/1.bin')).toBe(false)
    expect(mocks.storageBlobs.has('backups/current/doc-y/new/chunks/0.bin')).toBe(true)
    expect(mocks.storageBlobs.has('backups/current/doc-z/old/chunks/0.bin')).toBe(true)
    expect(mocks.storageDeleteFilesCalls[0].prefix).toBe('backups/current/doc-y/old/chunks/')
    expect(mocks.storageDeleteFilesCalls[0].force).toBe(true)
  })
})

// ==========================================================================
// cleanupStaleFileId
// ==========================================================================

describe('cleanupStaleFileId', () => {
  it('deletes the old files doc and the old fileId chunk prefix', async () => {
    mocks.firestoreStore.set('mongodb_backup/current/documents.files/old-fid', {
      _id: 'old-fid',
    })
    mocks.firestoreStore.set('mongodb_backup/current/documents.files/new-fid', {
      _id: 'new-fid',
    })
    mocks.storageBlobs.set('backups/current/doc-r/old-fid/chunks/0.bin', Buffer.from([1]))
    mocks.storageBlobs.set('backups/current/doc-r/new-fid/chunks/0.bin', Buffer.from([2]))

    await cleanupStaleFileId('doc-r', 'old-fid', 'documents', 'current')

    expect(mocks.firestoreStore.has('mongodb_backup/current/documents.files/old-fid')).toBe(
      false,
    )
    expect(mocks.firestoreStore.has('mongodb_backup/current/documents.files/new-fid')).toBe(
      true,
    )
    expect(mocks.storageBlobs.has('backups/current/doc-r/old-fid/chunks/0.bin')).toBe(false)
    expect(mocks.storageBlobs.has('backups/current/doc-r/new-fid/chunks/0.bin')).toBe(true)
  })

  it('routes asset collection to assets.files', async () => {
    mocks.firestoreStore.set('mongodb_backup/current/assets.files/old-asset', {
      _id: 'old-asset',
    })
    await cleanupStaleFileId('asset-r', 'old-asset', 'assets', 'current')
    expect(mocks.firestoreStore.has('mongodb_backup/current/assets.files/old-asset')).toBe(
      false,
    )
    expect(mocks.storageDeleteFilesCalls[0].prefix).toBe(
      'backups/current/asset-r/old-asset/chunks/',
    )
  })
})

// ==========================================================================
// recordBackupFailure
// ==========================================================================

describe('recordBackupFailure', () => {
  it('inserts a failure row with createdAt and defaults', async () => {
    await recordBackupFailure({
      collection: 'documents',
      docId: 'doc-r',
      operation: 'save',
      error: 'boom',
    })
    expect(mocks.mongoCollection.insertOne).toHaveBeenCalledTimes(1)
    const inserted = mocks.mongoCollection.insertOne.mock.calls[0][0]
    expect(inserted.collection).toBe('documents')
    expect(inserted.docId).toBe('doc-r')
    expect(inserted.operation).toBe('save')
    expect(inserted.error).toBe('boom')
    expect(inserted.retryCount).toBe(0)
    expect(inserted.createdAt).toBeInstanceOf(Date)
  })

  it('prunes oldest rows when count exceeds soft cap', async () => {
    mocks.mongoCollection.countDocuments.mockResolvedValueOnce(1003 as any)
    const oldest = [{ _id: 'a' }, { _id: 'b' }, { _id: 'c' }]
    mocks.mongoCollection.find.mockReturnValueOnce({
      sort: () => ({
        limit: () => ({
          toArray: async () => oldest,
        }),
      }),
    } as any)

    await recordBackupFailure({
      collection: 'documents',
      docId: 'over',
      operation: 'save',
      error: 'overflow',
    })
    expect(mocks.mongoCollection.deleteMany).toHaveBeenCalledWith({
      _id: { $in: ['a', 'b', 'c'] },
    })
  })

  it('skips soft-cap prune when count is within bound', async () => {
    mocks.mongoCollection.countDocuments.mockResolvedValueOnce(500 as any)
    await recordBackupFailure({
      collection: 'documents',
      docId: 'ok',
      operation: 'save',
      error: 'fine',
    })
    expect(mocks.mongoCollection.deleteMany).not.toHaveBeenCalled()
  })

  it('swallows soft-cap pruning errors without rethrowing', async () => {
    mocks.mongoCollection.countDocuments.mockRejectedValueOnce(new Error('boom'))
    await expect(
      recordBackupFailure({
        collection: 'documents',
        docId: 'safe',
        operation: 'save',
        error: 'fine',
      }),
    ).resolves.toBeUndefined()
    expect(mocks.mongoCollection.insertOne).toHaveBeenCalledTimes(1)
  })

  it('swallows insertOne rejection, logs via console.error, returns undefined', async () => {
    mocks.mongoCollection.insertOne.mockRejectedValueOnce(new Error('atlas-blip'))
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      await expect(
        recordBackupFailure({
          collection: 'documents',
          docId: 'insert-fail',
          operation: 'save',
          error: 'primary',
        }),
      ).resolves.toBeUndefined()
      expect(consoleSpy).toHaveBeenCalledTimes(1)
      expect(consoleSpy).toHaveBeenCalledWith(
        'recordBackupFailure: failed to insert failure log',
        expect.objectContaining({
          collection: 'documents',
          docId: 'insert-fail',
          operation: 'save',
          insertErrorMessage: 'atlas-blip',
        }),
      )
      // Soft-cap prune must NOT run when insert failed.
      expect(mocks.mongoCollection.countDocuments).not.toHaveBeenCalled()
      expect(mocks.mongoCollection.deleteMany).not.toHaveBeenCalled()
    } finally {
      consoleSpy.mockRestore()
    }
  })
})
