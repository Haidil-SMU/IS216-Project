
import { mount } from '@vue/test-utils'
import { describe, it, expect } from 'vitest'
import SimulatorCost from '../components/SimulatorCost.vue'

describe('SimulatorCost', () => {

  it('displays the correct electricity cost', () => {

    const wrapper = mount(SimulatorCost, {
      props: {
        cost: 3.456,
        electricityRate: 0.32
      }
    })

    expect(wrapper.text()).toContain('S$3.46')
    expect(wrapper.text()).toContain('S$0.32/kWh')

  })

})
