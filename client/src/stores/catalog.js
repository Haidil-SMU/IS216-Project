import catalogue from '../data/catalogue.json'

export { catalogue }
export const tariff = catalogue.electricityTariff
export const typeOf = (category, typeKey) => catalogue.categories[category]?.types?.[typeKey]

export const OPENING_KEYS = new Set(['single_glazed_window', 'double_glazed_window', 'timber_flush_door', 'glass_sliding_door'])
export const WINDOW_KEYS = new Set(['single_glazed_window', 'double_glazed_window'])
export const DOOR_KEYS = new Set(['timber_flush_door', 'glass_sliding_door'])
export const COUNTERTOP_KEYS = new Set(['quartz_countertop', 'plain_countertop'])

export const isBuild = (category) => category === 'build'
export const isOpening = (p) => isBuild(p.category) && OPENING_KEYS.has(p.applianceTypeKey)
export const isCountertop = (p) => isBuild(p.category) && COUNTERTOP_KEYS.has(p.applianceTypeKey)

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
