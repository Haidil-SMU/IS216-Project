import { describe, it, expect, beforeEach } from 'vitest'
import { catalogue, kwhOfPlacement, isOpening, isCountertop, newPlacementDoc } from '../catalog'

// A small catalogue in the same shape the server sends: categories -> types -> products.
beforeEach(() => {
  catalogue.categories = {
    kitchen: {
      name: 'Kitchen',
      types: {
        fridge: {
          name: 'Fridge',
          kwhYear: 400,
          products: [
            { brand: 'Samsung', model: 'S1', kwhYear: 300 },
            { brand: 'LG', model: 'L1', kwhYear: 250 },
            { brand: 'Solar', model: 'Z0', kwhYear: 0 },
          ],
        },
      },
    },
  }
})

describe('kwhOfPlacement', () => {
  it('uses the energy figure of the brand and model that was chosen', () => {
    const placement = { category: 'kitchen', applianceTypeKey: 'fridge', brand: 'LG', model: 'L1' }

    expect(kwhOfPlacement(placement)).toBe(250)
  })

  it('falls back to the type figure when the brand and model are not in the catalogue', () => {
    const placement = { category: 'kitchen', applianceTypeKey: 'fridge', brand: 'Old', model: 'X' }

    expect(kwhOfPlacement(placement)).toBe(400)
  })

  it('counts a product that really uses 0 kWh as 0, not as the type figure', () => {
    const placement = { category: 'kitchen', applianceTypeKey: 'fridge', brand: 'Solar', model: 'Z0' }

    expect(kwhOfPlacement(placement)).toBe(0)
  })

  it('gives 0 for a type that is not in the catalogue', () => {
    expect(kwhOfPlacement({ category: 'kitchen', applianceTypeKey: 'ghost' })).toBe(0)
    expect(kwhOfPlacement({ category: 'nowhere', applianceTypeKey: 'fridge' })).toBe(0)
  })
})

describe('isOpening and isCountertop', () => {
  it('treats build doors and windows as openings, but not counters', () => {
    expect(isOpening({ category: 'build', applianceTypeKey: 'timber_flush_door' })).toBe(true)
    expect(isOpening({ category: 'build', applianceTypeKey: 'double_glazed_window' })).toBe(true)
    expect(isOpening({ category: 'build', applianceTypeKey: 'quartz_countertop' })).toBe(false)
  })

  it('only counts the build category, so an appliance with a door-like key is not an opening', () => {
    expect(isOpening({ category: 'kitchen', applianceTypeKey: 'timber_flush_door' })).toBe(false)
  })

  it('recognises both countertop types in the build category only', () => {
    expect(isCountertop({ category: 'build', applianceTypeKey: 'quartz_countertop' })).toBe(true)
    expect(isCountertop({ category: 'build', applianceTypeKey: 'plain_countertop' })).toBe(true)
    expect(isCountertop({ category: 'kitchen', applianceTypeKey: 'quartz_countertop' })).toBe(false)
  })
})

describe('newPlacementDoc', () => {
  const spot = { x: 1.5, z: 2, rotY: 90, wall: 1, t: 0.4 }

  it('keeps the brand and model of an appliance and fills in the default optional fields', () => {
    const item = { applianceTypeKey: 'fridge', category: 'kitchen', brand: 'LG', model: 'L1' }

    expect(newPlacementDoc(item, spot)).toEqual({
      applianceTypeKey: 'fridge',
      category: 'kitchen',
      brand: 'LG',
      model: 'L1',
      x: 1.5,
      z: 2,
      rotY: 90,
      wall: 1,
      t: 0.4,
      cu: 0,
      onPlacementId: null,
    })
  })

  it('leaves out the brand and model for doors, windows and counters', () => {
    const item = { applianceTypeKey: 'timber_flush_door', category: 'build', brand: 'Any', model: 'Any' }
    const doc = newPlacementDoc(item, spot)

    expect(doc).not.toHaveProperty('brand')
    expect(doc).not.toHaveProperty('model')
  })

  it('copies the counter position (cu) and the item it sits on when the spot has them', () => {
    const item = { applianceTypeKey: 'fridge', category: 'kitchen' }
    const doc = newPlacementDoc(item, { ...spot, cu: 0.6, on: 'abc123' })

    expect(doc.cu).toBe(0.6)
    expect(doc.onPlacementId).toBe('abc123')
  })
})
