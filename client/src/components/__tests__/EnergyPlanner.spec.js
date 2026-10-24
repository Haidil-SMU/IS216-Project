import { mount, flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import EnergyPlanner from '../EnergyPlanner.vue'
// Mock the MongoDB catalogue returned by /api/planner, independently of JSON files.
const catalogue = [
  { id: 101, name: 'EuropAce EGAC12E3', type: 'Air Conditioner', brand: 'EuropAce', power: 1.2, purchasePrice: 499, defaultHours: 8, room: 'Bedroom' },
  { id: 118, name: 'Light A', type: 'Lights', brand: 'Test brand', power: 0.006, purchasePrice: 3, defaultHours: 6, room: 'Living Room' },
  { id: 119, name: 'Light B', type: 'Lights', brand: 'Test brand', power: 0.004, purchasePrice: 2.5, defaultHours: 6, room: 'Living Room' },
  { id: 120, name: 'Light C', type: 'Lights', brand: 'Test brand', power: 0.0015, purchasePrice: 2, defaultHours: 6, room: 'Living Room' },
]
const mocks = vi.hoisted(() => ({
  auth: { user: { singpass: false }, singpassUrl: () => '/api/auth/singpass/login' },
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
}))
const chartMocks = vi.hoisted(() => ({ configs: [], destroy: vi.fn() }))
vi.mock('chart.js/auto', () => ({
  default: class {
    constructor(canvas, config) {
      chartMocks.configs.push(config)
    }
    destroy() {
      chartMocks.destroy()
    }
  },
}))
vi.mock('@/stores/auth', () => ({ useAuthStore: () => mocks.auth }))
vi.mock('vue-router', () => ({ useRoute: () => ({ query: {} }) }))
vi.mock('axios', () => ({ default: mocks }))
const profile = {
  name: 'Family home',
  flatType: '4-room',
  occupants: 4,
  bedrooms: 3,
  budget: 150,
  pattern: 'Evenings',
  appliances: [
    {
      type: 'Lights',
      room: 'Living Room',
      location: 'Desk',
      quantity: 1,
      hours: 6,
      daysPerWeek: 7,
      loadPercent: 100,
    },
  ],
}
let data
beforeEach(() => {
  vi.clearAllMocks()
  window.alert = vi.fn()
  chartMocks.configs = []
  mocks.auth.user = { singpass: false }
  Element.prototype.scrollIntoView = vi.fn()
  data = {
    appliances: structuredClone(catalogue),
    flatTypes: [{ id: '4-room', name: '4-room', bedrooms: 3 }],
    users: [{ ...profile, id: 'home' }],
    plans: [],
  }
  mocks.get.mockImplementation(async (url) =>
    url.endsWith('/planner') ? { data } : { status: 204 },
  )
  mocks.post.mockImplementation(async (url, body) => {
    const saved = { ...body, id: url.endsWith('/users') ? 'new-home' : 'new-plan' }
    if (url.endsWith('/users')) data.users.push(saved)
    else data.plans.push(saved)
    return { data: saved }
  })
  mocks.put.mockImplementation(async (url, body) => ({
    data: { ...body, id: url.includes('/users/') ? 'home' : 'first' },
  }))
})
async function render() {
  const w = mount(EnergyPlanner)
  await flushPromises()
  return w
}
function button(w, text) {
  return w.findAll('button').find((b) => b.text().includes(text))
}
function saved(id, householdId, kwh = 10, cost = 3.2) {
  return {
    id,
    householdId,
    name: id,
    profile,
    days: 30,
    tariff: 0.32,
    items: [],
    estimate: { kwh, cost },
  }
}
describe('Household-first energy planner', () => {
  it('initially shows only household selectors, then creates a household before showing the summary', async () => {
    const w = await render()
    expect(w.findAll('.saved-plan-card')).toHaveLength(0)
    await button(w, 'Plan my energy').trigger('click')
    expect(w.find('#household-name').exists()).toBe(false)
    expect(w.find('#plan-name').exists()).toBe(false)
    expect(w.find('#household-summary-title').exists()).toBe(false)
    await w.find('#household').setValue('__new__')
    expect(w.find('#household-name').exists()).toBe(true)
    expect(w.find('.btn-singpass').exists()).toBe(false)
    await button(w, 'Add household appliance').trigger('click')
    await button(w, 'Save household').trigger('click')
    await flushPromises()
    expect(w.find('#household-summary-title').text()).toBe('My household')
    expect(w.find('#household-name').exists()).toBe(false)
    expect(w.find('#plan-name').exists()).toBe(false)
    expect(w.text()).toContain('Saved Plans')
    w.unmount()
  })
  it('shows Myinfo only for Singpass accounts when creating a household', async () => {
    mocks.auth.user = { singpass: true }
    const w = await render()
    await w.find('#household').setValue('__new__')
    expect(w.find('.btn-singpass').exists()).toBe(true)
    w.unmount()
  })
  it('filters dashboard cards by household and opens the correct plan', async () => {
    data.users.push({ ...profile, id: 'other', name: 'Other home' })
    data.plans = [saved('first', 'home'), saved('second', 'other')]
    const w = await render()
    await w.find('#dashboard-household').setValue('other')
    expect(w.findAll('.saved-plan-card')).toHaveLength(1)
    expect(w.find('.saved-plan-card').text()).toContain('second')
    expect(w.find('.overview-card').exists()).toBe(false)
    await w.find('.saved-open').trigger('click')
    await flushPromises()
    expect(w.find('#household').element.value).toBe('other')
    expect(w.find('#plan-name').element.value).toBe('second')
    w.unmount()
  })
  it('shows all plans by default, filters charts, and forecasts cumulative totals over 12 full calendar months', async () => {
    data.plans = [
      saved('first', 'home', 30, 9.6),
      saved('second', 'home', 60, 19.2),
      saved('foreign', 'other', 999, 999),
    ]
    const w = await render()
    await button(w, 'Plan my energy').trigger('click')
    await w.find('#household').setValue('home')
    expect(w.findAll('canvas')).toHaveLength(5)
    expect(w.text()).not.toContain('Where your electricity goes')
    expect(w.find('.comparison-table').exists()).toBe(false)
    let charts = chartMocks.configs.slice(-5)
    expect(charts[0].type).toBe('bar')
    expect(charts[0].data.labels).toEqual(['first', 'second'])
    expect(charts[2].type).toBe('line')
    expect(charts[2].data.labels).toHaveLength(12)
    expect(charts[2].data.datasets).toHaveLength(2)
    const now = new Date()
    let cumulativeDays = 0
    for (let i = 0; i < 12; i++) {
      const days = new Date(now.getFullYear(), now.getMonth() + i + 1, 0).getDate()
      cumulativeDays += days
      expect(charts[2].data.datasets[0].data[i]).toBe(cumulativeDays)
      expect(charts[3].data.datasets[0].data[i]).toBeCloseTo(cumulativeDays * 0.32)
      expect(charts[2].data.datasets[1].data[i]).toBe(cumulativeDays * 2)
      expect(charts[3].data.datasets[1].data[i]).toBeCloseTo(cumulativeDays * 2 * 0.32)
    }
    expect(w.text()).toContain('Cumulative forecast values')
    expect(w.text()).toContain((cumulativeDays * 2).toFixed(1))
    await w.find('#compare-first').setValue(true)
    charts = chartMocks.configs.slice(-5)
    expect(charts[0].data.labels).toEqual(['first'])
    expect(charts[2].data.datasets).toHaveLength(1)
    await button(w, 'Compare all plans').trigger('click')
    expect(chartMocks.configs.slice(-5)[0].data.labels).toEqual(['first', 'second'])
    w.unmount()
    expect(chartMocks.destroy).toHaveBeenCalled()
  })
  it('opens Add plan, calculates electricity separately, and saves under the selected household', async () => {
    const w = await render()
    await w.find('#household').setValue('home')
    await button(w, 'Add plan').trigger('click')
    await flushPromises()
    expect(w.find('#house-hours-0').exists()).toBe(false)
    expect(w.findAll('[id^=plan-model-]')).toHaveLength(1)
    await w.find('#plan-model-0').setValue(119)
    expect(w.text()).toContain('Equipment purchase subtotal: S$2.50')
    await button(w, 'Save plan').trigger('click')
    await flushPromises()
    expect(data.plans[0].householdId).toBe('home')
    expect(data.plans[0].items[0].power).toBe(0.004)
    expect(data.plans[0].estimate.cost).toBeCloseTo(0.2304)
    expect(w.find('#plan-name').exists()).toBe(false)
    await button(w, 'My dashboard').trigger('click')
    expect(w.findAll('.saved-plan-card')).toHaveLength(1)
    w.unmount()
  })
  it('rejects blank and duplicate names, allows updates, and requires a new name for copies', async () => {
    data.plans = [saved('first', 'home')]
    const w = await render()
    await button(w, 'Plan my energy').trigger('click')
    await w.find('#household').setValue('home')
    await button(w, 'Add plan').trigger('click')
    await w.find('#plan-name').setValue('   ')
    await button(w, 'Save plan').trigger('click')
    expect(mocks.post).not.toHaveBeenCalled()
    await w.find('#plan-name').setValue(' FIRST ')
    await button(w, 'Save plan').trigger('click')
    expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('already exists'))
    expect(mocks.post).not.toHaveBeenCalled()
    await w.find('[aria-label="View first"]').trigger('click')
    await button(w, 'Save as new plan').trigger('click')
    expect(mocks.post).not.toHaveBeenCalled()
    await button(w, 'Update plan').trigger('click')
    await flushPromises()
    expect(mocks.put).toHaveBeenCalledWith(
      '/api/plans/first',
      expect.objectContaining({ name: 'first' }),
    )
    await button(w, 'Add plan').trigger('click')
    await w.find('#plan-name').setValue('New name')
    await button(w, 'Save plan').trigger('click')
    await flushPromises()
    expect(mocks.post).toHaveBeenCalledWith(
      '/api/plans',
      expect.objectContaining({
        name: 'New name',
        items: expect.arrayContaining([expect.objectContaining({ type: 'Lights' })]),
      }),
    )
    w.unmount()
  })
  it('requires household appliances, stores their usage and copies them independently into a plan', async () => {
    data.users[0] = { ...profile, id: 'home', appliances: [] }
    const w = await render()
    await button(w, 'Plan my energy').trigger('click')
    await w.find('#household').setValue('home')
    await button(w, 'Add plan').trigger('click')
    expect(w.find('#inventory-title').exists()).toBe(false)
    expect(w.find('#plan-name').exists()).toBe(true)
    expect(w.find('#household').element.value).toBe('home')
    await button(w, 'Edit household').trigger('click')
    expect(w.find('#inventory-title').exists()).toBe(true)
    await button(w, 'Save household').trigger('click')
    expect(mocks.put).not.toHaveBeenCalled()
    await w.find('#household-appliance-type').setValue('Lights')
    await button(w, 'Add household appliance').trigger('click')
    await w.find('#house-hours-0').setValue(5)
    mocks.put.mockImplementation(async (url, body) => {
      data.users[0] = { ...JSON.parse(JSON.stringify(body)), id: 'home' }
      return { data: data.users[0] }
    })
    await button(w, 'Save household').trigger('click')
    await flushPromises()
    expect(data.users[0].appliances[0].hours).toBe(5)
    await button(w, 'Add plan').trigger('click')
    expect(w.text()).toContain('5 hours/day')
    await w.find('#plan-model-0').setValue(120)
    expect(data.users[0].appliances[0].applianceId).toBeUndefined()
    await button(w, 'Save plan').trigger('click')
    await flushPromises()
    expect(data.plans[0].items[0]).toMatchObject({
      type: 'Lights',
      hours: 5,
      applianceId: 120,
      power: 0.0015,
    })
    expect(data.plans[0].estimate.cost).toBeCloseTo(0.072)
    w.unmount()
  })
  it('keeps household entries editable if the server has not persisted the appliance list', async () => {
    const w = await render()
    await button(w, 'Plan my energy').trigger('click')
    await w.find('#household').setValue('home')
    await button(w, 'Edit household').trigger('click')
    mocks.put.mockImplementation(async () => {
      data.users = [{...profile, id:'home', appliances:[]}]
      return {data:data.users[0]}
    })
    await button(w, 'Save household').trigger('click')
    await flushPromises()
    expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('Restart the server'))
    expect(w.find('#house-hours-0').element.value).toBe('6')
    expect(w.find('fieldset').attributes('disabled')).toBeUndefined()
    w.unmount()
  })

  it('uses API model power and price when updating an existing plan', async () => {
    data.appliances[2].power = 0.01
    data.appliances[2].purchasePrice = 42
    data.plans = [{ ...saved('first', 'home'), items: [{ ...profile.appliances[0], applianceId: 118, power: 0.006, purchasePrice: 3 }] }]
    const w = await render()
    await w.find('#household').setValue('home')
    await w.find('[aria-label="View first"]').trigger('click')
    await w.find('#plan-model-0').setValue(119)
    expect(w.text()).toContain('Equipment purchase subtotal: S$42.00')
    await button(w, 'Update plan').trigger('click')
    await flushPromises()
    expect(mocks.put).toHaveBeenCalledWith('/api/plans/first', expect.objectContaining({
      items: [expect.objectContaining({ applianceId: 119, power: 0.01, purchasePrice: 42 })],
      estimate: expect.objectContaining({ cost: expect.closeTo(0.576) }),
    }))
    expect(window.alert).toHaveBeenCalledWith('Your plan has been saved.')
    expect(w.find('.alert-danger').exists()).toBe(false)
    w.unmount()
  })
  it('alerts on a failed load and allows retrying', async () => {
    mocks.get.mockRejectedValueOnce(new Error('Offline'))
    const w = await render()
    expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('Unable to load'))
    await button(w, 'Retry').trigger('click')
    await flushPromises()
    expect(w.find('#household').exists()).toBe(true)
    w.unmount()
  })

  it('compares initial prices using saved prices, quantities and catalogue fallback', async () => {
    data.plans = [
      { ...saved('first', 'home'), items: [{ applianceId: 119, purchasePrice: 10, quantity: 2 }, { applianceId: 118, quantity: 3 }] },
      { ...saved('second', 'home'), items: [{ applianceId: 120, purchasePrice: 5, quantity: 1 }] },
      { ...saved('unknown', 'home'), items: [{ applianceId: 999, quantity: 1 }] },
      { ...saved('foreign', 'other'), items: [{ applianceId: 119, quantity: 10 }] },
    ]
    const w = await render()
    await w.find('#household').setValue('home')
    await button(w, 'Plan my energy').trigger('click')
    let chart = chartMocks.configs.at(-1)
    expect(chart.type).toBe('bar')
    expect(chart.data.datasets[0].barThickness).toBe(30)
    expect(w.find('.planner-bar-chart').element.style.width).toBe('310px')
    expect(chart.data.labels).toEqual(['first', 'second', 'unknown'])
    expect(chart.data.datasets[0].data).toEqual([29, 5, null])
    expect(w.text()).toContain('unknown: Price unavailable')
    await w.find('#compare-second').setValue(true)
    chart = chartMocks.configs.at(-1)
    expect(chart.data.labels).toEqual(['second'])
    expect(chart.data.datasets[0].barThickness).toBe(30)
    expect(w.find('.planner-bar-chart').element.style.width).toBe('200px')
    expect(chart.data.datasets[0].data).toEqual([5])
    w.unmount()
  })

})
