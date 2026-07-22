import { test, expect } from '@playwright/test'

test.describe('Security and Isolation', () => {
  test('unauthenticated access to dashboard redirects to login', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/\/(login|signup|$)/, { timeout: 10_000 })
  })

  test('guessed document UUID redirects unauthenticated user', async ({ page }) => {
    await page.goto('/dashboard/study/00000000-0000-0000-0000-000000000000')
    // Must NOT show document content — must redirect to login
    await expect(page).toHaveURL(/\/(login|signup|$)/, { timeout: 10_000 })
  })

  test('nonexistent study route does not expose server errors', async ({ page }) => {
    await page.goto('/dashboard/study/definitely-not-real')
    const body = page.locator('body')
    await expect(body).not.toContainText('Internal Server Error', { timeout: 10_000 })
    await expect(body).not.toContainText('NEXT_NOT_FOUND')
  })
})
