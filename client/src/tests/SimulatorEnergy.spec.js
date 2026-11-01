
import { mount } from '@vue/test-utils'
import { describe, it, expect } from 'vitest'
import SimulatorEnergy from '../components/SimulatorEnergy.vue'

describe('SimulatorEnergy', () => {

  it('displays the correct energy consumption', () => {

    const wrapper = mount(SimulatorEnergy, {
      props: {
        energy: 5.6789,
        currentPower: 1.23456
      }
    })

    expect(wrapper.text()).toContain('5.679')
    expect(wrapper.text()).toContain('1.235 kW')

  })

})
