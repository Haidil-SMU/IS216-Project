import { reactive } from 'vue'
import axios from 'axios'

export const catalogue = reactive({ categories: {} })

const CATEGORY_NAMES = {
  build: 'Build', kitchen: 'Kitchen', cooling: 'Cooling & Air', entertainment: 'TV & Computing',
  laundry: 'Laundry', lighting: 'Lighting', bathroom: 'Bathroom',
}

export async function loadCatalogue() {
  const items = (await axios.get('/api/spatial/catalogue')).data
  const categories = {}
  for (const name of Object.keys(CATEGORY_NAMES)) categories[name] = { name: CATEGORY_NAMES[name], types: {} }
  for (const item of items) {
    if (item.category === 'build' && !item.group) item.group = 'Doors, windows & counters'
    if (categories[item.category]) categories[item.category].types[item.typeKey] = item
  }
  catalogue.categories = Object.fromEntries(Object.entries(categories).filter(([, c]) => Object.keys(c.types).length))
}

export const typeOf = (category, typeKey) => catalogue.categories[category]?.types?.[typeKey]


export function shortNameOf(type, max = 36) {
  const base = (type?.shortName || type?.name || '').split(/\s+[(\u2013\u2014-]\s*|\s*\(|,/)[0].trim()
  if (base.length <= max) return base
  const cut = base.slice(0, max), space = cut.lastIndexOf(' ')
  return (space > 12 ? cut.slice(0, space) : cut).trimEnd() + '\u2026'
}

export const productOf = (category, typeKey, brand, model) =>
  typeOf(category, typeKey)?.products?.find((p) => p.brand === brand && p.model === model)

export function kwhOfPlacement(p) {
  return productOf(p.category, p.applianceTypeKey, p.brand, p.model)?.kwhYear ?? typeOf(p.category, p.applianceTypeKey)?.kwhYear ?? 0
}

export const OPENING_KEYS = new Set(['single_glazed_window', 'double_glazed_window', 'timber_flush_door', 'glass_sliding_door'])
export const WINDOW_KEYS = new Set(['single_glazed_window', 'double_glazed_window'])
export const DOOR_KEYS = new Set(['timber_flush_door', 'glass_sliding_door'])
const COUNTERTOP_KEYS = new Set(['quartz_countertop', 'plain_countertop'])
export const FURNITURE_KEYS = new Set([
  'sofa_3_seater', 'sofa_2_seater', 'armchair', 'coffee_table', 'tv_console',
  'dining_table', 'dining_chair', 'bed_single', 'bed_queen',
  'bedside_table', 'wardrobe', 'bookshelf', 'study_desk', 'office_chair',
])

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
