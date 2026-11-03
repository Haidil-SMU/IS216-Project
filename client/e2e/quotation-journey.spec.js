import { test, expect } from '@playwright/test'
const createdRequestIds = []

test.afterEach(async ({ page }) => {
  const ids = createdRequestIds.splice(0)

  for (const id of ids) {
    const response = await page.request.delete(
      `/api/quotation-requests/${encodeURIComponent(id)}`
    )

    expect(
      response.status(),
      `Cleanup should remove test request ${id}`
    ).toBe(200)
  }
})
test('homeowner can submit a quotation request and find it in MyQuotations',
  async ({ page }) => {
    const description = `E2E painting request ${Date.now()}`

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

    await page.getByLabel('Renovation Description').fill(description)
    await page.getByLabel('Estimated Budget (S$)').fill('5000')

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
createdRequestIds.push(savedRequest.requestId)
    await expect(page.getByRole('heading', {
      name: 'Request Submitted!',
      exact: true
    })).toBeVisible()
await page.screenshot({
  path: 'test-results/evidence/B1-request-submitted.png',
  fullPage: true
})
    await page.getByRole('button', {
      name: 'View My Quotations'
    }).click()

    const requestCard = page.locator('.quotation-card')
      .filter({ hasText: description })

    await expect(requestCard).toHaveCount(1)
    await expect(requestCard).toContainText('Pending Response')
    await expect(requestCard).toContainText('S$5,000.00')

    await page.reload()

    await expect(requestCard).toHaveCount(1)
    await expect(requestCard).toContainText(description)
    await requestCard.screenshot({
  path: 'test-results/evidence/B2-saved-request.png'
})
  }
)




// update pending quotation and verify changes
test('homeowner can update a pending quotation request',
  async ({ page }) => {
    const description = `E2E edit request ${Date.now()}`
    const updatedDescription = `${description} updated`

    // Create this test's own request using the real server.
    // It does not depend on the first test passing.
    const contractorsResponse = await page.request.get('/api/contractors')
    expect(contractorsResponse.ok()).toBe(true)

    const contractorData = await contractorsResponse.json()
    const contractors = Array.isArray(contractorData)
      ? contractorData
      : contractorData.contractors

    expect(contractors.length).toBeGreaterThan(0)

    const contractor = contractors[0]

    const serviceValue = contractor.services[0]
    const service = typeof serviceValue === 'string'
      ? serviceValue
      : serviceValue.name || serviceValue.code

    const createResponse = await page.request.post(
      '/api/quotation-requests',
      {
        data: {
          contractorId: contractor._id,
          householdId: null,
          planId: null,
          household: {
            name: 'E2E test property',
            flatType: '5-room',
            occupants: 2,
            bedrooms: 3
          },
          services: [service],
          description,
          budget: 5000,
          preferredStartDate: null
        }
      }
    )

    expect(createResponse.status()).toBe(201)
const savedRequest = await createResponse.json()
createdRequestIds.push(savedRequest.requestId)
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
      .toHaveValue(description)

    await page.getByLabel('Renovation Description')
      .fill(updatedDescription)
    await page.getByLabel('Estimated Budget (S$)').fill('6500')

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