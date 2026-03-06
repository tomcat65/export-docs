import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import path from 'path'

/**
 * Task 008: BOL Document Folder — replace document (supersede)
 *
 * These tests verify:
 * 1. Document model has status + supersededBy fields
 * 2. Upload-associated route handles replaceDocId parameter
 * 3. Old document marked as superseded, new document created active
 * 4. Folder docs API filters out superseded documents
 * 5. Dashboard page passes replaceDocId when replacing
 */

const ROOT = path.resolve(__dirname, '..')
const SRC = path.join(ROOT, 'src')

// ---------- Document Model: supersede fields ----------

describe('Document model: status + supersededBy fields', () => {
  const modelPath = path.join(SRC, 'models/Document.ts')
  const modelContent = readFileSync(modelPath, 'utf-8')

  it('IDocument interface has status field', () => {
    expect(modelContent).toContain("status?: 'active' | 'superseded'")
  })

  it('IDocument interface has supersededBy field', () => {
    expect(modelContent).toContain('supersededBy?: mongoose.Types.ObjectId')
  })

  it('schema defines status with enum and default active', () => {
    expect(modelContent).toContain("enum: ['active', 'superseded']")
    expect(modelContent).toContain("default: 'active'")
  })

  it('schema defines supersededBy as ObjectId ref to Document', () => {
    expect(modelContent).toContain('supersededBy:')
    expect(modelContent).toMatch(/supersededBy[\s\S]*ref:\s*'Document'/)
  })

  it('has index on relatedBolId + status for efficient filtering', () => {
    expect(modelContent).toContain("documentSchema.index({ relatedBolId: 1, status: 1 })")
  })
})

// ---------- Upload-Associated Route: supersede logic ----------

describe('API: upload-associated route — supersede logic', () => {
  const routePath = path.join(SRC, 'app/api/documents/[id]/upload-associated/route.ts')
  const routeContent = readFileSync(routePath, 'utf-8')

  it('Zod schema accepts optional replaceDocId', () => {
    expect(routeContent).toContain('replaceDocId: z.string().optional()')
  })

  it('reads replaceDocId from form data', () => {
    expect(routeContent).toContain("formData.get('replaceDocId')")
  })

  it('validates replaceDocId format if provided', () => {
    expect(routeContent).toContain('Invalid replaceDocId format')
    expect(routeContent).toContain('ObjectId.isValid(replaceDocId)')
  })

  it('verifies old document exists before replacing', () => {
    expect(routeContent).toContain('Document to replace not found')
  })

  it('verifies replacement type matches original type', () => {
    expect(routeContent).toContain('Replacement document type must match the original')
  })

  it('creates new document with status active', () => {
    expect(routeContent).toContain("status: 'active'")
  })

  it('marks old document as superseded with supersededBy reference', () => {
    expect(routeContent).toContain("status: 'superseded'")
    expect(routeContent).toContain('supersededBy: newDocument._id')
  })

  it('uses findByIdAndUpdate to mark old doc superseded', () => {
    expect(routeContent).toContain('Document.findByIdAndUpdate(replaceDocId')
  })

  it('old GridFS file is NOT deleted (immutable per constitution)', () => {
    // Must NOT contain any GridFS delete operations
    expect(routeContent).not.toContain('bucket.delete')
    expect(routeContent).not.toContain('GridFSBucket.delete')
    expect(routeContent).not.toMatch(/\.delete\(.*fileId/)
  })
})

// ---------- Folder Docs API: filters superseded ----------

describe('API: folder docs route — filters superseded', () => {
  const routePath = path.join(SRC, 'app/api/documents/[id]/documents/route.ts')
  const routeContent = readFileSync(routePath, 'utf-8')

  it('filters out superseded documents from query', () => {
    expect(routeContent).toContain("status: { $ne: 'superseded' }")
  })

  it('serializes status field in response', () => {
    expect(routeContent).toContain("status: doc.status ?? 'active'")
  })

  it('serializes supersededBy field in response', () => {
    expect(routeContent).toContain('supersededBy: doc.supersededBy')
  })
})

// ---------- Dashboard Page: passes replaceDocId ----------

describe('Page: document folder — replace wiring', () => {
  const pagePath = path.join(SRC, 'app/dashboard/documents/[id]/page.tsx')
  const pageContent = readFileSync(pagePath, 'utf-8')

  it('tracks pendingReplaceDocId state', () => {
    expect(pageContent).toContain('pendingReplaceDocId')
    expect(pageContent).toContain('setPendingReplaceDocId')
  })

  it('handleUploadClick accepts optional replaceDocId parameter', () => {
    expect(pageContent).toMatch(/handleUploadClick\(type:\s*DocType,\s*replaceDocId\?/)
  })

  it('uploadAssociatedDocument accepts optional replaceDocId', () => {
    expect(pageContent).toMatch(/uploadAssociatedDocument\(\s*\n?\s*bolId.*\n?.*file.*\n?.*type.*\n?.*replaceDocId/)
  })

  it('appends replaceDocId to FormData when provided', () => {
    expect(pageContent).toContain("formData.append('replaceDocId', replaceDocId)")
  })

  it('mutation passes replaceDocId', () => {
    expect(pageContent).toContain('replaceDocId: pendingReplaceDocId')
  })

  it('DocumentCard onReplace passes doc._id', () => {
    expect(pageContent).toContain('onReplace(doc.type, doc._id)')
  })

  it('clears pendingReplaceDocId on success and error', () => {
    // Both onSuccess and onError should clear it
    const successSection = pageContent.slice(
      pageContent.indexOf('onSuccess:'),
      pageContent.indexOf('onError:')
    )
    expect(successSection).toContain('setPendingReplaceDocId(null)')

    const errorSection = pageContent.slice(
      pageContent.indexOf('onError:'),
      pageContent.indexOf('onError:') + 200
    )
    expect(errorSection).toContain('setPendingReplaceDocId(null)')
  })
})

// ---------- Integration: full replace flow wiring ----------

describe('Integration: replace flow — page → API → model', () => {
  it('page sends replaceDocId in FormData to upload-associated API', () => {
    const pagePath = path.join(SRC, 'app/dashboard/documents/[id]/page.tsx')
    const pageContent = readFileSync(pagePath, 'utf-8')

    // Page appends replaceDocId to FormData
    expect(pageContent).toContain("formData.append('replaceDocId'")
    // Page posts to upload-associated via routes
    expect(pageContent).toContain('routes.api.documents.uploadAssociated')
  })

  it('API route reads replaceDocId and updates Document model', () => {
    const routePath = path.join(SRC, 'app/api/documents/[id]/upload-associated/route.ts')
    const routeContent = readFileSync(routePath, 'utf-8')

    // Route reads replaceDocId from Zod-validated data
    expect(routeContent).toContain('replaceDocId')
    // Route calls Document.findByIdAndUpdate to set superseded
    expect(routeContent).toContain('Document.findByIdAndUpdate')
    expect(routeContent).toContain("status: 'superseded'")
    expect(routeContent).toContain('supersededBy: newDocument._id')
  })

  it('Document model supports status and supersededBy fields used by API', () => {
    const modelPath = path.join(SRC, 'models/Document.ts')
    const modelContent = readFileSync(modelPath, 'utf-8')

    expect(modelContent).toContain("'active'")
    expect(modelContent).toContain("'superseded'")
    expect(modelContent).toContain('supersededBy')
  })

  it('folder docs API filters superseded docs that the upload route creates', () => {
    const folderRoutePath = path.join(SRC, 'app/api/documents/[id]/documents/route.ts')
    const folderRouteContent = readFileSync(folderRoutePath, 'utf-8')

    expect(folderRouteContent).toContain("status: { $ne: 'superseded' }")
  })
})
