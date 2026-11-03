import { describe, it, expect } from 'vitest'
import { itemEnergy } from '../src/components/EnergyPlanner.vue'

describe('TestSuite: itemEnergy', () => {
  it('Test1: converts annual energy to a 30-day estimate', () => {
    const item = { annualKwh: 365, quantity: 1, usagePercent: 100 }
    const result = itemEnergy(item, 30)
    expect(result).toBe(30)
  })

  it('Test2: accounts for quantity and usage percentage', () => {
    const item = { annualKwh: 730, quantity: 2, usagePercent: 50 }
    const result = itemEnergy(item, 30)
    expect(result).toBe(60)
  })

  it('Test3: returns zero for zero usage', () => {
    const item = { annualKwh: 730, quantity: 1, usagePercent: 0 }
    expect(itemEnergy(item, 30)).toBe(0)
  })

  it('Test4: returns zero when annual energy is missing', () => {
    const item = { quantity: 1, usagePercent: 100 }
    expect(itemEnergy(item, 30)).toBe(0)
  })

  it('Test5: returns zero for zero quantity', () => {
    const item = { annualKwh: 365, quantity: 0, usagePercent: 100 }
    expect(itemEnergy(item, 30)).toBe(0)
  })

  it('Test6: keeps decimal values in the calculation', () => {
    const item = { annualKwh: 66, quantity: 1, usagePercent: 75 }
    expect(itemEnergy(item, 30)).toBeCloseTo(4.0684931507, 8)
  })
})
