import catalogue from '../data/catalogue.json'

// The appliance catalogue (same file the server ships). Categories group appliances by what they do
// (kitchen, cooling & air, laundry...); each type also has a `group` (Refrigerators, Fans, Bulbs...).
export { catalogue }
export const tariff = catalogue.electricityTariff
export const typeOf = (category, typeKey) => catalogue.categories[category]?.types?.[typeKey]

// What kind of thing a placement is, decided from its explicit applianceTypeKey + category
// (the keys of data/catalogue.json). Doors, windows and countertops are "builds": part of the
// flat, not appliances, so they have no efficiency tick and use no electricity.
export const OPENING_KEYS = new Set(['single_glazed_window', 'double_glazed_window', 'timber_flush_door', 'glass_sliding_door'])
export const WINDOW_KEYS = new Set(['single_glazed_window', 'double_glazed_window'])
export const DOOR_KEYS = new Set(['timber_flush_door', 'glass_sliding_door'])
export const COUNTERTOP_KEYS = new Set(['quartz_countertop', 'plain_countertop'])

export const isBuild = (category) => category === 'build'
export const isOpening = (p) => isBuild(p.category) && OPENING_KEYS.has(p.applianceTypeKey)
export const isCountertop = (p) => isBuild(p.category) && COUNTERTOP_KEYS.has(p.applianceTypeKey)

// The document stored for a newly placed item. Every field is spelled out so it is clear what the
// item is; `tick` (the efficiency rating) is only sent for appliances that have one.
export function newPlacementDoc(catalogItem, spot) {
  const { applianceTypeKey, category, tick } = catalogItem
  return {
    applianceTypeKey,
    category,
    ...(!isBuild(category) && tick ? { tick } : {}),
    x: spot.x, z: spot.z, rotY: spot.rotY,
    wall: spot.wall, t: spot.t, cu: spot.cu ?? 0,
    onPlacementId: spot.on ?? null,
  }
}
