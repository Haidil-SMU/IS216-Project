
import { mount } from '@vue/test-utils'
import { describe, it, expect } from 'vitest'
import SimulatorCost from '../components/SimulatorCost.vue'

describe('SimulatorCost', () => {

    // Test 1: Correct electricity cost
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

    // Test 2: Zero electricity cost
    it('displays zero when no electricity cost is incurred', () => {
        const wrapper = mount(SimulatorCost, {
            props: {
                cost: 0,
                electricityRate: 0.32
            }
        })

        expect(wrapper.text()).toContain('S$0.00')
    })

    // Test 3: Cost is rounded to 2 decimal places
    it('rounds electricity cost to 2 decimal places', () => {
        const wrapper = mount(SimulatorCost, {
            props: {
                cost: 5.678,
                electricityRate: 0.32
            }
        })

        expect(wrapper.text()).toContain('S$5.68')
    })

    // Test 4: Correct electricity rate
    it('displays the correct electricity rate', () => {
        const wrapper = mount(SimulatorCost, {
            props: {
                cost: 2,
                electricityRate: 0.45
            }
        })

        expect(wrapper.text()).toContain('S$0.45/kWh')
    })

    // Test 5: Display updates when cost changes
    it('updates the display when electricity cost changes', async () => {
        const wrapper = mount(SimulatorCost, {
            props: {
                cost: 1.5,
                electricityRate: 0.32
            }
        })

        expect(wrapper.text()).toContain('S$1.50')

        await wrapper.setProps({
            cost: 4.25
        })

        expect(wrapper.text()).toContain('S$4.25')
    })

})
