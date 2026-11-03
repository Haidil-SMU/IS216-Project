
import { mount } from '@vue/test-utils'
import { describe, it, expect } from 'vitest'
import SimulatorEnergy from '../components/SimulatorEnergy.vue'

describe('SimulatorEnergy', () => {

    // Test 1: Correct energy consumption
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

    // Test 2: No energy consumption
    it('displays zero when no energy is consumed', () => {
        const wrapper = mount(SimulatorEnergy, {
            props: {
                energy: 0,
                currentPower: 0
            }
        })

        expect(wrapper.text()).toContain('0.000')
        expect(wrapper.text()).toContain('0.000 kW')
    })

    // Test 3: Energy consumption is rounded correctly
    it('rounds energy consumption to 3 decimal places', () => {
        const wrapper = mount(SimulatorEnergy, {
            props: {
                energy: 2.123456,
                currentPower: 0.5
            }
        })

        expect(wrapper.text()).toContain('2.123')
    })

    // Test 4: Current power is displayed correctly
    it('displays the current appliance power', () => {
        const wrapper = mount(SimulatorEnergy, {
            props: {
                energy: 8,
                currentPower: 2.5
            }
        })

        expect(wrapper.text()).toContain('2.500 kW')
    })

    // Test 5: Display updates when energy changes
    it('updates the display when energy changes', async () => {
        const wrapper = mount(SimulatorEnergy, {
            props: {
                energy: 1,
                currentPower: 0.5
            }
        })

        expect(wrapper.text()).toContain('1.000')

        await wrapper.setProps({
            energy: 3
        })

        expect(wrapper.text()).toContain('3.000')
    })

})
