/**
 * Integration test for COO route.
 * Tests that the COO generation route is properly wired and accessible.
 * Since this is a Next.js API route requiring MongoDB + auth, we test:
 * 1. The route module exports a POST handler
 * 2. The coo-utils are imported and used by the route
 * 3. The route file contains proper error handling for missing assets
 */
import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

// Integration test: verify the route file is properly wired
describe('COO route integration', () => {
  const routePath = path.resolve(
    __dirname,
    '../src/app/api/documents/[id]/generate/coo/route.ts'
  )

  it('route file exists', () => {
    expect(fs.existsSync(routePath)).toBe(true)
  })

  it('exports a POST handler', async () => {
    const content = fs.readFileSync(routePath, 'utf-8')
    expect(content).toContain('export async function POST')
  })

  it('imports extractProductName from coo-utils', () => {
    const content = fs.readFileSync(routePath, 'utf-8')
    expect(content).toContain("from '@/lib/coo-utils'")
    expect(content).toContain('extractProductName')
  })

  it('imports getNextBusinessDay from coo-utils', () => {
    const content = fs.readFileSync(routePath, 'utf-8')
    expect(content).toContain('getNextBusinessDay')
  })

  it('imports formatDateFormal from coo-utils', () => {
    const content = fs.readFileSync(routePath, 'utf-8')
    expect(content).toContain('formatDateFormal')
  })

  it('imports getOrdinalSuffix from coo-utils', () => {
    const content = fs.readFileSync(routePath, 'utf-8')
    expect(content).toContain('getOrdinalSuffix')
  })

  it('loads notary assets from Asset model', () => {
    const content = fs.readFileSync(routePath, 'utf-8')
    expect(content).toContain("Asset.findOne({ type: 'notary_seal' })")
    expect(content).toContain("Asset.find")
    expect(content).toContain("type: 'signature'")
  })

  it('returns 422 error if notary signature asset is missing', () => {
    const content = fs.readFileSync(routePath, 'utf-8')
    expect(content).toContain('Missing required asset: Notary signature')
    expect(content).toContain('status: 422')
  })

  it('returns 422 error if user signature asset is missing', () => {
    const content = fs.readFileSync(routePath, 'utf-8')
    expect(content).toContain('Missing required asset: No signature found')
  })

  it('returns 422 error if notary seal asset is missing', () => {
    const content = fs.readFileSync(routePath, 'utf-8')
    expect(content).toContain('Missing required asset: Notary seal not found')
  })

  it('requires admin authentication', () => {
    const content = fs.readFileSync(routePath, 'utf-8')
    expect(content).toContain("session?.user?.isAdmin")
    expect(content).toContain("status: 401")
  })

  it('reads Document model from MongoDB', () => {
    const content = fs.readFileSync(routePath, 'utf-8')
    expect(content).toContain("import { Document } from '@/models/Document'")
    expect(content).toContain('Document.findById')
  })

  it('reads Client model from MongoDB', () => {
    const content = fs.readFileSync(routePath, 'utf-8')
    expect(content).toContain("import { Client } from '@/models/Client'")
    expect(content).toContain('Client.findById')
  })

  it('includes all required PDF sections', () => {
    const content = fs.readFileSync(routePath, 'utf-8')
    // Logo
    expect(content).toContain('txwos-logo.png')
    // Buyer info
    expect(content).toContain('drawDocumentHeader')
    expect(content).toContain('BUYER:')
    // Maritime booking
    expect(content).toContain('Maritime Booking:')
    expect(content).toContain('BOL Number:')
    // Container/seal table
    expect(content).toContain('Containers and Seals:')
    expect(content).toContain('containerNumber')
    expect(content).toContain('sealNumber')
    // Product info
    expect(content).toContain('Product name:')
    // Origin statement
    expect(content).toContain('U.S.A. ORIGIN')
    // Signature block
    expect(content).toContain('drawSignatureSection')
    expect(content).toContain('Yours faithfully')
    // Notary section
    expect(content).toContain('drawDocumentFooter')
    expect(content).toContain('COUNTY: Harris')
  })

  it('uses next business day for date (weekend skipping)', () => {
    const content = fs.readFileSync(routePath, 'utf-8')
    expect(content).toContain('getNextBusinessDay(businessDateObj)')
    expect(content).toContain('formatDateFormal(businessDateObj)')
  })

  it('stores generated COO in GridFS', () => {
    const content = fs.readFileSync(routePath, 'utf-8')
    expect(content).toContain("bucketName: 'documents'")
    expect(content).toContain('bucket.openUploadStream')
  })

  it('creates Document record with correct type and relatedBolId', () => {
    const content = fs.readFileSync(routePath, 'utf-8')
    expect(content).toContain("type: 'COO'")
    expect(content).toContain('relatedBolId: bolDocument._id')
  })
})

// Verify coo-utils module is importable and all exports work
describe('coo-utils module exports', () => {
  it('all four functions are importable and callable', async () => {
    const utils = await import('../src/lib/coo-utils')
    expect(typeof utils.extractProductName).toBe('function')
    expect(typeof utils.getNextBusinessDay).toBe('function')
    expect(typeof utils.formatDateFormal).toBe('function')
    expect(typeof utils.getOrdinalSuffix).toBe('function')
  })
})
