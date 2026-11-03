  import { test, expect } from '@playwright/test'
  import {
    uniqueEmail,
    createHomeowner,
    openThreeD,
    openRoom,
    totalKwh,
    itemRows,
    addTv,
  } from './helpers3d'

  // The catalogue at the bottom of the 3D page only opens by itself on a tall window.
  test.use({ viewport: { width: 1440, height: 900 } })

  const email = uniqueEmail('3d-add')

  test.beforeAll(async ({ playwright, baseURL }) => {
    await createHomeowner(playwright, baseURL, email)
  })

  test('a homeowner adds an appliance to a room in 3D, the energy goes up, and it is still there after a reload', async ({ page }) => {
    await test.step('the 3D page opens with the rooms of the household', async () => {
      await openThreeD(page, email)

      await expect(page.getByRole('region', { name: 'Estimated yearly energy' })).toBeVisible()
      await expect(page.locator('.breakdown-row').first()).toBeVisible()
    })

    const energyBefore = await totalKwh(page)
    let rowsBefore = 0

    await test.step('open the Living Room and add a TV from the catalogue', async () => {
      await openRoom(page, 'Living Room')
      rowsBefore = await itemRows(page).count()

      await addTv(page)

      await expect(itemRows(page)).toHaveCount(rowsBefore + 1)
    })

    await test.step('the estimated yearly energy of the flat goes up', async () => {
      await expect.poll(() => totalKwh(page)).toBeGreaterThan(energyBefore)
    })

    await test.step('the appliance was saved: it is still in the Living Room after a reload', async () => {
      await page.waitForLoadState('networkidle')
      await page.reload()
      await expect(page.locator('.stat-value')).not.toHaveText('–', { timeout: 20000 })
      await openRoom(page, 'Living Room')

      await expect(itemRows(page)).toHaveCount(rowsBefore + 1)
      expect(await totalKwh(page)).toBeGreaterThan(energyBefore)
    })
  })