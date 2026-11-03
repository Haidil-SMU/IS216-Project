// catalog.js
// The list of things a user can put into the 3D room
// (appliances, furniture, doors, windows, counters).
// The list is loaded ONCE from the server and then shared by every component.

import { reactive } from 'vue'
import axios from 'axios'

// Shared data. Components read it with: catalogue.categories
// Shape:  categories = { kitchen: { name: 'Kitchen', types: { fridge: {...}, ... } }, ... }
export const catalogue = reactive({ categories: {} })

// The categories we show, in this order. (key = id used by the server, value = label on screen)
const CATEGORY_NAMES = {
  build: 'Build',
  kitchen: 'Kitchen',
  cooling: 'Cooling & Air',
  entertainment: 'TV & Computing',
  laundry: 'Laundry',
  lighting: 'Lighting',
  bathroom: 'Bathroom',
}

// ============================================================
// LOAD THE CATALOGUE FROM THE SERVER
// ============================================================

export async function loadCatalogue() {
  const response = await axios.get('/api/spatial/catalogue')
  const items = response.data

  // 1. Start with an empty box for every category
  const categories = {}
  for (const name in CATEGORY_NAMES) {
    categories[name] = { name: CATEGORY_NAMES[name], types: {} }
  }

  // 2. Put each item from the server into its category
  for (const item of items) {
    if (item.category === 'build' && !item.group) {
      item.group = 'Doors, windows & counters'
    }
    if (categories[item.category]) {
      categories[item.category].types[item.typeKey] = item
    }
  }

  // 3. Keep only the categories that really have items
  const filledCategories = {}
  for (const name in categories) {
    if (Object.keys(categories[name].types).length > 0) {
      filledCategories[name] = categories[name]
    }
  }

  catalogue.categories = filledCategories
}

// ============================================================
// LOOK THINGS UP
// ============================================================

// Find one type, e.g. typeOf('kitchen', 'fridge'). Gives undefined if it does not exist.
export function typeOf(category, typeKey) {
  const categoryData = catalogue.categories[category]
  if (!categoryData) {
    return undefined
  }
  return categoryData.types[typeKey]
}

// A shorter name to fit in small cards, e.g. "Fridge (2-door, 300L)" becomes "Fridge".
// Anything longer than "max" letters is cut at a space and ends with "…".
export function shortNameOf(type, max = 36) {
  let name = ''
  if (type) {
    name = type.shortName || type.name || ''
  }

  // cut the name at the first "(", "," or dash
  const cutWords = ['(', ',', ' - ', ' \u2013 ', ' \u2014 ']
  let end = name.length
  for (const word of cutWords) {
    const position = name.indexOf(word)
    if (position !== -1 && position < end) {
      end = position
    }
  }
  const base = name.slice(0, end).trim()

  if (base.length <= max) {
    return base
  }

  // still too long: cut at the last space before "max"
  let cut = base.slice(0, max)
  const lastSpace = cut.lastIndexOf(' ')
  if (lastSpace > 12) {
    cut = cut.slice(0, lastSpace)
  }
  return cut.trim() + '\u2026'
}

// Find one product (a brand + model) of a type.
export function productOf(category, typeKey, brand, model) {
  const type = typeOf(category, typeKey)
  if (!type || !type.products) {
    return undefined
  }
  return type.products.find(function (product) {
    return product.brand === brand && product.model === model
  })
}

// Energy use (kWh per year) of something placed in the room.
// Use the chosen product's figure first, then the type's figure, otherwise 0.
export function kwhOfPlacement(placement) {
  const product = productOf(placement.category, placement.applianceTypeKey, placement.brand, placement.model)
  if (product && product.kwhYear !== undefined && product.kwhYear !== null) {
    return product.kwhYear
  }

  const type = typeOf(placement.category, placement.applianceTypeKey)
  if (type && type.kwhYear !== undefined && type.kwhYear !== null) {
    return type.kwhYear
  }

  return 0
}

// ============================================================
// KEYS THAT DESCRIBE WHAT KIND OF THING SOMETHING IS
// ============================================================
// A Set is like an array, but "set.has(x)" quickly tells us if x is inside it.

export const OPENING_KEYS = new Set(['single_glazed_window', 'double_glazed_window', 'timber_flush_door', 'glass_sliding_door'])
export const WINDOW_KEYS = new Set(['single_glazed_window', 'double_glazed_window'])
export const DOOR_KEYS = new Set(['timber_flush_door', 'glass_sliding_door'])
const COUNTERTOP_KEYS = new Set(['quartz_countertop', 'plain_countertop'])

export const FURNITURE_KEYS = new Set([
  'sofa_3_seater', 'sofa_2_seater', 'armchair', 'coffee_table', 'tv_console',
  'dining_table', 'dining_chair', 'bed_single', 'bed_queen',
  'bedside_table', 'wardrobe', 'bookshelf', 'study_desk', 'office_chair',
])

// "Build" items are the room itself: doors, windows and counters.
export function isBuild(category) {
  return category === 'build'
}

export function isOpening(placement) {
  return isBuild(placement.category) && OPENING_KEYS.has(placement.applianceTypeKey)
}

export function isCountertop(placement) {
  return isBuild(placement.category) && COUNTERTOP_KEYS.has(placement.applianceTypeKey)
}

// ============================================================
// MAKE THE DATA WE SEND TO THE SERVER WHEN SOMETHING IS PLACED
// ============================================================

// "catalogItem" says WHAT is placed, "spot" says WHERE it is placed.
export function newPlacementDoc(catalogItem, spot) {
  const doc = {
    applianceTypeKey: catalogItem.applianceTypeKey,
    category: catalogItem.category,
  }

  // appliances remember their brand and model (doors, windows and counters do not)
  if (!isBuild(catalogItem.category) && catalogItem.brand && catalogItem.model) {
    doc.brand = catalogItem.brand
    doc.model = catalogItem.model
  }

  doc.x = spot.x
  doc.z = spot.z
  doc.rotY = spot.rotY
  doc.wall = spot.wall
  doc.t = spot.t

  // "cu" and "on" are optional, so give them a default value
  doc.cu = 0
  if (spot.cu !== undefined && spot.cu !== null) {
    doc.cu = spot.cu
  }

  doc.onPlacementId = null
  if (spot.on !== undefined && spot.on !== null) {
    doc.onPlacementId = spot.on
  }

  return doc
}
