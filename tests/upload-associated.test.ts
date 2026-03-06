import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'fs'
import path from 'path'

/**
 * Task 007: BOL Document Folder — upload associated documents
 *
 * These tests verify:
 * 1. The upload-associated API route exists and has correct structure
 * 2. Zod validation is used for input validation
 * 3. Only INVOICE_EXPORT, COA, SED types are accepted
 * 4. Admin auth is required
 * 5. File is stored in GridFS, Document record created with relatedBolId
 * 6. The folder view page wires the upload flow
 * 7. routes.ts has the uploadAssociated route
 */

const ROOT = path.resolve(__dirname, '..')
const SRC = path.join(ROOT, 'src')

// ---------- API Route: /api/documents/[id]/upload-associated ----------

describe('API: /api/documents/[id]/upload-associated/route.ts', () => {
  const routePath = path.join(SRC, 'app/api/documents/[id]/upload-associated/route.ts')

  it('file exists', () => {
    expect(existsSync(routePath)).toBe(true)
  })

  const routeContent = existsSync(routePath) ? readFileSync(routePath, 'utf-8') : ''

  it('exports a POST handler', () => {
    expect(routeContent).toMatch(/export\s+async\s+function\s+POST/)
  })

  it('requires admin authentication', () => {
    expect(routeContent).toContain('auth()')
    expect(routeContent).toContain('isAdmin')
    expect(routeContent).toContain('Unauthorized')
  })

  it('uses Zod schema for input validation', () => {
    expect(routeContent).toContain("from 'zod'")
    expect(routeContent).toContain('z.object')
    expect(routeContent).toContain('z.enum')
    expect(routeContent).toContain('safeParse')
  })

  it('accepts only INVOICE_EXPORT, COA, SED types', () => {
    expect(routeContent).toContain("'INVOICE_EXPORT'")
    expect(routeContent).toContain("'COA'")
    expect(routeContent).toContain("'SED'")
    // Should define these as allowed types
    expect(routeContent).toContain('ALLOWED_TYPES')
  })

  it('validates PDF-only file uploads', () => {
    expect(routeContent).toContain('application/pdf')
    // Should reject non-PDF files
    expect(routeContent).toContain('Only PDF files are accepted')
  })

  it('stores file in GridFS', () => {
    expect(routeContent).toContain('GridFSBucket')
    expect(routeContent).toContain('openUploadStream')
    expect(routeContent).toContain("bucketName: 'documents'")
  })

  it('creates Document record with relatedBolId', () => {
    expect(routeContent).toContain('Document.create')
    expect(routeContent).toContain('relatedBolId')
    expect(routeContent).toContain('bolObjectId')
  })

  it('inherits clientId from parent BOL document', () => {
    // Must find the BOL first, then use its clientId
    expect(routeContent).toContain('Document.findById')
    expect(routeContent).toContain('clientId')
    // The clientId should come from the BOL doc, not from the request
    expect(routeContent).toMatch(/clientId.*bolDoc/)
  })

  it('verifies the target document is a BOL type', () => {
    expect(routeContent).toContain("type !== 'BOL'")
    expect(routeContent).toContain('not a BOL')
  })

  it('validates ObjectId format', () => {
    expect(routeContent).toContain('ObjectId.isValid')
  })

  it('returns serialized document on success', () => {
    expect(routeContent).toContain('success: true')
    expect(routeContent).toContain('document:')
  })

  it('sets subType to EXPORT for INVOICE_EXPORT', () => {
    expect(routeContent).toContain("'EXPORT'")
    expect(routeContent).toContain('INVOICE_EXPORT')
  })

  it('returns clear error messages on failure', () => {
    // Should not silently fail (SIGN-007)
    expect(routeContent).toContain('error:')
    // Multiple error paths should return meaningful messages
    expect(routeContent).toContain('No file provided')
    expect(routeContent).toContain('Invalid document type')
    expect(routeContent).toContain('BOL document not found')
  })
})

// ---------- Folder View Page: upload wiring ----------

describe('Page: /dashboard/documents/[id]/page.tsx — upload wiring', () => {
  const pagePath = path.join(SRC, 'app/dashboard/documents/[id]/page.tsx')
  const pageContent = readFileSync(pagePath, 'utf-8')

  it('imports useMutation and useQueryClient from TanStack Query', () => {
    expect(pageContent).toContain('useMutation')
    expect(pageContent).toContain('useQueryClient')
  })

  it('has a hidden file input for PDF uploads', () => {
    expect(pageContent).toContain('type="file"')
    expect(pageContent).toContain('accept="application/pdf"')
    expect(pageContent).toContain('fileInputRef')
  })

  it('calls uploadAssociated route from routes.ts', () => {
    expect(pageContent).toContain('routes.api.documents.uploadAssociated')
  })

  it('uses FormData to send file + type to API', () => {
    expect(pageContent).toContain('new FormData')
    expect(pageContent).toContain("formData.append('file'")
    expect(pageContent).toContain("formData.append('type'")
  })

  it('invalidates folder query on successful upload', () => {
    expect(pageContent).toContain('invalidateQueries')
    expect(pageContent).toContain('bol-folder')
  })

  it('shows upload error messages to user', () => {
    expect(pageContent).toContain('uploadError')
    expect(pageContent).toContain('setUploadError')
    // Error should be visible in the UI
    expect(pageContent).toContain('Dismiss')
  })

  it('Upload button in EmptySlot calls onUpload handler', () => {
    // EmptySlot has onUpload prop
    expect(pageContent).toContain('onUpload?.(type)')
    // handleUploadClick is wired to EmptySlot
    expect(pageContent).toContain('onUpload={handleUploadClick}')
  })

  it('Replace button in DocumentCard calls onReplace handler', () => {
    // DocumentCard has onReplace prop
    expect(pageContent).toContain('onReplace')
    expect(pageContent).toContain('onReplace={handleUploadClick}')
  })

  it('shows loading spinner during upload', () => {
    expect(pageContent).toContain('isPending')
    expect(pageContent).toContain('animate-spin')
  })

  it('validates PDF type client-side before uploading', () => {
    expect(pageContent).toContain("file.type !== 'application/pdf'")
    expect(pageContent).toContain('Only PDF files are accepted')
  })
})

// ---------- Wiring: routes.ts ----------

describe('Wiring: routes.ts has uploadAssociated', () => {
  const routesPath = path.join(SRC, 'lib/routes.ts')
  const routesContent = readFileSync(routesPath, 'utf-8')

  it('routes.ts has api.documents.uploadAssociated route', () => {
    expect(routesContent).toContain('uploadAssociated:')
    expect(routesContent).toContain('/upload-associated')
  })

  it('uploadAssociated route generates correct path pattern', () => {
    expect(routesContent).toMatch(/uploadAssociated.*\/api\/documents\/.*\/upload-associated/)
  })

  it('actual API route file exists at the expected path', () => {
    const apiRoutePath = path.join(SRC, 'app/api/documents/[id]/upload-associated/route.ts')
    expect(existsSync(apiRoutePath)).toBe(true)
  })
})

// ---------- Integration: page -> API wiring ----------

describe('Integration: page uploads to API via routes.ts', () => {
  it('page imports routes and uses uploadAssociated to construct fetch URL', () => {
    const pagePath = path.join(SRC, 'app/dashboard/documents/[id]/page.tsx')
    const pageContent = readFileSync(pagePath, 'utf-8')

    // Page imports routes
    expect(pageContent).toContain("from '@/lib/routes'")
    // Page uses routes.api.documents.uploadAssociated
    expect(pageContent).toContain('routes.api.documents.uploadAssociated')
  })

  it('API route imports match project patterns (auth, connectDB, Document model)', () => {
    const routePath = path.join(SRC, 'app/api/documents/[id]/upload-associated/route.ts')
    const routeContent = readFileSync(routePath, 'utf-8')

    expect(routeContent).toContain("from '@/lib/auth'")
    expect(routeContent).toContain("from '@/lib/db'")
    expect(routeContent).toContain("from '@/models/Document'")
  })

  it('upload mutation sends POST with FormData to the upload-associated endpoint', () => {
    const pagePath = path.join(SRC, 'app/dashboard/documents/[id]/page.tsx')
    const pageContent = readFileSync(pagePath, 'utf-8')

    // Must use POST method
    expect(pageContent).toContain("method: 'POST'")
    // Must send FormData as body
    expect(pageContent).toContain('body: formData')
  })

  it('Document model supports all required types (INVOICE_EXPORT, COA, SED)', () => {
    const modelPath = path.join(SRC, 'models/Document.ts')
    const modelContent = readFileSync(modelPath, 'utf-8')

    expect(modelContent).toContain("'INVOICE_EXPORT'")
    expect(modelContent).toContain("'COA'")
    expect(modelContent).toContain("'SED'")
  })
})
