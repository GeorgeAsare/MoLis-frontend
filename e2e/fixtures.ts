/* eslint-disable react-hooks/rules-of-hooks */
import { test as base, expect, type Page } from '@playwright/test'

export const test = base.extend<{
  authedPage: Page
}>({
  authedPage: async ({ page }, use) => {
    const email = process.env.PLAYWRIGHT_TEST_EMAIL
    const password = process.env.PLAYWRIGHT_TEST_PASSWORD

    if (!email || !password) {
      test.skip()
      await use(page)
      return
    }

    await page.goto('/login')
    await page.getByTestId('email-input').fill(email)
    await page.getByTestId('password-input').fill(password)
    await page.getByTestId('login-submit').click()

    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 })
    await use(page)
  },
})

export { expect }
