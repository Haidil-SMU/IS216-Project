import { test, expect } from '@playwright/test'
import {
  PASSWORD,
  uniqueEmail,
  closeHouseholdSetup,
  logInThroughForm,
  logOutButton,
  openPage,
} from './helpers'

test('a homeowner can sign up, stay logged in, log out and log back in safely', async ({ page, context }) => {
  const email = uniqueEmail('auth')

  // Sign up: new homeowners are sent to set up their household first.
  await openPage(page, '/signup')
  await page.locator('#auth-name').fill('E2E Homeowner')
  await page.locator('#auth-email').fill(email)
  await page.locator('#auth-password').fill(PASSWORD)
  await page.locator('#auth-confirm').fill(PASSWORD)
  await page.locator('form button[type="submit"]').click()
  await expect(page).toHaveURL('/MyProfile?setup=household')
  await closeHouseholdSetup(page)
  await expect(logOutButton(page)).toBeVisible()

  // The session cookie is httpOnly and survives a reload.
  const cookie = (await context.cookies()).find((c) => c.name === 'ecohome.sid')
  expect(cookie?.httpOnly).toBe(true)
  await page.reload()
  // The splash only shows on a first visit.
  await expect(page.locator('#app-loader')).toHaveCount(0)
  await expect(page).toHaveURL('/MyProfile')
  await expect(logOutButton(page)).toBeVisible()

  // Log out.
  await logOutButton(page).click()
  await expect(page).toHaveURL('/login')
  await expect(logOutButton(page)).toBeHidden()

  // A wrong password is refused with a generic message.
  await logInThroughForm(page, email, 'Wr0ng!Pass')
  await expect(page.getByRole('alert')).toContainText('Incorrect email or password.')
  await expect(page).toHaveURL('/login')

  // The right password logs back in. A ?redirect= to another site is ignored, so the
  // login page can't be used to send users somewhere else.
  await page.goto('/login?redirect=//evil.example')
  await logInThroughForm(page, email, PASSWORD)
  await expect(page).toHaveURL('/')
  await expect(logOutButton(page)).toBeVisible()
})
