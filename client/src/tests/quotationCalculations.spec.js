import { describe, it, expect } from 'vitest'
import {
  getItemAmount,
  getDraftTotal,
  hasMissingPrices
} from '../utils/quotationCalculations.js'

describe('Quotation item amount', () => {
  it('multiplies quantity by unit price', () => {
    expect(getItemAmount({
      quantity: 3,
      unitPrice: 12.50
    })).toBe(37.50)
  })

  it('rounds the amount to two decimal places', () => {
    expect(getItemAmount({
      quantity: 3,
      unitPrice: 0.335
    })).toBe(1.01)
  })

  it('accepts numeric strings from form inputs', () => {
    expect(getItemAmount({
      quantity: '2',
      unitPrice: '15.50'
    })).toBe(31)
  })

  it('allows a zero-priced item', () => {
    expect(getItemAmount({
      quantity: 2,
      unitPrice: 0
    })).toBe(0)
  })

  it.each([
    ['blank price', { quantity: 2, unitPrice: '' }],
    ['null price', { quantity: 2, unitPrice: null }],
    ['missing price', { quantity: 2 }],
    ['negative price', { quantity: 2, unitPrice: -5 }],
    ['non-numeric price', { quantity: 2, unitPrice: 'abc' }],
    ['infinite price', { quantity: 2, unitPrice: Infinity }],
    ['blank quantity', { quantity: '', unitPrice: 10 }],
    ['missing quantity', { unitPrice: 10 }],
    ['zero quantity', { quantity: 0, unitPrice: 10 }],
    ['negative quantity', { quantity: -1, unitPrice: 10 }],
    ['non-numeric quantity', { quantity: 'abc', unitPrice: 10 }],
    ['infinite quantity', { quantity: Infinity, unitPrice: 10 }]
  ])('rejects %s', (_description, item) => {
    expect(getItemAmount(item)).toBeNull()
  })

  it('rejects a calculation that overflows', () => {
    expect(getItemAmount({
      quantity: Number.MAX_VALUE,
      unitPrice: 2
    })).toBeNull()
  })
})

describe('Quotation draft total', () => {
  it('adds the amounts of all quotation items', () => {
    const request = {
      aiDraft: {
        items: [
          { quantity: 2, unitPrice: 100 },
          { quantity: 3, unitPrice: 25.50 }
        ]
      }
    }

    expect(getDraftTotal(request)).toBe(276.50)
  })

  it('avoids a floating-point remainder in the total', () => {
    const request = {
      aiDraft: {
        items: [
          { quantity: 1, unitPrice: 0.10 },
          { quantity: 1, unitPrice: 0.20 }
        ]
      }
    }

    expect(getDraftTotal(request)).toBe(0.30)
  })

  it('returns zero when there is no draft', () => {
    expect(getDraftTotal({ aiDraft: null })).toBe(0)
  })

  it('returns zero for an empty draft', () => {
    expect(getDraftTotal({
      aiDraft: { items: [] }
    })).toBe(0)
  })

  it('totals valid items while flagging an unpriced item', () => {
    const request = {
      aiDraft: {
        items: [
          { quantity: 2, unitPrice: 100 },
          { quantity: 1, unitPrice: null }
        ]
      }
    }

    expect(getDraftTotal(request)).toBe(200)
    expect(hasMissingPrices(request)).toBe(true)
  })
})

describe('Quotation price completeness', () => {
  it('flags a draft that does not exist', () => {
    expect(hasMissingPrices({ aiDraft: null })).toBe(true)
  })

  it('flags a missing item price', () => {
    const request = {
      aiDraft: {
        items: [
          { quantity: 1, unitPrice: 100 },
          { quantity: 1, unitPrice: '' }
        ]
      }
    }

    expect(hasMissingPrices(request)).toBe(true)
  })

  it('flags an invalid item quantity', () => {
    const request = {
      aiDraft: {
        items: [
          { quantity: 0, unitPrice: 100 }
        ]
      }
    }

    expect(hasMissingPrices(request)).toBe(true)
  })

  it('accepts a draft whose items all have valid prices', () => {
    const request = {
      aiDraft: {
        items: [
          { quantity: 2, unitPrice: 100 },
          { quantity: 1, unitPrice: 0 }
        ]
      }
    }

    expect(hasMissingPrices(request)).toBe(false)
  })
})