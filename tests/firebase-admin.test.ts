import { describe, it, expect } from 'vitest'
import { decodePrivateKey } from '../src/lib/firebase-admin'

describe('decodePrivateKey', () => {
  it('converts escaped \\n sequences to real newlines', () => {
    const input =
      '-----BEGIN PRIVATE KEY-----\\nMIIEv...\\nQEFAAOC...\\n-----END PRIVATE KEY-----\\n'
    const output = decodePrivateKey(input)
    expect(output).toBe(
      '-----BEGIN PRIVATE KEY-----\nMIIEv...\nQEFAAOC...\n-----END PRIVATE KEY-----\n',
    )
    expect(output).toContain('\n')
    expect(output).not.toContain('\\n')
  })

  it('leaves already-real newlines alone', () => {
    const input = 'line1\nline2\nline3'
    expect(decodePrivateKey(input)).toBe('line1\nline2\nline3')
  })

  it('handles an empty string', () => {
    expect(decodePrivateKey('')).toBe('')
  })

  it('replaces every occurrence, not just the first', () => {
    expect(decodePrivateKey('a\\nb\\nc\\nd')).toBe('a\nb\nc\nd')
  })

  it('preserves content with no escaped newlines', () => {
    expect(decodePrivateKey('no-newlines-here')).toBe('no-newlines-here')
  })
})
