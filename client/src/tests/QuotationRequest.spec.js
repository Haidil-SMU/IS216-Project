import { mount, flushPromises } from '@vue/test-utils'
import {
  describe, it, expect, vi, beforeEach, afterEach
} from 'vitest'
import axios from 'axios'
import QuotationRequest from '../views/QuotationRequest.vue'

vi.mock('axios', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn()
  }
}))

vi.mock('vue-router', () => ({
  useRoute: () => ({
    query: {
      contractorId: 'contractor-1',
      services: 'CR09'
    }
  }),
  useRouter: () => ({
    push: vi.fn(),
    back: vi.fn()
  })
}))

let wrapper

function mockData({ savedHousehold = true } = {}) {
  axios.get.mockImplementation(async (url) => {
    if (url === '/api/contractors') {
      return {
        data: [
          {
            _id: 'contractor-1',
            companyName: 'Alpha Renovation',
            services: ['CR09']
          }
        ]
      }
    }

    if (url === '/api/planner') {
      return {
        data: {
          users: savedHousehold
            ? [
                {
                  id: 'home-1',
                  name: 'My household',
                  flatType: '5-room',
                  occupants: 4,
                  bedrooms: 3
                }
              ]
            : [],
          plans: [
            {
              id: 'plan-1',
              householdId: 'home-1',
              name: 'Renovation option',
              layout: [{ id: 'living-room' }]
            },
            {
              id: 'empty-plan',
              householdId: 'home-1',
              name: 'Plan without layout',
              layout: []
            },
            {
              id: 'other-home-plan',
              householdId: 'home-2',
              name: 'Other household plan',
              layout: [{ id: 'other-room' }]
            }
          ],
          flatTypes: [
            { id: '5-room', name: '5-room HDB' }
          ]
        }
      }
    }

    throw new Error(`Unexpected request: ${url}`)
  })

  axios.post.mockResolvedValue({
    data: { message: 'Quotation request submitted successfully' }
  })
}

async function openPage() {
  wrapper = mount(QuotationRequest)
  await flushPromises()
}

async function fillRequirements() {
  await wrapper.get('#description').setValue('Paint the living room')
  await wrapper.get('#budget').setValue('5000')
}

async function submitForm() {
  await wrapper.get('form').trigger('submit')
  await flushPromises()
}

describe('QuotationRequest component', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockData()
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = undefined
    vi.restoreAllMocks()
  })

  it('loads saved household details and preselects the requested service',
    async () => {
      await openPage()

      expect(wrapper.text()).toContain('Alpha Renovation')
      expect(wrapper.get('#householdName').element.value)
        .toBe('My household')
      expect(wrapper.get('#flatType').element.value).toBe('5-room')
      expect(wrapper.get('#occupants').element.value).toBe('4')
      expect(wrapper.get('#bedrooms').element.value).toBe('3')
      expect(wrapper.get('input[type="checkbox"]').element.checked)
        .toBe(true)
    }
  )

  it('submits valid details and shows the success message', async () => {
    await openPage()
    await fillRequirements()
    await submitForm()

    expect(axios.post).toHaveBeenCalledTimes(1)
    expect(axios.post).toHaveBeenCalledWith(
      '/api/quotation-requests',
      {
        contractorId: 'contractor-1',
        householdId: 'home-1',
        planId: null,
        household: {
          name: 'My household',
          flatType: '5-room',
          occupants: 4,
          bedrooms: 3
        },
        services: ['Painting & Redecoration'],
        description: 'Paint the living room',
        budget: 5000,
        preferredStartDate: null
      }
    )
    expect(wrapper.text()).toContain('Request Submitted!')
  })

  it('blocks submission when no renovation service is selected',
    async () => {
      await openPage()
      await fillRequirements()

      await wrapper.get('input[type="checkbox"]').setValue(false)
      await submitForm()

      expect(wrapper.text()).toContain(
        'Please select at least one renovation service.'
      )
      expect(axios.post).not.toHaveBeenCalled()
    }
  )

  it('blocks a description containing only spaces', async () => {
    await openPage()
    await fillRequirements()

    await wrapper.get('#description').setValue('   ')
    await submitForm()

    expect(wrapper.text()).toContain(
      'Please describe your renovation requirements.'
    )
    expect(axios.post).not.toHaveBeenCalled()
  })

  it.each([
    ['blank', ''],
    ['zero', '0'],
    ['negative', '-100']
  ])('blocks a %s budget', async (_name, value) => {
    await openPage()
    await fillRequirements()

    await wrapper.get('#budget').setValue(value)
    await submitForm()

    expect(wrapper.text()).toContain('Please enter a valid budget.')
    expect(axios.post).not.toHaveBeenCalled()
  })

  it('offers only eligible layouts and submits the selected plan',
    async () => {
      await openPage()
      await fillRequirements()

      const layoutSelector = wrapper.get('#layoutPlan')
      const options = layoutSelector.findAll('option')
        .map(option => option.element.value)

      expect(options).toEqual(['', 'plan-1'])

      await layoutSelector.setValue('plan-1')
      await submitForm()

      expect(axios.post).toHaveBeenCalledWith(
        '/api/quotation-requests',
        expect.objectContaining({
          householdId: 'home-1',
          planId: 'plan-1'
        })
      )
      expect(wrapper.text()).toContain('Request Submitted!')
    }
  )

  it('supports manual property details when no household is saved',
    async () => {
      mockData({ savedHousehold: false })
      await openPage()

      expect(wrapper.get('input[value="saved"]').element.disabled)
        .toBe(true)
      expect(wrapper.get('input[value="manual"]').element.checked)
        .toBe(true)

      await wrapper.get('#householdName').setValue('Manual property')
      await wrapper.get('#flatType').setValue('5-room')
      await wrapper.get('#occupants').setValue('2')
      await wrapper.get('#bedrooms').setValue('3')
      await fillRequirements()
      await submitForm()

      expect(axios.post).toHaveBeenCalledWith(
        '/api/quotation-requests',
        expect.objectContaining({
          householdId: null,
          planId: null,
          household: {
            name: 'Manual property',
            flatType: '5-room',
            occupants: 2,
            bedrooms: 3
          }
        })
      )
      expect(wrapper.text()).toContain('Request Submitted!')
    }
  )

  it('shows a server error without claiming submission succeeded',
    async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      axios.post.mockRejectedValue({
        response: {
          data: {
            error: 'Unable to submit quotation request'
          }
        }
      })

      await openPage()
      await fillRequirements()
      await submitForm()

      expect(wrapper.text()).toContain(
        'Unable to submit quotation request'
      )
      expect(wrapper.text()).not.toContain('Request Submitted!')
      expect(wrapper.get('button[type="submit"]').element.disabled)
        .toBe(false)
    }
  )
})