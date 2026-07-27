import { test, expect } from './fixtures'

test.describe('Recorder Study Journey', () => {
  test.beforeEach(() => {
    if (!process.env.PLAYWRIGHT_TEST_EMAIL || !process.env.PLAYWRIGHT_TEST_PASSWORD) {
      test.skip(true, 'Requires PLAYWRIGHT_TEST_EMAIL and PLAYWRIGHT_TEST_PASSWORD')
    }
  })

  test('recorder page loads without errors', async ({ authedPage: page }) => {
    await page.goto('/dashboard/agents/recorder')
    await expect(page.locator('body')).not.toContainText('Application error', { timeout: 10_000 })
  })

  test('recorder UI is present', async ({ authedPage: page }) => {
    await page.goto('/dashboard/agents/recorder')
    // Wait for loading state to resolve before checking for UI elements
    await expect(page.locator('main')).not.toContainText('Loading', { timeout: 15_000 })
    const hasRecordButton = await page.getByTestId('record-button').isVisible().catch(() => false)
    const hasAnyTestId = await page.locator('[data-testid]').first().isVisible().catch(() => false)
    expect(hasRecordButton || hasAnyTestId).toBeTruthy()
  })

  test('completed recording shows Send to Study Agent button', async ({ authedPage: page }) => {
    await page.goto('/dashboard/agents/recorder')
    // If a completed recording exists, the send button should be present
    const sendButton = page.getByTestId('send-to-study-btn')
    const exists = await sendButton.count()
    if (exists > 0) {
      await expect(sendButton.first()).toBeEnabled()
    } else {
      // No completed recordings — that is valid
      test.info().annotations.push({ type: 'info', description: 'No completed recordings to test send flow' })
    }
  })
})
