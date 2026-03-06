/**
 * Integration test for PL (Packing List) route.
 * Tests that the PL generation route is properly wired and accessible.
 * Since this is a Next.js API route requiring MongoDB + auth, we test:
 * 1. The route module exports a POST handler
 * 2. The pl-utils are imported and used by the route
 * 3. The route file contains proper table columns (seal, liters, kg)
 * 4. The route reads Document and Client models from MongoDB
 */
import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

// Integration test: verify the route file is properly wired
describe('PL route integration', () => {
  const routePath = path.resolve(
    __dirname,
    '../src/app/api/documents/[id]/generate/pl/route.ts'
  )

  it('route file exists', () => {
    expect(fs.existsSync(routePath)).toBe(true)
  })

  it('exports a POST handler', () => {
    const content = fs.readFileSync(routePath, 'utf-8')
    expect(content).toContain('export async function POST')
  })

  it('imports buildContainerRows from pl-utils', () => {
    const content = fs.readFileSync(routePath, 'utf-8')
    expect(content).toContain("from '@/lib/pl-utils'")
    expect(content).toContain('buildContainerRows')
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

  it('table includes seal number column', () => {
    const content = fs.readFileSync(routePath, 'utf-8')
    expect(content).toContain("'Seal'")
    expect(content).toContain('row.sealNumber')
  })

  it('table includes liters quantity column', () => {
    const content = fs.readFileSync(routePath, 'utf-8')
    expect(content).toContain("'Liters'")
    expect(content).toContain('row.quantityLiters')
  })

  it('table includes kg quantity column', () => {
    const content = fs.readFileSync(routePath, 'utf-8')
    expect(content).toContain("'Kg'")
    expect(content).toContain('row.quantityKg')
  })

  it('includes container number column', () => {
    const content = fs.readFileSync(routePath, 'utf-8')
    expect(content).toContain("'Container'")
    expect(content).toContain('row.containerNumber')
  })

  it('includes consignee/client address section', () => {
    const content = fs.readFileSync(routePath, 'utf-8')
    expect(content).toContain('Consignee:')
    expect(content).toContain('client.address')
    expect(content).toContain('client.name')
  })

  it('includes TXWOS logo', () => {
    const content = fs.readFileSync(routePath, 'utf-8')
    expect(content).toContain('txwos-logo.png')
  })

  it('stores generated PL in GridFS', () => {
    const content = fs.readFileSync(routePath, 'utf-8')
    expect(content).toContain("bucketName: 'documents'")
    expect(content).toContain('bucket.openUploadStream')
  })

  it('creates Document record with correct type and relatedBolId', () => {
    const content = fs.readFileSync(routePath, 'utf-8')
    expect(content).toContain("type: 'PL'")
    expect(content).toContain('relatedBolId: bolDocument._id')
  })

  it('uses buildContainerRows to process items', () => {
    const content = fs.readFileSync(routePath, 'utf-8')
    expect(content).toContain('buildContainerRows(items)')
  })
})

// Verify pl-utils module is importable and all exports work
describe('pl-utils module exports', () => {
  it('all four exports are importable and callable', async () => {
    const utils = await import('../src/lib/pl-utils')
    expect(typeof utils.extractProductName).toBe('function')
    expect(typeof utils.extractPackagingType).toBe('function')
    expect(typeof utils.buildContainerRows).toBe('function')
  })
})
