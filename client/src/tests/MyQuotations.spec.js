import { mount, flushPromises } from '@vue/test-utils'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import axios from 'axios'
import MyQuotations from '../views/MyQuotations.vue'

vi.mock('axios', () => ({
  default: {
    get: vi.fn()
  }
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({
    push: vi.fn()
  })
}))

const contractors = [
  {
    _id: 'contractor-1',
    companyName: 'Alpha Renovation',
    location: 'Tampines'
  },
  {
    _id: 'contractor-2',
    companyName: 'Beta Renovation',
    location: 'Bedok'
  }
]

function makeRequest(overrides = {}) {
  return {
    _id: 'request-1',
    contractorId: 'contractor-1',
    status: 'quoted',
    household: {
      name: 'My household',
      flatType: '5-room HDB'
    },
    services: ['Painting'],
    description: 'Paint the living room',
    budget: 1000,
    createdAt: '2026-10-01T00:00:00Z',
    quotation: {
      total: 1200,
      notes: '',
      warnings: [],
      items: [
        {
          service: 'Wall painting',
          description: 'Two coats of paint',
          quantity: 2,
          unitPrice: 600,
          amount: 1200
        }
      ]
    },
    ...overrides
  }
}

function mockResponses(requests) {
  axios.get.mockImplementation(async (url) => {
    if (url === '/api/quotation-requests') {
      return { data: requests }
    }

    if (url === '/api/contractors') {
      return { data: contractors }
    }

    throw new Error(`Unexpected request: ${url}`)
  })
}

let wrapper

async function openPage() {
  wrapper = mount(MyQuotations, {
    global: {
      stubs: {
        RouterLink: {
          props: ['to'],
          template: '<a :href="to"><slot /></a>'
        }
      }
    }
  })

  await flushPromises()
  return wrapper
}

function findButton(text) {
  const button = wrapper.findAll('button')
    .find(button => button.text().includes(text))

  if (!button) {
    throw new Error(`Button not found: ${text}`)
  }

  return button
}

describe('MyQuotations component', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = undefined
    vi.restoreAllMocks()
  })

  it('shows an empty state when there are no requests', async () => {
    mockResponses([])

    await openPage()

    expect(wrapper.text()).toContain('No Quotation Requests Yet')
    expect(wrapper.text()).not.toContain('Loading quotation requests...')
  })

  it('displays the contractor, quotation amount and over-budget difference',
    async () => {
      mockResponses([makeRequest()])

      await openPage()

      expect(wrapper.text()).toContain('Alpha Renovation')
      expect(wrapper.text()).toContain('Quotation Received')
      expect(wrapper.text()).toContain('S$1,200.00')
      expect(wrapper.text()).toContain('Over Budget')
      expect(wrapper.text()).toContain('S$200.00')
    }
  )

  it('opens and closes the itemised quotation breakdown', async () => {
    mockResponses([makeRequest()])

    await openPage()

    expect(wrapper.text()).not.toContain('Two coats of paint')

    await findButton('View Quotation Breakdown').trigger('click')

    expect(wrapper.text()).toContain('Itemised Quotation Breakdown')
    expect(wrapper.text()).toContain('Wall painting')
    expect(wrapper.text()).toContain('Two coats of paint')

    await findButton('Hide Quotation Breakdown').trigger('click')

    expect(wrapper.text()).not.toContain('Two coats of paint')
  })

  it('requires two received quotations before comparison is ready',
    async () => {
      mockResponses([
        makeRequest(),
        makeRequest({
          _id: 'request-2',
          contractorId: 'contractor-2'
        })
      ])

      await openPage()

      expect(wrapper.text()).not.toContain('Ready for Comparison')

      const checkboxes = wrapper.findAll('input[type="checkbox"]')

      expect(checkboxes).toHaveLength(2)

      await checkboxes[0].setValue(true)

      expect(wrapper.text()).toContain('1 quotation(s) selected')
      expect(wrapper.text()).not.toContain('Ready for Comparison')

      await checkboxes[1].setValue(true)

      expect(wrapper.text()).toContain('2 quotation(s) selected')
      expect(wrapper.text()).toContain('Ready for Comparison')

      await findButton('Clear Selection').trigger('click')

      expect(wrapper.text()).toContain('0 quotation(s) selected')
      expect(wrapper.text()).not.toContain('Ready for Comparison')
      expect(checkboxes[0].element.checked).toBe(false)
      expect(checkboxes[1].element.checked).toBe(false)
    }
  )

  it('does not offer pending or rejected requests for comparison',
    async () => {
      mockResponses([
        makeRequest({
          _id: 'pending-request',
          status: 'pending',
          quotation: null
        }),
        makeRequest({
          _id: 'rejected-request',
          contractorId: 'contractor-2',
          status: 'rejected',
          quotation: null
        })
      ])

      await openPage()

      expect(wrapper.text()).toContain('Waiting for the contractor to respond.')
      expect(wrapper.text()).toContain(
        'This contractor has rejected your quotation request.'
      )
      expect(wrapper.findAll('input[type="checkbox"]')).toHaveLength(0)
    }
  )

  it('shows a loading error and lets the user retry', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})

    axios.get.mockRejectedValue({
      response: {
        data: {
          error: 'Unable to load quotation requests.'
        }
      }
    })

    await openPage()

    expect(wrapper.text()).toContain('Unable to load quotation requests.')
    expect(wrapper.text()).not.toContain('No Quotation Requests Yet')

    mockResponses([makeRequest()])

    await findButton('Retry').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('Alpha Renovation')
    expect(wrapper.text()).not.toContain('Unable to load quotation requests.')
  })
})