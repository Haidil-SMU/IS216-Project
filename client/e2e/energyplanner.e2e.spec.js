import { test, expect } from '@playwright/test'

// Set up a new account and saved room through the real API for each test.
// Uses the running website and backend through playwright.e2e.config.js.
test.beforeEach(async ({ page }) => {
  const signup = await page.request.post('/api/auth/signup', {
    data: {
      name: 'Planner test user',
      email: 'planner-' + crypto.randomUUID() + '@test.local',
      password: 'Str0ng!Pass',
    },
  })
  expect(signup.status()).toBe(201)

  const household = await page.request.post('/api/users', {
    data: { name: 'Test household', flatType: '4-room', budget: 150, occupants: 2 },
  })
  expect(household.status()).toBe(201)

  const layoutResponse = await page.request.get('/api/spatial/current')
  expect(layoutResponse.ok()).toBe(true)
  const layout = await layoutResponse.json()
  const placement = await page.request.post(
    '/api/spatial/rooms/' + layout.rooms[0]._id + '/placements',
    { data: { applianceTypeKey: 'test-lamp', category: 'lighting', name: 'Test lamp', kwhYear: 365 } },
  )
  expect(placement.status()).toBe(201)

  await page.goto('/EnergyPlanner/')
  await page.locator('#app-loader .app-loader-switch').click()
  await expect(page.locator('#app-loader')).toHaveCount(0)
  await expect(page.getByLabel('Usage (% of annual rating)')).toBeVisible()
})

test('Test1: saves a plan and displays it again after reloading', async ({ page }) => {
  // Actions
  await page.getByLabel('Plan name', { exact: true }).fill('Browser plan')
  await page.locator('#tariff').selectOption('geneco-fixed24')
  await page.getByRole('button', { name: 'Save plan', exact: true }).click()

  // Assert
  await expect(page.getByRole('dialog', { name: 'Plan saved!' })).toBeVisible()
  await page.getByRole('button', { name: 'Got it', exact: true }).click()
  await expect(page.getByRole('button', { name: 'View Browser plan' })).toBeVisible()
  await expect(page.locator('canvas')).toHaveCount(5)
  await expect(page.getByRole('img', {
    name: 'Vertical bar chart comparing total appliance purchase prices',
  })).toBeVisible()

  // Reload to read the plan back from the server and database.
  await page.reload()
  await page.getByRole('button', { name: 'View Browser plan' }).click()
  await expect(page.getByLabel('Plan name', { exact: true })).toHaveValue('Browser plan')
  await expect(page.locator('#tariff')).toHaveValue('geneco-fixed24')
})

test('Test2: blocks invalid usage and saves after it is corrected', async ({ page }) => {
  // Actions
  await page.getByLabel('Plan name', { exact: true }).fill('Corrected plan')
  await page.getByLabel('Usage (% of annual rating)').fill('101')
  await page.getByLabel('Usage (% of annual rating)').press('Tab')

  // Assert: invalid usage shows an error and cannot be saved.
  const warning = page.getByRole('dialog', { name: 'Usage rate too high' })
  await expect(warning).toContainText('cannot save the plan')
  await page.getByRole('button', { name: 'Got it', exact: true }).click()
  await page.getByRole('button', { name: 'Save plan', exact: true }).click()
  await expect(warning).toBeVisible()
  const response = await page.request.get('/api/planner')
  expect(response.ok()).toBe(true)
  expect((await response.json()).plans).toHaveLength(0)

  // Correct the value, save and verify the persisted value after reloading.
  await page.getByRole('button', { name: 'Got it', exact: true }).click()
  await page.getByLabel('Usage (% of annual rating)').fill('100')
  await page.getByRole('button', { name: 'Save plan', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Plan saved!' })).toBeVisible()
  await page.reload()
  await page.getByRole('button', { name: 'View Corrected plan' }).click()
  await expect(page.getByLabel('Usage (% of annual rating)')).toHaveValue('100')
})
