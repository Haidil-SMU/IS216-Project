import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import AppliancesList from '../AppliancesList.vue'
import { catalogue } from '@/stores/catalog'

// The 3D preview on each card needs WebGL, so it is replaced by an empty stub.
function mountList() {
  return mount(AppliancesList, { global: { stubs: { Appliance3D: true } } })
}

const cards = (wrapper) => wrapper.findAll('.item-card')
const tabButton = (wrapper, label) => wrapper.findAll('.cat-tab').find((tab) => tab.text() === label)

describe('AppliancesList catalogue', () => {
  beforeEach(() => {
    catalogue.categories = {
      kitchen: {
        name: 'Kitchen',
        types: {
          fridge: {
            name: 'Fridge',
            products: [
              { brand: 'Samsung', model: 'S1', kwhYear: 300, priceSgd: 899, ticks: 3 },
              { brand: 'LG', model: 'L1', kwhYear: 250, priceSgd: 749, ticks: 4 },
            ],
          },
          kettle: { name: 'Kettle', products: [{ brand: 'Philips', model: 'K1', kwhYear: 120, priceSgd: 59, ticks: 1 }] },
        },
      },
      build: {
        name: 'Build',
        types: { timber_flush_door: { name: 'Timber door', group: 'Doors, windows & counters' } },
      },
    }
  })

  it('shows one tab per category and the cards of the first tab', () => {
    const wrapper = mountList()

    expect(wrapper.findAll('.cat-tab').map((tab) => tab.text())).toEqual(['Kitchen', 'Build'])
    expect(cards(wrapper).map((card) => card.find('.face-name').text())).toEqual(['Fridge', 'Kettle'])
  })

  it('switches to the clicked tab and tells the parent which category was chosen', async () => {
    const wrapper = mountList()

    await tabButton(wrapper, 'Build').trigger('click')

    expect(cards(wrapper).map((card) => card.find('.face-name').text())).toEqual(['Timber door'])
    expect(tabButton(wrapper, 'Build').attributes('aria-pressed')).toBe('true')
    expect(wrapper.emitted('tab-changed')[0][0]).toEqual({ tabId: 'build', applianceName: 'Build' })
  })

  it('shows the energy and price of the first brand, then of the brand the user picks', async () => {
    const wrapper = mountList()
    const fridge = cards(wrapper)[0]

    expect(fridge.find('.kwh').text()).toBe('300 kWh/yr')
    expect(fridge.find('.price').text()).toBe('S$899')

    await fridge.find('select').setValue('LG')

    expect(fridge.find('.kwh').text()).toBe('250 kWh/yr')
    expect(fridge.find('.price').text()).toBe('S$749')
  })

  it('sends the chosen brand, model and yearly energy when "+ Add" is pressed', async () => {
    const wrapper = mountList()
    const fridge = cards(wrapper)[0]

    await fridge.find('select').setValue('LG')
    await fridge.find('.add-btn').trigger('click')

    expect(wrapper.emitted('add-appliance')[0][0]).toEqual({
      applianceTypeKey: 'fridge',
      category: 'kitchen',
      name: 'Fridge',
      brand: 'LG',
      model: 'L1',
      kwhYear: 250,
    })
  })

  it('adds a door without a brand or energy figure', async () => {
    const wrapper = mountList()

    await tabButton(wrapper, 'Build').trigger('click')
    await cards(wrapper)[0].find('.add-btn').trigger('click')

    expect(cards(wrapper)[0].find('select').exists()).toBe(false)
    expect(wrapper.emitted('add-appliance')[0][0]).toEqual({
      applianceTypeKey: 'timber_flush_door',
      category: 'build',
      name: 'Timber door',
      kwhYear: 0,
    })
  })
})
