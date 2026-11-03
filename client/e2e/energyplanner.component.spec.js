import { mount, flushPromises } from '@vue/test-utils'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import axios from 'axios'
import EnergyPlanner from '../src/components/EnergyPlanner.vue'
import retailers from '../src/data/electricity-retailers.json'

// Component tests use sample responses instead of connecting to the server.
vi.mock('axios', () => ({
  default: { get: vi.fn(), post: vi.fn() },
}))
vi.mock('chart.js/auto', () => ({
  default: class { destroy() {} },
}))

describe('TestSuite: EnergyPlanner component', () => {
  let wrapper
  const originalShowModal = HTMLDialogElement.prototype.showModal

  beforeEach(async () => {
    vi.clearAllMocks()
    // jsdom does not implement opening a dialog.
    HTMLDialogElement.prototype.showModal = function () {
      this.open = true
    }

    const household = { id: 'test-home', name: 'Test household', flatType: '4-room', budget: 150 }
    const rooms = [{
      _id: 'test-room',
      name: 'Bedroom',
      placements: [{
        _id: 'test-lamp',
        applianceTypeKey: 'test-lamp',
        category: 'lighting',
        energyInfo: { name: 'Test lamp', kwhYear: 365, averagePrice: 25 },
      }],
    }]

    axios.get.mockImplementation(async (url) => {
      if (url.endsWith('/rooms')) return { data: { rooms } }
      return { data: { users: [household], plans: [] } }
    })
    axios.post.mockResolvedValue({ data: { id: 'new-plan' } })

    wrapper = mount(EnergyPlanner, { global: { stubs: { RouterLink: true } } })
    await flushPromises()
  })

  afterEach(() => {
    wrapper?.unmount()
    if (originalShowModal) HTMLDialogElement.prototype.showModal = originalShowModal
    else delete HTMLDialogElement.prototype.showModal
    vi.restoreAllMocks()
  })

  it('Test1: updates the displayed cost when the retailer changes', async () => {
    // Action
    const retailer = retailers.plans[1]
    await wrapper.find('#tariff').setValue(retailer.id)

    // Assert: 365 kWh/year is 30 kWh over 30 days at 100% usage.
    const expectedCost = (30 * retailer.rate).toFixed(2)
    expect(wrapper.find('#tariff').element.value).toBe(retailer.id)
    expect(wrapper.text()).toContain('S$' + expectedCost + '/month')
  })

  it('Test2: shows an error and prevents saving when usage exceeds 100%', async () => {
    // Action
    await wrapper.find('#plan-usage-0').setValue(101)
    const saveButton = wrapper.findAll('button').find(button => button.text() === 'Save plan')
    await saveButton.trigger('click')
    await flushPromises()

    // Assert
    expect(wrapper.find('dialog').element.open).toBe(true)
    expect(wrapper.find('#planner-notice-message').text()).toContain('cannot save the plan')
    expect(axios.post).not.toHaveBeenCalled()
  })
})
