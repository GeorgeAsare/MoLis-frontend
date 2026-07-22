import { test, expect } from './fixtures'

test.describe('PDF Study Journey', () => {
  test.beforeEach(() => {
    if (!process.env.PLAYWRIGHT_TEST_EMAIL || !process.env.PLAYWRIGHT_TEST_PASSWORD) {
      test.skip(true, 'Requires PLAYWRIGHT_TEST_EMAIL and PLAYWRIGHT_TEST_PASSWORD')
    }
  })

  test('study page loads without errors', async ({ authedPage: page }) => {
    await page.goto('/dashboard/study')
    await expect(page.locator('body')).not.toContainText('Application error', { timeout: 15_000 })
    await expect(page.locator('body')).not.toContainText('Internal Server Error')
  })

  test('upload zone is visible', async ({ authedPage: page }) => {
    await page.goto('/dashboard/study')
    await expect(page.getByTestId('study-upload-zone')).toBeVisible({ timeout: 15_000 })
  })
})
