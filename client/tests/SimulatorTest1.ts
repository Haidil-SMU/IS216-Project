
import { test, expect } from '@playwright/test'

test('User can turn on the Stand Fan', async ({ page }) => {

    await page.goto('http://localhost:5173/')

    await page.getByRole('link', { name: 'My HDB' }).click()

    await page.getByRole('button', { name: '▶ START DAY' }).click()

    const fan = page.locator('.device-tile')
        .filter({ hasText: 'Stand Fan' })

    // Check whether the fan is already ON
    const isOn = await fan.evaluate(
        element => element.classList.contains('powered')
    )

    // If already ON, switch it OFF first
    if (isOn) {
        await fan.click()
    }

    // Now turn the fan ON
    await fan.click()

    // Verify the fan is ON
    await expect(fan).toHaveClass(/powered/)

})
