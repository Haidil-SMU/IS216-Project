import { mount, flushPromises } from '@vue/test-utils'
import { beforeEach, expect, it, vi } from 'vitest'
import EnergyPlanner from '../EnergyPlanner.vue'
const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() }))
const charts = vi.hoisted(() => ({ configs: [], destroy: vi.fn() }))
vi.mock('axios', () => ({ default: api }))
vi.mock('chart.js/auto', () => ({
  default: class {
    constructor(canvas, config) {
      charts.configs.push(config)
    }
    destroy() {
      charts.destroy()
    }
  },
}))
let data
let rooms
const home = { id: 'home', name: 'Family home', flatType: '4-room', occupants: 4, budget: 150 }
const item = { name: 'LED', room: 'Bedroom', quantity: 1, annualKwh: 365, usagePercent: 100 }
function saved(id = 'first', householdId = 'home') {
  return {
    id,
    householdId,
    name: id,
    profile: home,
    days: 30,
    tariff: 0.32,
    items: [{ ...item }],
    estimate: { kwh: 30, cost: 9.6 },
  }
}
beforeEach(() => {
  vi.clearAllMocks()
  charts.configs = []
  window.alert = vi.fn()
  window.confirm = vi.fn(() => true)
  Element.prototype.scrollIntoView = vi.fn()
  data = { users: [home], plans: [] }
  rooms = [
    {
      _id: 'room',
      name: 'Bedroom',
      placements: [
        {
          _id: 'light',
          applianceTypeKey: 'led',
          tick: '3_tick',
          energyInfo: { name: 'LED', category: 'lights', ticks: { '3_tick': { kwhYear: 365 } } },
        },
        { category: 'build', name: 'Door' },
      ],
    },
  ]
  api.get.mockImplementation(async (url) => ({
    data: JSON.parse(JSON.stringify(url.endsWith('/rooms') ? { rooms } : data)),
  }))
  api.post.mockImplementation(async (url, body) => {
    const result = { ...body, id: 'new' }
    data.plans.push(result)
    return { data: result }
  })
  api.put.mockImplementation(async (url, body) => ({ data: { ...body, id: 'first' } }))
  api.delete.mockResolvedValue({ status: 204 })
})
async function render() {
  const w = mount(EnergyPlanner, { global: { stubs: { RouterLink: true } } })
  await flushPromises()
  return w
}
function button(w, text) {
  return w.findAll('button').find((b) => b.text().includes(text))
}
it('automatically displays one household with no tabs or household creation', async () => {
  const w = await render()
  expect(w.find('#household-summary-title').text()).toBe('Family home')
  expect(w.find('#household').exists()).toBe(false)
  expect(w.find('#days').exists()).toBe(false)
  expect(w.text()).not.toContain('Create new household')
  expect(button(w, 'New plan')).toBeUndefined()
  expect(api.get).toHaveBeenCalledWith('/api/planner/households/home/rooms')
  expect(w.findAll('[id^=plan-usage-]')).toHaveLength(1)
  w.unmount()
})
it('saves room ratings and adjusted consumption with no brand catalogue', async () => {
  const w = await render()
  await w.find('#plan-usage-0').setValue(50)
  await button(w, 'Save plan').trigger('click')
  await flushPromises()
  expect(api.post).toHaveBeenCalledWith(
    '/api/plans',
    expect.objectContaining({
      householdId: 'home',
      days: 30,
      estimate: expect.objectContaining({ kwh: 15, cost: 4.8 }),
    }),
  )
  expect(window.alert).toHaveBeenCalledWith('Your plan has been saved.')
  expect(w.find('#plan-name').exists()).toBe(true)
  w.unmount()
})
it('blocks missing room energy and handles failed room requests', async () => {
  delete rooms[0].placements[0].tick
  api.get.mockImplementationOnce(async () => ({ data }))
  api.get.mockRejectedValueOnce(new Error('offline'))
  const w = await render()
  expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('Unable to load'))
  await button(w, 'Retry layout').trigger('click')
  await flushPromises()
  await button(w, 'Save plan').trigger('click')
  expect(window.alert).toHaveBeenCalledWith(
    expect.stringContaining('Energy information is missing'),
  )
  expect(api.post).not.toHaveBeenCalled()
  w.unmount()
})
it('creates new plans from saved details, rejects duplicate names and deletes after confirmation', async () => {
  data.plans = [saved()]
  const w = await render()
  await w.find('#plan-name').setValue(' FIRST ')
  await button(w, 'Save plan').trigger('click')
  expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('already exists'))
  await w.find('[aria-label="View first"]').trigger('click')
  await button(w, 'Save plan').trigger('click')
  expect(api.post).not.toHaveBeenCalled()
  await w.find('#plan-name').setValue('Different plan')
  await button(w, 'Save plan').trigger('click')
  await flushPromises()
  expect(api.post).toHaveBeenCalledWith(
    '/api/plans',
    expect.objectContaining({ name: 'Different plan' }),
  )
  expect(api.put).not.toHaveBeenCalled()
  expect(data.plans[0].name).toBe('first')
  await button(w, 'Save plan').trigger('click')
  expect(api.post).toHaveBeenCalledTimes(1)
  await button(w, 'Delete').trigger('click')
  await flushPromises()
  expect(api.delete).toHaveBeenCalledWith('/api/plans/first')
  w.unmount()
})
it('shows only own household plans, 30px bars and cumulative forecasts', async () => {
  data.plans = [saved(), saved('second'), saved('foreign', 'other')]
  const w = await render()
  expect(w.findAll('canvas')).toHaveLength(4)
  let configs = charts.configs.slice(-4)
  expect(configs[0].data.labels).toEqual(['first', 'second'])
  expect(configs[0].data.datasets[0].barThickness).toBe(30)
  const now = new Date()
  let days = 0
  for (let i = 0; i < 12; i++) {
    days += new Date(now.getFullYear(), now.getMonth() + i + 1, 0).getDate()
    expect(configs[2].data.datasets[0].data[i]).toBe(days)
    expect(configs[3].data.datasets[0].data[i]).toBeCloseTo(days * 0.32)
  }
  await w.find('#compare-first').setValue(true)
  expect(charts.configs.slice(-4)[0].data.labels).toEqual(['first'])
  w.unmount()
  expect(charts.destroy).toHaveBeenCalled()
})
it('shows an empty-account message without crashing', async () => {
  data.users = []
  const w = await render()
  expect(w.text()).toContain('No household is linked')
  expect(button(w, 'Add plan')).toBeUndefined()
  w.unmount()
})

it('automatically previews the layout and selects product-specific energy and price', async () => {
  rooms[0].origin = { x: 0, z: 0 }
  rooms[0].dimension = { w: 4, d: 3, h: 2.6 }
  Object.assign(rooms[0].placements[0], {
    category: 'lighting',
    brand: 'Brand B',
    model: 'B1',
    x: 1,
    z: 2,
  })
  rooms[0].placements[0].energyInfo.products = [
    { brand: 'Brand A', model: 'A1', priceSgd: 100, kwhYear: 730 },
    { brand: 'Brand B', model: 'B1', priceSgd: 50, kwhYear: 365 },
  ]
  const w = await render()
  expect(button(w, 'Add plan')).toBeUndefined()
  expect(w.find('.planner-layout-preview').exists()).toBe(true)
  expect(w.find('#plan-product-0').element.value).toBe('1')
  expect(w.find('.planner-energy-stat').text()).toContain('365.0')
  expect(w.find('.planner-price-stat').text()).toContain('S$50.00')
  await w.find('#plan-product-0').setValue(0)
  expect(w.find('.planner-energy-stat').text()).toContain('730.0')
  expect(w.find('.planner-price-stat').text()).toContain('S$100.00')
  expect(w.find('.planner-monthly-result').text()).toContain('60.0 kWh/month')
  await button(w, 'Save plan').trigger('click')
  await flushPromises()
  expect(data.plans[0].items[0]).toMatchObject({
    brand: 'Brand A',
    model: 'A1',
    price: 100,
    annualKwh: 730,
  })
  rooms[0].placements[0].x = 3
  await w.find('[aria-label="View Everyday plan"]').trigger('click')
  expect(w.find('.layout-marker').attributes('cx')).toBe('1')
  expect(w.find('#plan-product-0').element.value).toBe('0')
  w.unmount()
})
it('shows basic model energy and average price without brand fields or missing-energy warning', async () => {
  rooms[0].placements[0].energyInfo = {
    name: 'Basic lamp',
    category: 'lighting',
    kwhYear: 100,
    averagePrice: 25,
  }
  const w = await render()
  expect(w.find('#plan-product-0').exists()).toBe(false)
  expect(w.find('#plan-brand-0').exists()).toBe(false)
  expect(w.text()).toContain('Basic model · Basic lamp')
  expect(w.find('.planner-energy-stat').text()).toContain('100.0')
  expect(w.find('.planner-price-stat').text()).toContain('Price of item')
  expect(w.find('.planner-price-stat').text()).toContain('S$25.00')
  expect(w.text()).not.toContain('Energy information is missing')
  w.unmount()
})
it('includes all current electrical categories on initial load', async () => {
  rooms[0].placements = [
    'cooling',
    'entertainment',
    'lighting',
    'bathroom',
    'laundry',
    'kitchen',
  ].map((category, index) => ({ _id: String(index), category, name: category, kwhYear: 365 }))
  const w = await render()
  expect(w.findAll('.planner-appliance-card')).toHaveLength(6)
  expect(w.find('.planner-price-stat').text()).toContain('Not available')
  w.unmount()
})

it('adjusts database product energy for placement without compounding on product changes', async () => {
  rooms[0].dimension = { w: 4, d: 4 }
  rooms[0].placements = [
    {
      _id: 'fridge',
      applianceTypeKey: 'refrigerator_no_freezer',
      category: 'kitchen',
      x: 0.29,
      z: 2,
      rotY: 0,
      wall: -1,
      t: 0,
      energyInfo: {
        name: 'Fridge',
        kwhYear: 100,
        products: [
          { brand: 'A', model: 'A1', priceSgd: 200, kwhYear: 365 },
          { brand: 'B', model: 'B1', priceSgd: 300, kwhYear: 730 },
        ],
      },
    },
  ]
  const w = await render()
  // No rear clearance adds 10% using the map's placement rules.
  expect(w.find('.planner-energy-stat').text()).toContain('401.5')
  await w.find('#plan-product-0').setValue(1)
  expect(w.find('.planner-energy-stat').text()).toContain('803.0')
  await w.find('#plan-product-0').setValue(0)
  expect(w.find('.planner-energy-stat').text()).toContain('401.5')
  await button(w, 'Save plan').trigger('click')
  await flushPromises()
  expect(data.plans[0].items[0].annualKwh).toBeCloseTo(401.5)
  expect(data.plans[0].items[0].placementMultiplier).toBeCloseTo(1.1)
  expect(data.plans[0].estimate.kwh).toBeCloseTo(33)
  expect(data.plans[0].items[0].price).toBe(200)
  w.unmount()
})
