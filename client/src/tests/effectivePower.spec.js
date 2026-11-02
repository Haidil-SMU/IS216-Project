import {describe, it, expect} from 'vitest'
import {effectivePower} from './effectivePower'

describe('Total Effective Power Test: Test Cases', () => {

    it('Test 1: Appliance has no power', () => {
        const appliance = {
            basePowerKw: null
        }
    expect(effectivePower(appliance)).toBe(0)
    })

    it('Test 2: Air Conditioner at 27°C', () => {
        const item = {
            basePowerKw: 1,
            controlType: 'aircon',
            setting: {
                mode: 'Cool',
                temperature: 27,
                speed: 'Medium'
            }
        }

        expect(effectivePower(item)).toBeCloseTo(0.84)
    })

    it('Test 3: Fan at Speed 1', () => {
        const item = {
            basePowerKw: 0.1,
            controlType: 'fan',
            setting: {
                speed: '1'
            }
        }

        expect(effectivePower(item)).toBeCloseTo(0.055)
    })

    it('Test 4: Light at 50% Brightness', () => {
        const item = {
            basePowerKw: 0.02,
            controlType: 'light',
            setting: {
                brightness: 50
            }
        }

        expect(effectivePower(item)).toBeCloseTo(0.01)
    })

    it('Test 5: Television in Eco Mode', () => {
        const item = {
            basePowerKw: 0.2,
            controlType: 'tv',
            setting: {
                picture: 'Eco'
            }
        }

        expect(effectivePower(item)).toBeCloseTo(0.15)
    })

    it('Test 6: Washing Machine in Eco Mode', () => {
        const item = {
            basePowerKw: 1,
            controlType: 'washer',
            setting: {
                mode: 'Eco',
                water: 'Cold'
            }
        }

        expect(effectivePower(item)).toBeCloseTo(0.7)
    })
}

)