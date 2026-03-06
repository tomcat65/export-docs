import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import path from 'path'

describe('Security: src/lib/claude.ts', () => {
  const claudeFilePath = path.resolve(__dirname, '../src/lib/claude.ts')
  const claudeFileContent = readFileSync(claudeFilePath, 'utf-8')

  it('should NOT contain "use client" directive', () => {
    // 'use client' makes the file a client component in Next.js,
    // which would expose ANTHROPIC_API_KEY to the browser bundle
    expect(claudeFileContent).not.toMatch(/['"]use client['"]/)
  })

  it('should access ANTHROPIC_API_KEY only via process.env (server-side)', () => {
    // Verify the key is accessed through process.env, not hardcoded
    expect(claudeFileContent).toContain('process.env.ANTHROPIC_API_KEY')

    // Ensure the actual API key value is never hardcoded (no raw key strings)
    // A hardcoded key would look like: sk-ant-... or similar
    expect(claudeFileContent).not.toMatch(/sk-ant-[a-zA-Z0-9]+/)
  })

  it('should NOT contain hardcoded claude-3-opus-20240229 model string', () => {
    expect(claudeFileContent).not.toContain('claude-3-opus-20240229')
  })

  it('should use ANTHROPIC_MODEL env var with claude-sonnet-4-6 default', () => {
    // The model must be read from env with a fallback
    expect(claudeFileContent).toContain("process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6'")
  })

  it('should not be imported by any client component', () => {
    // Scan src/ for any file that has 'use client' and imports from claude.ts
    const srcDir = path.resolve(__dirname, '../src')
    const { execSync } = require('child_process')

    // Find all files with 'use client' that also import from lib/claude
    const result = execSync(
      `grep -rl "use client" "${srcDir}" --include="*.ts" --include="*.tsx" 2>/dev/null | xargs grep -l "lib/claude" 2>/dev/null || true`,
      { encoding: 'utf-8' }
    ).trim()

    expect(result).toBe('')
  })
})
