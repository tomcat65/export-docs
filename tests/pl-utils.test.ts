import { describe, it, expect } from 'vitest'
import {
  extractProductName,
  extractPackagingType,
  buildContainerRows,
  itemsFromExtractedContainers,
} from '../src/lib/pl-utils'
import type { BolItem } from '../src/lib/pl-utils'

describe('extractProductName', () => {
  it('removes flexitank packaging prefix', () => {
    expect(extractProductName('1 FLEXITANK Base Oil Group II 600N')).toBe('Base Oil Group II 600N')
  })

  it('removes flexi tank (two words) packaging prefix', () => {
    expect(extractProductName('2 FLEXI TANK Base Oil Group II 300N')).toBe('Base Oil Group II 300N')
  })

  it('removes drum packaging term', () => {
    expect(extractProductName('10 DRUMS Base Oil Group II 600N')).toBe('Base Oil Group II 600N')
  })

  it('removes IBC packaging prefix', () => {
    expect(extractProductName('5 IBC Base Oil Group II 600N')).toBe('Base Oil Group II 600N')
  })

  it('returns empty string for empty input', () => {
    expect(extractProductName('')).toBe('')
  })

  it('handles product name without packaging terms', () => {
    expect(extractProductName('Base Oil Group II 600N')).toBe('Base Oil Group II 600N')
  })
})

describe('extractPackagingType', () => {
  it('extracts flexitank packaging', () => {
    const result = extractPackagingType('1 FLEXITANK Base Oil 600N')
    expect(result).toEqual({ packagingType: 'Flexitank', packagingQty: 1 })
  })

  it('extracts IBC packaging with quantity', () => {
    const result = extractPackagingType('5 IBC Base Oil 600N')
    expect(result).toEqual({ packagingType: 'IBC', packagingQty: 5 })
  })

  it('extracts drum packaging', () => {
    const result = extractPackagingType('10 DRUMS Base Oil 600N')
    expect(result).toEqual({ packagingType: 'Drum', packagingQty: 10 })
  })

  it('returns empty packaging type for empty string', () => {
    const result = extractPackagingType('')
    expect(result).toEqual({ packagingType: '', packagingQty: 1 })
  })

  it('returns empty packaging type for unrecognized format', () => {
    const result = extractPackagingType('Base Oil Group II 600N')
    expect(result).toEqual({ packagingType: '', packagingQty: 1 })
  })

  it('extracts pail packaging', () => {
    const result = extractPackagingType('50 PAILS Base Oil 150N')
    expect(result).toEqual({ packagingType: 'Pail', packagingQty: 50 })
  })

  it('extracts packaging from anywhere in description', () => {
    const result = extractPackagingType('Contains 20 DRUMS of Base Oil')
    expect(result).toEqual({ packagingType: 'Drum', packagingQty: 20 })
  })

  it('extracts flexi tank (two words)', () => {
    const result = extractPackagingType('2 FLEXI TANK Heavy Oil')
    expect(result).toEqual({ packagingType: 'Flexitank', packagingQty: 2 })
  })
})

describe('buildContainerRows', () => {
  it('returns empty array for no items', () => {
    expect(buildContainerRows([])).toEqual([])
  })

  it('returns empty array for undefined/null input', () => {
    expect(buildContainerRows(undefined as unknown as BolItem[])).toEqual([])
    expect(buildContainerRows(null as unknown as BolItem[])).toEqual([])
  })

  it('builds a single container row with seal, liters, and kg', () => {
    const items: BolItem[] = [
      {
        itemNumber: 1,
        containerNumber: 'MRKU8922059',
        seal: '26787-26788',
        description: '1 FLEXITANK Base Oil Group II 600N',
        product: 'Base Oil Group II 600N',
        packaging: 'Flexitank',
        packagingQuantity: 1,
        quantity: { litros: '23,680', kg: '20,729.17' },
      },
    ]
    const rows = buildContainerRows(items)
    expect(rows).toHaveLength(1)
    expect(rows[0].containerNumber).toBe('MRKU8922059')
    expect(rows[0].sealNumber).toBe('26787-26788')
    expect(rows[0].packagingType).toBe('Flexitank')
    expect(rows[0].productDescription).toBe('Base Oil Group II 600N')
    expect(rows[0].packagingQty).toBe(1)
    expect(rows[0].quantityLiters).toBe('23,680')
    expect(rows[0].quantityKg).toBe('20,729.17')
  })

  it('groups multiple items in the same container', () => {
    const items: BolItem[] = [
      {
        containerNumber: 'CONT001',
        seal: '12345',
        product: 'Base Oil 600N',
        packaging: 'Flexitank',
        packagingQuantity: 1,
        quantity: { litros: '10,000', kg: '8,500' },
      },
      {
        containerNumber: 'CONT001',
        seal: '12345',
        product: 'Base Oil 150N',
        packaging: 'Flexitank',
        packagingQuantity: 1,
        quantity: { litros: '5,000', kg: '4,200' },
      },
    ]
    const rows = buildContainerRows(items)
    // Two different products -> two rows
    expect(rows).toHaveLength(2)
    // First row shows container and seal
    expect(rows[0].containerNumber).toBe('CONT001')
    expect(rows[0].sealNumber).toBe('12345')
    // Second row does not repeat container/seal
    expect(rows[1].containerNumber).toBe('')
    expect(rows[1].sealNumber).toBe('')
  })

  it('handles multiple containers', () => {
    const items: BolItem[] = [
      {
        containerNumber: 'CONT001',
        seal: '11111',
        product: 'Base Oil 600N',
        packaging: 'Flexitank',
        packagingQuantity: 1,
        quantity: { litros: '20,000', kg: '17,500' },
      },
      {
        containerNumber: 'CONT002',
        seal: '22222',
        product: 'Base Oil 600N',
        packaging: 'Flexitank',
        packagingQuantity: 1,
        quantity: { litros: '21,000', kg: '18,000' },
      },
    ]
    const rows = buildContainerRows(items)
    expect(rows).toHaveLength(2)
    expect(rows[0].containerNumber).toBe('CONT001')
    expect(rows[0].sealNumber).toBe('11111')
    expect(rows[1].containerNumber).toBe('CONT002')
    expect(rows[1].sealNumber).toBe('22222')
  })

  it('aggregates quantities for same packaging+product in one container', () => {
    const items: BolItem[] = [
      {
        containerNumber: 'CONT001',
        seal: '99999',
        product: 'Base Oil 600N',
        packaging: 'IBC',
        packagingQuantity: 5,
        quantity: { litros: '5,000', kg: '4,000' },
      },
      {
        containerNumber: 'CONT001',
        seal: '99999',
        product: 'Base Oil 600N',
        packaging: 'IBC',
        packagingQuantity: 5,
        quantity: { litros: '5,000', kg: '4,000' },
      },
    ]
    const rows = buildContainerRows(items)
    expect(rows).toHaveLength(1) // Same packaging+product -> aggregated
    expect(rows[0].packagingQty).toBe(10)
    expect(rows[0].quantityLiters).toBe('10,000')
    expect(rows[0].quantityKg).toBe('8,000')
  })

  it('falls back to description-based extraction when product field is missing', () => {
    const items: BolItem[] = [
      {
        containerNumber: 'CONT001',
        seal: '55555',
        description: '1 FLEXITANK Base Oil Group II 600N',
        quantity: { litros: '23,000', kg: '20,000' },
      },
    ]
    const rows = buildContainerRows(items)
    expect(rows).toHaveLength(1)
    expect(rows[0].productDescription).toBe('Base Oil Group II 600N')
    expect(rows[0].packagingType).toBe('Flexitank')
  })

  it('handles items with missing quantity data', () => {
    const items: BolItem[] = [
      {
        containerNumber: 'CONT001',
        seal: '77777',
        product: 'Base Oil 600N',
        packaging: 'Flexitank',
        packagingQuantity: 1,
      },
    ]
    const rows = buildContainerRows(items)
    expect(rows).toHaveLength(1)
    expect(rows[0].quantityLiters).toBe('')
    expect(rows[0].quantityKg).toBe('')
  })
})

describe('itemsFromExtractedContainers', () => {
  it('returns empty array for undefined/empty input', () => {
    expect(itemsFromExtractedContainers(undefined)).toEqual([])
    expect(itemsFromExtractedContainers([])).toEqual([])
  })

  it('maps new lineItems format without regex', () => {
    const containers = [{
      containerNumber: 'MRKU123',
      sealNumber: '99999',
      lineItems: [
        {
          product: 'Base Oil Group II 600N',
          hsCode: '2710.19',
          packaging: 'Flexitank',
          packagingQuantity: 1,
          volume: { liters: 23680, gallons: 6255 },
          weight: { kg: 20729.17, lbs: 45688, mt: 20.73 },
        },
      ],
    }]
    const items = itemsFromExtractedContainers(containers)
    expect(items).toHaveLength(1)
    expect(items[0].containerNumber).toBe('MRKU123')
    expect(items[0].seal).toBe('99999')
    expect(items[0].product).toBe('Base Oil Group II 600N')
    expect(items[0].packaging).toBe('Flexitank')
    expect(items[0].packagingQuantity).toBe(1)
    expect(items[0].quantity?.litros).toBe('23680.00')
    expect(items[0].quantity?.kg).toBe('20729.170')
  })

  it('maps multiple lineItems per container', () => {
    const containers = [{
      containerNumber: 'TCLU456',
      sealNumber: '11111',
      lineItems: [
        { product: 'Base Oil 600N', packaging: 'IBC', packagingQuantity: 10, volume: { liters: 8000 }, weight: { kg: 7200 } },
        { product: 'Base Oil 150N', packaging: 'Drum', packagingQuantity: 20, volume: { liters: 4000 }, weight: { kg: 3600 } },
        { product: 'Grease', packaging: 'Pail', packagingQuantity: 50, volume: { liters: 500 }, weight: { kg: 600 } },
      ],
    }]
    const items = itemsFromExtractedContainers(containers)
    expect(items).toHaveLength(3)
    expect(items[0].packaging).toBe('IBC')
    expect(items[0].packagingQuantity).toBe(10)
    expect(items[1].packaging).toBe('Drum')
    expect(items[1].packagingQuantity).toBe(20)
    expect(items[2].packaging).toBe('Pail')
    expect(items[2].packagingQuantity).toBe(50)
    // All share the same container number
    expect(items[0].containerNumber).toBe('TCLU456')
    expect(items[1].containerNumber).toBe('TCLU456')
    expect(items[2].containerNumber).toBe('TCLU456')
  })

  it('preserves packagingQuantity of 0', () => {
    const containers = [{
      containerNumber: 'CONT001',
      sealNumber: '00000',
      lineItems: [{ product: 'Oil', packaging: 'Bulk', packagingQuantity: 0, volume: { liters: 1000 }, weight: { kg: 900 } }],
    }]
    const items = itemsFromExtractedContainers(containers)
    expect(items[0].packagingQuantity).toBe(0)
  })

  it('falls back to legacy product/quantity format', () => {
    const containers = [{
      containerNumber: 'LEGACY001',
      sealNumber: '55555',
      product: { name: 'Base Oil 600N', description: '1 FLEXITANK Base Oil 600N', hsCode: '' },
      quantity: { volume: { liters: 23000 }, weight: { kg: 20000 } },
    }]
    const items = itemsFromExtractedContainers(containers)
    expect(items).toHaveLength(1)
    expect(items[0].product).toBe('Base Oil 600N')
    expect(items[0].description).toBe('1 FLEXITANK Base Oil 600N')
    expect(items[0].packaging).toBe('Flexitank')
    expect(items[0].quantity?.litros).toBe('23000.00')
  })

  it('handles legacy container with top-level description fallback', () => {
    const containers = [{
      containerNumber: 'OLD001',
      sealNumber: '33333',
      description: '20 DRUMS Base Oil 150N',
      quantity: { volume: { liters: 4000 }, weight: { kg: 3600 } },
    }]
    const items = itemsFromExtractedContainers(containers)
    expect(items).toHaveLength(1)
    expect(items[0].product).toBe('20 DRUMS Base Oil 150N')
    expect(items[0].packaging).toBe('Drum')
    expect(items[0].packagingQuantity).toBe(20)
  })
})
