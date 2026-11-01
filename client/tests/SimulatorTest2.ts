
import { test, expect } from '@playwright/test'

test('Increasing aircon temperature reduces electricity cost', async ({ page }) => {

    // Control simulation time
    await page.clock.install()

    await page.goto('http://localhost:5173/')

    // Navigate to simulator
    await page.getByRole('link', { name: 'My HDB' }).click()
    await page.getByRole('button', { name: '▶ START DAY' }).click()
    await page.getByRole('button', { name: /Living Room/ }).click()

    // Find the air conditioner
    const aircon = page.locator('.device-tile')
        .filter({ hasText: 'Split Air Conditioner' })

    // Make sure air conditioner is ON
    const isOn = await aircon.evaluate(
        element => element.classList.contains('powered')
    )

    if (!isOn) {
        await aircon.click()
    }

    // Open air conditioner settings
    const airconCard = page.locator('.device-wrapper')
        .filter({ hasText: 'Split Air Conditioner' })

    await airconCard.getByRole('button', { name: '⚙️ Settings' }).click()

    const settings = page.locator('.appliance-settings')
        .filter({ hasText: 'Split Air Conditioner' })

    await expect(settings).toBeVisible()

    // Check initial temperature
    await expect(settings.locator('.setting-stepper strong'))
        .toHaveText('25°C')

    // Find electricity cost display
    const costDisplay = page.locator('.stat-card')
        .filter({ hasText: 'ELECTRICITY COST' })
        .locator('.stat-number')

    await page.clock.pauseAt(new Date(Date.now() + 1000))

    // Test at 25°C
    const costBefore = Number(
        (await costDisplay.innerText()).replace('S$', '')
    )

    await page.clock.runFor(16800)

    const costAt25 = Number(
        (await costDisplay.innerText()).replace('S$', '')
    )

    const increaseAt25 = costAt25 - costBefore

    // Increase temperature to 27°C
    await settings.getByRole('button', { name: '+' }).click()
    await settings.getByRole('button', { name: '+' }).click()

    await expect(settings.locator('.setting-stepper strong'))
        .toHaveText('27°C')

    // Test at 27°C
    await page.clock.runFor(16800)

    const costAt27 = Number(
        (await costDisplay.innerText()).replace('S$', '')
    )

    const increaseAt27 = costAt27 - costAt25

    // Verify electricity cost increases more slowly
    expect(increaseAt27).toBeLessThan(increaseAt25)

})
