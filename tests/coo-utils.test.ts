import { describe, it, expect } from 'vitest'
import {
  extractProductName,
  getNextBusinessDay,
  formatDateFormal,
  getOrdinalSuffix,
} from '../src/lib/coo-utils'

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

  it('removes standalone packaging words', () => {
    expect(extractProductName('Base Oil Group II 600N Flexitank')).toBe('Base Oil Group II 600N')
  })

  it('returns empty string for empty input', () => {
    expect(extractProductName('')).toBe('')
  })

  it('returns original if cleaning removes everything', () => {
    expect(extractProductName('FLEXITANK')).toBe('FLEXITANK')
  })

  it('handles product name without packaging terms', () => {
    expect(extractProductName('Base Oil Group II 600N')).toBe('Base Oil Group II 600N')
  })

  it('cleans up multiple spaces', () => {
    expect(extractProductName('Base Oil  Group II   600N')).toBe('Base Oil Group II 600N')
  })
})

describe('getNextBusinessDay', () => {
  it('returns next day for a Monday (Tuesday)', () => {
    // 2025-12-22 is a Monday
    const monday = new Date(2025, 11, 22)
    const result = getNextBusinessDay(monday)
    expect(result.getDay()).toBe(2) // Tuesday
    expect(result.getDate()).toBe(23)
  })

  it('returns next day for a Tuesday (Wednesday)', () => {
    const tuesday = new Date(2025, 11, 23)
    const result = getNextBusinessDay(tuesday)
    expect(result.getDay()).toBe(3) // Wednesday
    expect(result.getDate()).toBe(24)
  })

  it('returns next day for a Wednesday (Thursday)', () => {
    const wednesday = new Date(2025, 11, 24)
    const result = getNextBusinessDay(wednesday)
    expect(result.getDay()).toBe(4) // Thursday
    expect(result.getDate()).toBe(25)
  })

  it('returns next day for a Thursday (Friday)', () => {
    const thursday = new Date(2025, 11, 25)
    const result = getNextBusinessDay(thursday)
    expect(result.getDay()).toBe(5) // Friday
    expect(result.getDate()).toBe(26)
  })

  it('skips Saturday to Monday when input is Friday', () => {
    // 2025-12-26 is a Friday
    const friday = new Date(2025, 11, 26)
    const result = getNextBusinessDay(friday)
    expect(result.getDay()).toBe(1) // Monday
    expect(result.getDate()).toBe(29)
  })

  it('skips to Monday when input is Saturday', () => {
    // 2025-12-27 is a Saturday
    const saturday = new Date(2025, 11, 27)
    const result = getNextBusinessDay(saturday)
    expect(result.getDay()).toBe(1) // Monday
    expect(result.getDate()).toBe(29)
  })

  it('returns Monday when input is Sunday', () => {
    // This is trickier: Sunday + 1 = Monday (day 1), no skip needed
    // But let's check: 2025-12-28 is a Sunday
    const sunday = new Date(2025, 11, 28)
    const result = getNextBusinessDay(sunday)
    expect(result.getDay()).toBe(1) // Monday
    expect(result.getDate()).toBe(29)
  })

  it('does not modify the original date', () => {
    const original = new Date(2025, 11, 22)
    const originalTime = original.getTime()
    getNextBusinessDay(original)
    expect(original.getTime()).toBe(originalTime)
  })
})

describe('getOrdinalSuffix', () => {
  it('returns "st" for 1', () => {
    expect(getOrdinalSuffix(1)).toBe('st')
  })

  it('returns "nd" for 2', () => {
    expect(getOrdinalSuffix(2)).toBe('nd')
  })

  it('returns "rd" for 3', () => {
    expect(getOrdinalSuffix(3)).toBe('rd')
  })

  it('returns "th" for 4-20', () => {
    for (let i = 4; i <= 20; i++) {
      expect(getOrdinalSuffix(i)).toBe('th')
    }
  })

  it('returns "st" for 21', () => {
    expect(getOrdinalSuffix(21)).toBe('st')
  })

  it('returns "nd" for 22', () => {
    expect(getOrdinalSuffix(22)).toBe('nd')
  })

  it('returns "rd" for 23', () => {
    expect(getOrdinalSuffix(23)).toBe('rd')
  })

  it('returns "th" for 11, 12, 13 (special teens)', () => {
    expect(getOrdinalSuffix(11)).toBe('th')
    expect(getOrdinalSuffix(12)).toBe('th')
    expect(getOrdinalSuffix(13)).toBe('th')
  })
})

describe('formatDateFormal', () => {
  it('formats a date as "Month, DayOrdinal Year"', () => {
    const date = new Date(2025, 11, 26) // December 26, 2025
    const result = formatDateFormal(date)
    expect(result).toBe('December, 26th 2025')
  })

  it('formats January 1st correctly', () => {
    const date = new Date(2025, 0, 1) // January 1, 2025
    const result = formatDateFormal(date)
    expect(result).toBe('January, 1st 2025')
  })

  it('formats February 2nd correctly', () => {
    const date = new Date(2025, 1, 2) // February 2, 2025
    const result = formatDateFormal(date)
    expect(result).toBe('February, 2nd 2025')
  })

  it('formats March 3rd correctly', () => {
    const date = new Date(2025, 2, 3) // March 3, 2025
    const result = formatDateFormal(date)
    expect(result).toBe('March, 3rd 2025')
  })

  it('formats November 11th correctly (teens)', () => {
    const date = new Date(2024, 10, 11) // November 11, 2024
    const result = formatDateFormal(date)
    expect(result).toBe('November, 11th 2024')
  })
})

describe('COO date workflow integration', () => {
  it('computes next business day from BOL date and formats it', () => {
    // Simulate: BOL issued on Thursday Dec 25, 2025
    // Next business day: Friday Dec 26
    const bolDate = new Date(2025, 11, 25)
    const nextBiz = getNextBusinessDay(bolDate)
    const formatted = formatDateFormal(nextBiz)

    expect(nextBiz.getDay()).toBe(5) // Friday
    expect(formatted).toBe('December, 26th 2025')
  })

  it('computes next business day from Friday BOL date (skips weekend)', () => {
    // BOL issued on Friday Dec 26, 2025
    // Next business day: Monday Dec 29
    const bolDate = new Date(2025, 11, 26)
    const nextBiz = getNextBusinessDay(bolDate)
    const formatted = formatDateFormal(nextBiz)

    expect(nextBiz.getDay()).toBe(1) // Monday
    expect(formatted).toBe('December, 29th 2025')
  })
})
