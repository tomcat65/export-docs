import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'fs'
import path from 'path'

/**
 * Task 006: BOL Document Folder tests
 *
 * These tests verify:
 * 1. The folder view page exists and uses TanStack Query
 * 2. The API route fetches by BOL document ID (not clientId)
 * 3. Wiring: routes.ts has folder + folderDocs routes
 * 4. Providers.tsx includes QueryClientProvider
 */

const ROOT = path.resolve(__dirname, '..')
const SRC = path.join(ROOT, 'src')

// ---------- API Route tests ----------

describe('API: /api/documents/[id]/documents/route.ts', () => {
  const routePath = path.join(SRC, 'app/api/documents/[id]/documents/route.ts')
  const routeContent = readFileSync(routePath, 'utf-8')

  it('file exists', () => {
    expect(existsSync(routePath)).toBe(true)
  })

  it('exports a GET handler', () => {
    expect(routeContent).toMatch(/export\s+async\s+function\s+GET/)
  })

  it('queries by BOL document ID using findById', () => {
    // Must find the BOL document itself first
    expect(routeContent).toContain('Document.findById')
  })

  it('queries related documents via relatedBolId', () => {
    expect(routeContent).toContain('relatedBolId')
    expect(routeContent).toMatch(/Document\.find\(\s*\{\s*relatedBolId/)
  })

  it('validates the document is a BOL type', () => {
    expect(routeContent).toContain("type !== 'BOL'")
  })

  it('requires authentication', () => {
    expect(routeContent).toContain('auth()')
    expect(routeContent).toContain('isAdmin')
  })

  it('returns serialized documents array', () => {
    expect(routeContent).toContain('NextResponse.json({ documents:')
  })
})

// ---------- Folder View Page tests ----------

describe('Page: /dashboard/documents/[id]/page.tsx', () => {
  const pagePath = path.join(SRC, 'app/dashboard/documents/[id]/page.tsx')
  const pageContent = readFileSync(pagePath, 'utf-8')

  it('file exists', () => {
    expect(existsSync(pagePath)).toBe(true)
  })

  it('is a client component', () => {
    expect(pageContent).toMatch(/['"]use client['"]/)
  })

  it('uses TanStack Query (useQuery), NOT SWR', () => {
    expect(pageContent).toContain("from '@tanstack/react-query'")
    expect(pageContent).toContain('useQuery')
    // Must NOT use SWR
    expect(pageContent).not.toContain('useSWR')
    expect(pageContent).not.toContain("from 'swr'")
  })

  it('fetches from the folder documents API endpoint', () => {
    expect(pageContent).toContain('folderDocs')
  })

  it('renders type badges for each document type', () => {
    expect(pageContent).toContain('typeBadgeColor')
    expect(pageContent).toContain('typeLabel')
  })

  it('shows View and Download buttons for all documents', () => {
    expect(pageContent).toContain('View')
    expect(pageContent).toContain('Download')
  })

  it('shows Regenerate button for generated docs (COO, PL)', () => {
    expect(pageContent).toContain('Regenerate')
    expect(pageContent).toContain('GENERATED_TYPES')
  })

  it('shows Replace button for upload-only docs (Invoice, COA, SED)', () => {
    expect(pageContent).toContain('Replace')
    expect(pageContent).toContain('UPLOAD_TYPES')
  })

  it('shows empty slots with Upload button for missing docs', () => {
    expect(pageContent).toContain('EmptySlot')
    expect(pageContent).toContain('Upload')
    expect(pageContent).toContain('Not yet uploaded')
  })

  it('displays document info: type badge, filename, date', () => {
    expect(pageContent).toContain('fileName')
    expect(pageContent).toContain('createdAt')
    expect(pageContent).toContain('typeBadgeColor')
  })

  it('defines all expected document types for the folder', () => {
    // Upload types
    expect(pageContent).toContain("'INVOICE_EXPORT'")
    expect(pageContent).toContain("'COA'")
    expect(pageContent).toContain("'SED'")
    // Generated types
    expect(pageContent).toContain("'COO'")
    expect(pageContent).toContain("'PL'")
    // BOL
    expect(pageContent).toContain("'BOL'")
  })
})

// ---------- Wiring tests ----------

describe('Wiring: routes.ts + providers.tsx', () => {
  const routesPath = path.join(SRC, 'lib/routes.ts')
  const routesContent = readFileSync(routesPath, 'utf-8')

  it('routes.ts has dashboard.documents.folder route', () => {
    expect(routesContent).toContain('folder:')
    expect(routesContent).toContain('/dashboard/documents/')
  })

  it('routes.ts has api.documents.folderDocs route', () => {
    expect(routesContent).toContain('folderDocs:')
    expect(routesContent).toContain('/documents')
  })

  it('routes.ts has generate.pl route', () => {
    expect(routesContent).toContain('pl:')
    expect(routesContent).toContain('/generate/pl')
  })

  it('providers.tsx includes QueryClientProvider from TanStack', () => {
    const providersPath = path.join(SRC, 'app/providers.tsx')
    const providersContent = readFileSync(providersPath, 'utf-8')
    expect(providersContent).toContain('QueryClientProvider')
    expect(providersContent).toContain("from '@tanstack/react-query'")
    expect(providersContent).toContain('QueryClient')
  })
})

// ---------- Integration: page -> API wiring ----------

describe('Integration: page fetches from API route', () => {
  it('page imports routes and uses folderDocs to construct fetch URL', () => {
    const pagePath = path.join(SRC, 'app/dashboard/documents/[id]/page.tsx')
    const pageContent = readFileSync(pagePath, 'utf-8')

    // Page imports routes
    expect(pageContent).toContain("from '@/lib/routes'")
    // Page uses routes.api.documents.folderDocs
    expect(pageContent).toContain('routes.api.documents.folderDocs')
  })

  it('API route path matches what routes.ts generates', () => {
    const routesPath = path.join(SRC, 'lib/routes.ts')
    const routesContent = readFileSync(routesPath, 'utf-8')

    // The folderDocs route should produce /api/documents/{id}/documents
    expect(routesContent).toMatch(/folderDocs.*\/api\/documents\/.*\/documents/)

    // The actual API route file exists at that path
    const apiRoutePath = path.join(SRC, 'app/api/documents/[id]/documents/route.ts')
    expect(existsSync(apiRoutePath)).toBe(true)
  })
})
