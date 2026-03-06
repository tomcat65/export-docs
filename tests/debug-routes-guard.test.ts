import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { execSync } from 'child_process'

const DEBUG_DIR = resolve(__dirname, '../src/app/api/debug')

/**
 * Get all route.ts files under src/app/api/debug/
 */
function getDebugRouteFiles(): string[] {
  const result = execSync(
    `find "${DEBUG_DIR}" -name "route.ts" -type f`,
    { encoding: 'utf-8' }
  ).trim()
  return result ? result.split('\n').sort() : []
}

describe('Security: Debug routes gated behind NODE_ENV', () => {
  const routeFiles = getDebugRouteFiles()

  it('should find all expected debug route files', () => {
    // The spec lists 8 named routes + 2 sub-routes (repair, test) = 10 total
    expect(routeFiles.length).toBeGreaterThanOrEqual(8)
  })

  describe.each(routeFiles)('route file: %s', (filePath) => {
    const content = readFileSync(filePath, 'utf-8')
    const relativePath = filePath.replace(resolve(__dirname, '..') + '/', '')

    it('has NODE_ENV production guard', () => {
      expect(content).toContain("process.env.NODE_ENV === 'production'")
    })

    it('returns 404 with { error: "Not found" } in production', () => {
      // Verify the guard returns the exact response shape from the spec
      expect(content).toMatch(/NextResponse\.json\(\s*\{\s*error:\s*['"]Not found['"]\s*\}\s*,\s*\{\s*status:\s*404\s*\}\s*\)/)
    })

    it('has the guard before any business logic', () => {
      // The NODE_ENV check must appear before connectDB, auth, or API calls
      const guardIndex = content.indexOf("process.env.NODE_ENV === 'production'")
      expect(guardIndex).toBeGreaterThan(-1)

      // Guard should appear before any connectDB or auth call
      const connectDBIndex = content.indexOf('connectDB()')
      const authIndex = content.indexOf('await auth()')
      const anthropicIndex = content.indexOf('new Anthropic(')
      const fetchApiIndex = content.indexOf("fetch('https://api.anthropic.com")

      if (connectDBIndex > -1) expect(guardIndex).toBeLessThan(connectDBIndex)
      if (authIndex > -1) expect(guardIndex).toBeLessThan(authIndex)
      if (anthropicIndex > -1) expect(guardIndex).toBeLessThan(anthropicIndex)
      if (fetchApiIndex > -1) expect(guardIndex).toBeLessThan(fetchApiIndex)
    })
  })
})

describe('Integration: Debug route handler returns 404 in production', () => {
  const originalNodeEnv = process.env.NODE_ENV

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv
  })

  it('anthropic-debug GET returns 404 when NODE_ENV=production', async () => {
    // We import the actual route handler and call it with NODE_ENV=production
    // This is a true integration test - calling the exported handler directly
    process.env.NODE_ENV = 'production'

    // Dynamic import to get the route handler
    const { GET } = await import('../src/app/api/debug/anthropic-debug/route')

    const request = new Request('http://localhost:3000/api/debug/anthropic-debug')
    const response = await GET(request as any)

    expect(response.status).toBe(404)
    const body = await response.json()
    expect(body).toEqual({ error: 'Not found' })
  })

  it('anthropic-debug GET returns non-404 when NODE_ENV=development', async () => {
    process.env.NODE_ENV = 'development'

    const { GET } = await import('../src/app/api/debug/anthropic-debug/route')

    const request = new Request('http://localhost:3000/api/debug/anthropic-debug')
    // In dev mode, it will try to call the Anthropic API (and fail without key),
    // but it should NOT return 404 - it should proceed past the guard
    const response = await GET(request as any)

    // Should not be 404 - it will be 500 (no API key) or 200, but not 404
    expect(response.status).not.toBe(404)
  })
})
