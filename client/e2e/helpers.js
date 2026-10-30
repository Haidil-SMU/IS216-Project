import { expect } from '@playwright/test'

export const PASSWORD = 'Str0ng!Pass'

// A fresh address per run, so tests never collide with an existing account.
export function uniqueEmail(label) {
  return `e2e+${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.local`
}

// A first visit starts with the splash, which waits for the user to switch the lights on.
// Each test gets a fresh browser context, so this only applies to a test's first page load.
export async function dismissSplash(page) {
  const splash = page.locator('#app-loader')
  await splash.locator('.app-loader-switch').click()
  await expect(splash).toHaveCount(0)
}

export async function openPage(page, path) {
  await page.goto(path)
  await dismissSplash(page)
}

export async function logInThroughForm(page, email, password) {
  await page.locator('#auth-email').fill(email)
  await page.locator('#auth-password').fill(password)
  await page.locator('form button[type="submit"]').click()
}

// New homeowners get a "set up your household" popup on My Profile; close it like a user would.
export async function closeHouseholdSetup(page) {
  const popup = page.getByRole('dialog', { name: 'Set up your household first' })
  await expect(popup).toBeVisible()
  await popup.getByRole('button', { name: 'Set up household' }).click()
  await expect(popup).toBeHidden()
}

export function logOutButton(page) {
  return page.getByRole('button', { name: 'Log out' })
}

// Creates an account through the API (and leaves the request context logged in as it).
export async function signUpViaApi(request, email) {
  const response = await request.post('/api/auth/signup', {
    data: { name: 'E2E Homeowner', email, password: PASSWORD },
  })
  expect(response.status()).toBe(201)
}

