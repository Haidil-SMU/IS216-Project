import { reactive } from 'vue'
import { getProducts } from '../api/products.js'
import { tariff } from './catalog.js'

// Products per applianceTypeKey, fetched once and cached. `state[typeKey]` is undefined until loaded,
// then an array (empty if the server has none or the request failed - the UI falls back to the
// catalogue's typical figure).
const state = reactive({})
const inflight = new Map()

export function loadProducts(typeKey) {
  if (state[typeKey] || inflight.has(typeKey)) return inflight.get(typeKey) ?? Promise.resolve(state[typeKey])
  const request = getProducts(typeKey)
    .then((rows) => { state[typeKey] = rows.filter((r) => Number.isFinite(r.kwhYear)) })
    .catch(() => { state[typeKey] = [] })
    .finally(() => inflight.delete(typeKey))
  inflight.set(typeKey, request)
  return request
}

export const productsFor = (typeKey) => state[typeKey] ?? []
export const productKey = (p) => `${p.brand}|${p.model}`

// Running cost of owning one: what it costs to buy plus YEARS of electricity.
export const YEARS = 5
export const annualCost = (p) => Math.round(p.kwhYear * tariff)
export const totalCost = (p, years = YEARS) => Math.round((p.priceSgd ?? 0) + p.kwhYear * tariff * years)
