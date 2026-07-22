import { test, expect } from '@playwright/test'

test.describe('Authentication', () => {
  test('unauthenticated user is redirected from dashboard', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/\/(login|signup|$)/, { timeout: 10_000 })
  })

  test('unauthenticated user is redirected from study page', async ({ page }) => {
    await page.goto('/dashboard/study/nonexistent-id')
    await expect(page).toHaveURL(/\/(login|signup|$)/, { timeout: 10_000 })
  })

  test('login page is accessible', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByTestId('email-input')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByTestId('password-input')).toBeVisible()
    await expect(page.getByTestId('login-submit')).toBeVisible()
  })

  test('signup page is accessible', async ({ page }) => {
    await page.goto('/signup')
    await expect(page).toHaveURL(/signup/, { timeout: 10_000 })
  })
})
