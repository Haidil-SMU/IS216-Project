import { expect } from '@playwright/test'
import { PASSWORD, uniqueEmail, openPage, logInThroughForm, signUpViaApi } from './helpers'

export { uniqueEmail }

// A fresh homeowner with a saved 4-room household, so the 3D page has rooms to show.
export async function createHomeowner(playwright, baseURL, email) {
  const request = await playwright.request.newContext({ baseURL })
  await signUpViaApi(request, email)
  const household = await request.post('/api/users', {
    data: { name: 'E2E home', flatType: '4-room', occupants: 4, bedrooms: 3, budget: 150, pattern: 'Mostly home in the evenings' },
  })
  expect(household.ok()).toBe(true)
  await request.dispose()
}

// Logs in through the form and waits until the 3D page has loaded its rooms.
export async function openThreeD(page, email) {
  await openPage(page, '/login?redirect=/3d')
  await logInThroughForm(page, email, PASSWORD)
  await expect(page).toHaveURL('/3d')
  await expect(page.locator('.stat-value')).not.toHaveText('–', { timeout: 20000 })
}

// The "Estimated energy" number in kWh per year, e.g. "1,234" -> 1234.
export async function totalKwh(page) {
  const text = await page.locator('.stat-value').innerText()
  return Number(text.replace(/,/g, ''))
}

export function openRoom(page, name) {
  return page.getByRole('button', { name: new RegExp(`^${name}:.*Open this room`) }).click()
}

export const itemRows = (page) => page.locator('.item-row')

// Opens the "TV & Computing" tab of the catalogue and presses "+ Add" on the first TV card.
export async function addTv(page) {
  await page.getByRole('button', { name: 'TV & Computing', exact: true }).click()
  const card = page.locator('.item-card').filter({ hasText: /TV|Television/i }).first()
  await card.hover()
  await card.getByRole('button', { name: '+ Add' }).click()
}