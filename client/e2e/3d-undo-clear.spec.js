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

test.use({ viewport: { width: 1440, height: 900 } })

const email = uniqueEmail('3d-undo')

test.beforeAll(async ({ playwright, baseURL }) => {
  await createHomeowner(playwright, baseURL, email)
})

test('undo and redo step through a change, and "Clear room" asks first and can be undone', async ({ page }) => {
  await openThreeD(page, email)
  const energyBefore = await totalKwh(page)

  await openRoom(page, 'Living Room')
  const rowsBefore = await itemRows(page).count()
  const undo = page.getByRole('button', { name: 'Undo' })
  const redo = page.getByRole('button', { name: 'Redo' })

  await test.step('nothing can be undone before the first change', async () => {
    await expect(undo).toBeDisabled()
    await expect(redo).toBeDisabled()
  })

  await test.step('adding an appliance can be undone and redone', async () => {
    await addTv(page)
    await expect(itemRows(page)).toHaveCount(rowsBefore + 1)

    await undo.click()
    await expect(itemRows(page)).toHaveCount(rowsBefore)
    await expect(redo).toBeEnabled()

    await redo.click()
    await expect(itemRows(page)).toHaveCount(rowsBefore + 1)
  })

  await test.step('"Clear all" asks first, and Cancel keeps everything', async () => {
    await page.getByRole('button', { name: 'Clear all' }).click()
    const dialog = page.getByRole('alertdialog', { name: /^Clear the/ })
    await expect(dialog).toBeVisible()

    await dialog.getByRole('button', { name: 'Cancel' }).click()

    await expect(dialog).toBeHidden()
    await expect(itemRows(page)).toHaveCount(rowsBefore + 1)
  })

  await test.step('"Clear room" removes the appliance and the energy goes back down', async () => {
    await page.getByRole('button', { name: 'Clear all' }).click()
    await page.getByRole('alertdialog').getByRole('button', { name: 'Clear room' }).click()

    await expect(itemRows(page)).toHaveCount(rowsBefore)
    await expect.poll(() => totalKwh(page)).toBeLessThanOrEqual(energyBefore)
  })

  await test.step('the dialog promises "you can undo it afterwards", and Undo brings the appliance back', async () => {
    await undo.click()

    await expect(itemRows(page)).toHaveCount(rowsBefore + 1)
    await expect.poll(() => totalKwh(page)).toBeGreaterThan(energyBefore)
  })
})