import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import path from 'path'
import { stripDataUri, normalizeImageMime } from '@/lib/anthropic-fetch'

describe('stripDataUri', () => {
  it('strips PDF data URI prefix', () => {
    expect(stripDataUri('data:application/pdf;base64,ABC')).toBe('ABC')
  })

  it('strips JPEG data URI prefix', () => {
    expect(stripDataUri('data:image/jpeg;base64,XYZ')).toBe('XYZ')
  })

  it('strips PNG data URI prefix', () => {
    expect(stripDataUri('data:image/png;base64,PNGDATA')).toBe('PNGDATA')
  })

  it('returns already-clean base64 unchanged', () => {
    expect(stripDataUri('alreadyclean')).toBe('alreadyclean')
  })
})

describe('normalizeImageMime', () => {
  it('normalizes image/jpg to image/jpeg', () => {
    expect(normalizeImageMime('image/jpg')).toBe('image/jpeg')
  })

  it('passes through image/png unchanged', () => {
    expect(normalizeImageMime('image/png')).toBe('image/png')
  })

  it('passes through image/jpeg unchanged', () => {
    expect(normalizeImageMime('image/jpeg')).toBe('image/jpeg')
  })

  it('passes through image/gif unchanged', () => {
    expect(normalizeImageMime('image/gif')).toBe('image/gif')
  })

  it('passes through image/webp unchanged', () => {
    expect(normalizeImageMime('image/webp')).toBe('image/webp')
  })

  it('falls back to image/jpeg for invalid MIME', () => {
    expect(normalizeImageMime('video/mp4')).toBe('image/jpeg')
  })

  it('falls back to image/jpeg for empty string', () => {
    expect(normalizeImageMime('')).toBe('image/jpeg')
  })
})

describe('Content block structure in anthropic-fetch.ts', () => {
  const filePath = path.resolve(__dirname, '../src/lib/anthropic-fetch.ts')
  const content = readFileSync(filePath, 'utf-8')

  it('PDF content block uses type document with application/pdf media_type', () => {
    expect(content).toContain("type: 'document'")
    expect(content).toContain("media_type: 'application/pdf'")
  })

  it('image content block uses type image', () => {
    expect(content).toContain("type: 'image'")
  })

  it('uses stripDataUri instead of hardcoded regex for data stripping', () => {
    expect(content).toContain('stripDataUri(document.data)')
    // Old hardcoded patterns should no longer be used
    expect(content).not.toContain("document.data.replace(/^data:image\\/png;base64,/, '')")
    expect(content).not.toContain("document.data.replace(/^data:application\\/pdf;base64,/, '')")
  })

  it('uses normalizeImageMime for image media_type', () => {
    expect(content).toContain('normalizeImageMime(document.mimeType')
  })

  it('does not hardcode image/png as media_type for images', () => {
    // The only 'image/png' should be in the valid list inside normalizeImageMime,
    // not as a hardcoded media_type in content blocks
    expect(content).not.toMatch(/media_type:\s*['"]image\/png['"]/)
  })

  it('uses ANTHROPIC_MODEL env var with claude-sonnet-4-6 default', () => {
    expect(content).toContain("process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6'")
  })
})

describe('Content block structure in claude.ts (fetchFromClaudeDirect)', () => {
  const filePath = path.resolve(__dirname, '../src/lib/claude.ts')
  const content = readFileSync(filePath, 'utf-8')

  it('does not embed base64 data directly in prompt text', () => {
    // Old pattern: `Extract all the relevant information from it: ${document.data}`
    expect(content).not.toContain('information from it: ${document.data}')
  })

  it('uses structured content blocks in fetchFromClaudeDirect', () => {
    expect(content).toContain('stripDataUri(document.data)')
    expect(content).toContain('normalizeImageMime(document.mimeType')
  })

  it('uses claude-sonnet-4-6 as model default in fallback', () => {
    expect(content).toContain("process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6'")
  })

  it('passes mimeType through in processDocumentWithClaude', () => {
    expect(content).toContain('mimeType: document.mimeType')
  })
})
