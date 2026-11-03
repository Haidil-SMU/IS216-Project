import { test, expect } from '@playwright/test'

// Run with playwright.quotations.config.js and a signed-in homeowner test account.
// Requires one saved household and a painting contractor without an active request.
const createdRequestIds = []

test.afterEach(async ({ page }) => {
  for (const id of createdRequestIds.splice(0)) {
    const response = await page.request.delete(`/api/quotation-requests/${encodeURIComponent(id)}`)
    expect(response.status(), `Cleanup should cancel test request ${id}`).toBe(200)
  }
})

async function submitOwnRequest(page, description) {
    // Use predictable data for the unrelated government service.
    // Our own app's server requests still run normally.
    await page.route('https://data.gov.sg/**', async route => {
      await route.fulfill({
        json: {
          success: true,
          result: { records: [] }
        }
      })
    })

    await page.goto('/Contractors')

    const splash = page.locator('#app-loader')
    if (await splash.count()) {
      await splash.locator('.app-loader-switch').click()
      await expect(splash).toHaveCount(0)
    }

    await page.getByRole('checkbox', {
      name: 'Painting & Redecoration',
      exact: true
    }).check()

    await page.getByRole('button', {
      name: 'Find Matching Contractors'
    }).click()

    await page.getByRole('button', {
      name: 'Website-Registered Contractors'
    }).click()

    const availableRequests = page.getByRole('button', {
      name: /Request Quotation/
    }).and(page.locator('button:enabled'))

    await expect(
      availableRequests.first(),
      'A painting contractor without an existing pending request is needed'
    ).toBeVisible()

    await availableRequests.first().click()

    await expect(page).toHaveURL(/\/QuotationRequest\?/)

    await expect(page.locator('#householdName')).not.toHaveValue('')

    await expect(page.getByRole('checkbox', {
      name: 'Painting & Redecoration',
      exact: true
    })).toBeChecked()

    await page.locator('.project-notes').evaluate(element => { element.open = true })
    await page.locator('#description').fill(description)
    await page.getByLabel('Contact name', { exact: true }).fill('E2E Test Homeowner')
    await page.getByLabel('Contact number', { exact: true }).fill('+6591234567')
    await page.locator('#quotation-contact-email').fill('')
    await page.locator('#budget').fill('5000')

    const submitted = page.waitForResponse(response =>
      response.url().endsWith('/api/quotation-requests') &&
      response.request().method() === 'POST'
    )

    await page.getByRole('button', {
      name: 'Submit Quotation Request'
    }).click()

    const response = await submitted
    expect(response.status()).toBe(201)
    const savedRequest = await response.json()
expect(savedRequest.requestId).toBeTruthy()
    createdRequestIds.push(savedRequest.requestId)
    await expect(page.getByRole('heading', { name: 'Request Submitted!', exact: true })).toBeVisible()
}

test('homeowner can submit a quotation request and find it in MyQuotations', async ({ page }) => {
  const description = `E2E painting request ${Date.now()}`
  await submitOwnRequest(page, description)
  await page.screenshot({ path: 'test-results/evidence/B1-request-submitted.png', fullPage: true })
  await page.getByRole('button', { name: 'View My Quotations' }).click()
  const card = page.locator('.quotation-card').filter({ hasText: description })
  await expect(card).toHaveCount(1)
  await expect(card).toContainText('Pending Response')
  await expect(card).toContainText('S$5,000.00')
  await page.reload()
  await expect(card).toHaveCount(1)
  await expect(card).toContainText(description)
  await expect(card).toContainText('S$5,000.00')
  await card.screenshot({ path: 'test-results/evidence/B2-saved-request.png' })
})

test('homeowner can update a pending quotation request', async ({ page }) => {
    const description = `E2E edit request ${Date.now()}`
    const updatedDescription = `${description} updated`
    await submitOwnRequest(page, description)
    await page.goto('/MyQuotations')

    const splash = page.locator('#app-loader')
    if (await splash.count()) {
      await splash.locator('.app-loader-switch').click()
      await expect(splash).toHaveCount(0)
    }

    const originalCard = page.locator('.quotation-card')
      .filter({ hasText: description })

    await expect(originalCard).toHaveCount(1)
    await expect(originalCard).toContainText('Pending Response')

    await originalCard.getByRole('button', {
      name: 'Update Request',
      exact: true
    }).click()

    await expect(page).toHaveURL(/\/QuotationRequest\?/)
    await expect(page.getByLabel('Renovation Description'))
    await expect(page.getByRole('heading', { name: 'Update Quotation', exact: true })).toBeVisible()
    await expect(page.locator('#description')).toHaveValue(description)
    await page.locator('.project-notes').evaluate(element => { element.open = true })
    await expect(page.locator('#description'))
      .toHaveValue(description)

    await page.locator('#description')
      .fill(updatedDescription)
    await page.locator('#budget').fill('6500')

    const updated = page.waitForResponse(response =>
      response.url().includes('/api/quotation-requests/') &&
      response.request().method() === 'PUT'
    )

    await page.getByRole('button', {
      name: 'Save Changes'
    }).click()

    const updateResponse = await updated
    expect(updateResponse.status()).toBe(200)

    await expect(page.getByRole('heading', {
      name: 'Request Updated!',
      exact: true
    })).toBeVisible()

    await page.getByRole('button', {
      name: 'View My Quotations'
    }).click()

    const updatedCard = page.locator('.quotation-card')
      .filter({ hasText: updatedDescription })

    await expect(updatedCard).toHaveCount(1)
    await expect(updatedCard).toContainText('S$6,500.00')

    await page.reload()

    await expect(updatedCard).toHaveCount(1)
    await expect(updatedCard).toContainText('S$6,500.00')
    await expect(updatedCard).toContainText('Pending Response')
    await updatedCard.screenshot({
  path: 'test-results/evidence/B3-updated-request.png'
})
  }
)