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
  api.get.mockImplementation(async (url) => ({ data: url.endsWith('/rooms') ? { rooms } : data }))
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
async function start(w) {
  await button(w, 'Add plan').trigger('click')
  await flushPromises()
}
it('automatically displays one household with no tabs or household creation', async () => {
  const w = await render()
  expect(w.find('#household-summary-title').text()).toBe('Family home')
  expect(w.find('#household').exists()).toBe(false)
  expect(w.text()).not.toContain('Create new household')
  await start(w)
  expect(api.get).toHaveBeenCalledWith('/api/planner/households/home/rooms')
  expect(w.findAll('[id^=plan-usage-]')).toHaveLength(1)
  w.unmount()
})
it('saves room ratings and adjusted consumption with no brand catalogue', async () => {
  const w = await render()
  await start(w)
  await w.find('#plan-usage-0').setValue(50)
  await button(w, 'Save plan').trigger('click')
  await flushPromises()
  expect(api.post).toHaveBeenCalledWith(
    '/api/plans',
    expect.objectContaining({
      householdId: 'home',
      estimate: expect.objectContaining({ kwh: 15, cost: 4.8 }),
    }),
  )
  expect(window.alert).toHaveBeenCalledWith('Your plan has been saved.')
  expect(w.find('#plan-name').exists()).toBe(false)
  w.unmount()
})
it('blocks missing room energy and handles failed room requests', async () => {
  const w = await render()
  api.get.mockRejectedValueOnce(new Error('offline'))
  await start(w)
  expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('Unable to load'))
  delete rooms[0].placements[0].tick
  await start(w)
  await button(w, 'Save plan').trigger('click')
  expect(window.alert).toHaveBeenCalledWith(
    expect.stringContaining('Energy information is missing'),
  )
  expect(api.post).not.toHaveBeenCalled()
  w.unmount()
})
it('updates saved plans, rejects duplicate names and deletes after confirmation', async () => {
  data.plans = [saved()]
  const w = await render()
  await start(w)
  await w.find('#plan-name').setValue(' FIRST ')
  await button(w, 'Save plan').trigger('click')
  expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('already exists'))
  await w.find('[aria-label="View first"]').trigger('click')
  await button(w, 'Update plan').trigger('click')
  await flushPromises()
  expect(api.put).toHaveBeenCalledWith(
    '/api/plans/first',
    expect.objectContaining({ name: 'first' }),
  )
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
