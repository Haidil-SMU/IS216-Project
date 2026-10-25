import { reactive } from 'vue'
import { getCatalogue } from '../api/spatial.js'

export const catalogue = reactive({ categories: {} })

const CATEGORY_NAMES = {
  build: 'Doors & Windows', kitchen: 'Kitchen', cooling: 'Cooling & Air', entertainment: 'TV & Computing',
  laundry: 'Laundry', lighting: 'Lighting', bathroom: 'Bathroom',
}

export const tariff = 0.27

export async function loadCatalogue() {
  const items = await getCatalogue()
  const categories = {}
  for (const name of Object.keys(CATEGORY_NAMES)) categories[name] = { name: CATEGORY_NAMES[name], types: {} }
  for (const item of items) {
    if (categories[item.category]) categories[item.category].types[item.typeKey] = item
  }
  catalogue.categories = Object.fromEntries(Object.entries(categories).filter(([, c]) => Object.keys(c.types).length))
}

export const typeOf = (category, typeKey) => catalogue.categories[category]?.types?.[typeKey]

export const productOf = (category, typeKey, brand, model) =>
  typeOf(category, typeKey)?.products?.find((p) => p.brand === brand && p.model === model)

export function kwhOfPlacement(p) {
  return productOf(p.category, p.applianceTypeKey, p.brand, p.model)?.kwhYear ?? typeOf(p.category, p.applianceTypeKey)?.kwhYear ?? 0
}

export const OPENING_KEYS = new Set(['single_glazed_window', 'double_glazed_window', 'timber_flush_door', 'glass_sliding_door'])
export const WINDOW_KEYS = new Set(['single_glazed_window', 'double_glazed_window'])
export const DOOR_KEYS = new Set(['timber_flush_door', 'glass_sliding_door'])
export const COUNTERTOP_KEYS = new Set(['quartz_countertop', 'plain_countertop'])

export const isBuild = (category) => category === 'build'
export const isOpening = (p) => isBuild(p.category) && OPENING_KEYS.has(p.applianceTypeKey)
export const isCountertop = (p) => isBuild(p.category) && COUNTERTOP_KEYS.has(p.applianceTypeKey)

export function newPlacementDoc(catalogItem, spot) {
  const { applianceTypeKey, category, brand, model } = catalogItem
  return {
    applianceTypeKey,
    category,
    ...(!isBuild(category) && brand && model ? { brand, model } : {}),
    x: spot.x, z: spot.z, rotY: spot.rotY,
    wall: spot.wall, t: spot.t, cu: spot.cu ?? 0,
    onPlacementId: spot.on ?? null,
  }
}
