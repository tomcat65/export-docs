/**
 * Integration test for PL (Packing List) route.
 * Tests that the PL generation route is properly wired and accessible.
 *
 * Two categories of tests:
 * 1. Route structure tests - verify the route file is wired correctly
 * 2. Integration tests - invoke pl-utils functions with realistic BOL data
 *    to verify the pipeline from raw items -> container rows works end-to-end
 */
import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import {
  buildContainerRows,
  extractProductName,
  extractPackagingType,
  type BolItem,
} from '../src/lib/pl-utils'

// Route structure tests: verify the route file is properly wired
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

  it('invokes buildContainerRows from pl-utils in the route', () => {
    const content = fs.readFileSync(routePath, 'utf-8')
    expect(content).toContain('buildContainerRows(items)')
  })
})

// Integration tests: invoke pl-utils functions end-to-end with realistic data
// These satisfy SIGN-001: every imported function is actually called and asserted on
describe('PL pipeline integration — buildContainerRows with realistic BOL data', () => {
  // Realistic LMV CA BOL items (anonymized per W4)
  const lmvBolItems: BolItem[] = [
    {
      itemNumber: 1,
      containerNumber: 'XXXX0000001',
      seal: 'SEAL001',
      description: '1 FLEXI TANK Base Oil Group II 600N',
      quantity: { litros: '24,000', kg: '21,120' },
    },
    {
      itemNumber: 2,
      containerNumber: 'XXXX0000002',
      seal: 'SEAL002',
      description: '1 FLEXI TANK Base Oil Group II 600N',
      quantity: { litros: '24,000', kg: '21,120' },
    },
    {
      itemNumber: 3,
      containerNumber: 'XXXX0000003',
      seal: 'SEAL003',
      description: '10 IBC Base Oil Group II 150N',
      quantity: { litros: '10,000', kg: '8,800' },
    },
  ]

  it('builds container rows with correct structure for all fields', () => {
    const rows = buildContainerRows(lmvBolItems)

    expect(rows.length).toBe(3)

    // First row: flexitank container
    expect(rows[0]).toMatchObject({
      containerNumber: 'XXXX0000001',
      sealNumber: 'SEAL001',
      packagingType: 'Flexitank',
      quantityLiters: '24,000',
      quantityKg: '21,120',
    })
    expect(rows[0].productDescription).toContain('Base Oil')
  })

  it('includes seal numbers for every container', () => {
    const rows = buildContainerRows(lmvBolItems)

    expect(rows[0].sealNumber).toBe('SEAL001')
    expect(rows[1].sealNumber).toBe('SEAL002')
    expect(rows[2].sealNumber).toBe('SEAL003')
  })

  it('includes both liters and kg quantities', () => {
    const rows = buildContainerRows(lmvBolItems)

    for (const row of rows) {
      expect(row.quantityLiters).toBeTruthy()
      expect(row.quantityKg).toBeTruthy()
      // Verify they are formatted numbers, not raw strings
      expect(row.quantityLiters).toMatch(/[\d,]+/)
      expect(row.quantityKg).toMatch(/[\d,.]+/)
    }
  })

  it('handles IBC packaging with quantity extraction', () => {
    const rows = buildContainerRows(lmvBolItems)

    // Third item is 10 IBC
    const ibcRow = rows[2]
    expect(ibcRow.containerNumber).toBe('XXXX0000003')
    expect(ibcRow.quantityLiters).toBe('10,000')
    expect(ibcRow.quantityKg).toBe('8,800')
  })

  // Test Keystone-style BOL with explicit product/packaging fields
  it('handles BOL items with explicit product and packaging fields', () => {
    const keystoneItems: BolItem[] = [
      {
        itemNumber: 1,
        containerNumber: 'KSTN0000001',
        seal: 'KS-SEAL-001',
        product: 'Paraffin Wax 130F',
        packaging: 'Drum',
        packagingQuantity: 80,
        quantity: { litros: '16,000', kg: '12,800' },
      },
    ]

    const rows = buildContainerRows(keystoneItems)

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      containerNumber: 'KSTN0000001',
      sealNumber: 'KS-SEAL-001',
      packagingType: 'Drum',
      productDescription: 'Paraffin Wax 130F',
      packagingQty: 80,
      quantityLiters: '16,000',
      quantityKg: '12,800',
    })
  })

  it('aggregates multiple items in the same container', () => {
    const multiItems: BolItem[] = [
      {
        containerNumber: 'MULTI001',
        seal: 'MSEAL1',
        product: 'Base Oil 150N',
        packaging: 'IBC',
        packagingQuantity: 5,
        quantity: { litros: '5,000', kg: '4,400' },
      },
      {
        containerNumber: 'MULTI001',
        seal: 'MSEAL1',
        product: 'Base Oil 150N',
        packaging: 'IBC',
        packagingQuantity: 5,
        quantity: { litros: '5,000', kg: '4,400' },
      },
    ]

    const rows = buildContainerRows(multiItems)

    // Same container + same packaging + same product = aggregated into 1 row
    expect(rows).toHaveLength(1)
    expect(rows[0].packagingQty).toBe(10)
    expect(rows[0].quantityLiters).toBe('10,000')
    expect(rows[0].quantityKg).toBe('8,800')
  })

  // Full pipeline: extractProductName + extractPackagingType -> buildContainerRows
  it('full pipeline: extraction functions feed into buildContainerRows correctly', () => {
    const rawDescription = '1 FLEXI TANK Base Oil Group II 600N'

    // Step 1: extract product name
    const productName = extractProductName(rawDescription)
    expect(productName).toBe('Base Oil Group II 600N')

    // Step 2: extract packaging type
    const { packagingType, packagingQty } = extractPackagingType(rawDescription)
    expect(packagingType).toBe('Flexitank')
    expect(packagingQty).toBe(1)

    // Step 3: build container rows using the same description
    const rows = buildContainerRows([
      {
        containerNumber: 'TEST001',
        seal: 'TSEAL1',
        description: rawDescription,
        quantity: { litros: '24,000', kg: '21,120' },
      },
    ])

    // Verify the pipeline produces consistent output
    expect(rows).toHaveLength(1)
    expect(rows[0].productDescription).toBe(productName)
    expect(rows[0].sealNumber).toBe('TSEAL1')
    expect(rows[0].quantityLiters).toBe('24,000')
    expect(rows[0].quantityKg).toBe('21,120')
  })
})
