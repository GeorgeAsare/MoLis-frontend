import { test, expect } from '@playwright/test'

// Audits that no unexpected console errors appear on publicly accessible pages.
// These tests run without auth credentials.
test.describe('Console Error Audit', () => {
  const publicPaths = ['/', '/login', '/signup']

  for (const path of publicPaths) {
    test(`no console errors on ${path}`, async ({ page }) => {
      const errors: string[] = []
      page.on('console', msg => {
        if (msg.type() === 'error') errors.push(msg.text())
      })
      page.on('pageerror', err => errors.push(err.message))

      await page.goto(path, { waitUntil: 'networkidle' })

      const meaningful = errors.filter(e =>
        !e.includes('favicon') &&
        !e.includes('ResizeObserver') &&
        !e.includes('Non-Error promise rejection captured')
      )
      expect(meaningful, `Unexpected console errors on ${path}:\n${meaningful.join('\n')}`).toHaveLength(0)
    })
  }

  test('health endpoint returns expected shape', async ({ request }) => {
    const res = await request.get('/api/health')
    expect([200, 503]).toContain(res.status())
    const body = await res.json() as Record<string, unknown>
    expect(body).toHaveProperty('status')
    expect(body).toHaveProperty('timestamp')
    expect(body).toHaveProperty('checks')
    const checks = body.checks as Record<string, unknown>
    expect(checks).toHaveProperty('database')
  })
})
