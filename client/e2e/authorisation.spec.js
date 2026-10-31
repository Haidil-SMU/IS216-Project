import { test, expect } from '@playwright/test'
import { PASSWORD, uniqueEmail, logInThroughForm, openPage, signUpViaApi } from './helpers'

const email = uniqueEmail('authz')

test.beforeAll(async ({ playwright, baseURL }) => {
  const request = await playwright.request.newContext({ baseURL })
  await signUpViaApi(request, email)
  await request.dispose()
})

test('protected pages need a login, and homeowners cannot reach contractor pages or APIs', async ({ page }) => {
  await test.step('a protected address shows the login prompt once the splash has gone', async () => {
    await openPage(page, '/MyProfile')

    const prompt = page.getByRole('dialog', { name: 'Please log in first' })
    await expect(prompt).toBeVisible()
    await expect(prompt).toContainText('in 5s')
    await expect(page).toHaveURL('/')

    await prompt.getByRole('button', { name: 'Log in now' }).click()
    await expect(page).toHaveURL('/login?redirect=/MyProfile')
  })

  await test.step('after logging in, the user comes back to the page they wanted', async () => {
    await logInThroughForm(page, email, PASSWORD)
    await expect(page).toHaveURL('/MyProfile')
  })

  await test.step('the router sends a homeowner away from the contractor dashboard', async () => {
    await page.goto('/ContractorDashboard')
    await expect(page).toHaveURL('/')
  })

  await test.step('the server refuses contractor APIs: 403 for a homeowner, 401 once logged out', async () => {
    expect((await page.request.get('/api/contractor/profile')).status()).toBe(403)
    await page.request.post('/api/auth/logout')
    expect((await page.request.get('/api/contractor/profile')).status()).toBe(401)
  })
})
