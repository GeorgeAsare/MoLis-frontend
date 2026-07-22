import { test, expect } from '@playwright/test'

test.describe('Health Check', () => {
  test('health endpoint returns a valid response', async ({ request }) => {
    const response = await request.get('/api/health')
    expect([200, 503]).toContain(response.status())
    const body = await response.json() as Record<string, unknown>
    expect(body).toHaveProperty('status')
    expect(body).toHaveProperty('timestamp')
    expect(body).toHaveProperty('checks')
  })
})
