import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { WINDOW_KEYS, DOOR_KEYS, FURNITURE_KEYS } from './catalog.js'

const SIZES = {
  refrigerator_no_freezer: [0.55, 0.85, 0.58],
  refrigerator_freezer_400l: [0.7, 1.75, 0.7],
  refrigerator_ice_dispenser: [0.9, 1.8, 0.75],
  commercial_storage_refrigerator: [0.75, 1.9, 0.8],
  tv_43_inch_wall_mounted: [0.95, 0.54, 0.06],
  tv_55_inch_wall_mounted: [1.23, 0.72, 0.06],
  tv_65_inch_wall_mounted: [1.45, 0.84, 0.06],
  light_led_10w: [0.2, 0.3, 0.2],
  light_led_15w: [0.26, 0.36, 0.26],
  light_cfl: [0.16, 0.34, 0.16],
  light_linear_led: [1.2, 0.06, 0.08],
  light_fluorescent_tube: [1.2, 0.08, 0.1],
  glass_sliding_door: [1.6, 2.05, 0.1],
  microwave_oven: [0.45, 0.26, 0.35],
  air_fryer: [0.3, 0.3, 0.35],
  rice_cooker: [0.3, 0.25, 0.3],
  induction_cooker: [0.35, 0.06, 0.42],
  electric_kettle: [0.2, 0.25, 0.2],
  toaster: [0.3, 0.2, 0.2],
  dishwasher: [0.6, 0.85, 0.6],
  washer_front_load: [0.6, 0.85, 0.6],
  washer_top_load: [0.55, 0.95, 0.58],
  ceiling_fan: [1.2, 0.35, 1.2],
  stand_fan: [0.45, 1.2, 0.45],
  exhaust_fan: [0.3, 0.1, 0.3],
  instant_water_heater: [0.4, 0.25, 0.12],
  storage_water_heater: [0.4, 0.55, 0.4],
  air_purifier: [0.35, 0.6, 0.2],
  dehumidifier: [0.35, 0.5, 0.25],
  desktop_computer: [1.2, 0.74, 0.6],
  floor_lamp: [0.3, 1.55, 0.3],
  sofa_3_seater: [2.0, 0.85, 0.9],
  sofa_2_seater: [1.5, 0.85, 0.9],
  armchair: [0.85, 0.85, 0.85],
  coffee_table: [1.0, 0.42, 0.55],
  tv_console: [1.6, 0.5, 0.4],
  dining_table: [1.2, 0.75, 0.75],
  dining_chair: [0.45, 0.9, 0.5],
  bed_single: [1.0, 0.95, 2.0],
  bed_queen: [1.6, 0.95, 2.0],
  bedside_table: [0.45, 0.5, 0.4],
  wardrobe: [1.2, 2.0, 0.6],
  bookshelf: [0.8, 1.8, 0.3],
  study_desk: [1.2, 0.75, 0.6],
  office_chair: [0.55, 0.95, 0.55],
}

const KINDS = {
  window: { mode: 'opening', size: [1.2, 1.1, 0.1], y: 1.0 },
  door: { mode: 'opening', size: [0.9, 2.05, 0.1], y: 0 },
  counter: { mode: 'wall', size: [1.8, 0.9, 0.6], y: 0 },
  ac: { mode: 'wall', size: [0.9, 0.3, 0.22], y: 2.0 },
  fridge: { mode: 'floor', size: [0.7, 1.75, 0.7], y: 0, gap: 0.1 }, 
  cook: { mode: 'top', size: [0.45, 0.26, 0.35], y: 0.9 }, 
  tv: { mode: 'wall', size: [1.23, 0.72, 0.06], y: 1.0, gap: 0.005 },
  dryer: { mode: 'floor', size: [0.6, 0.85, 0.65], y: 0 },
  light: { mode: 'ceiling', size: [0.2, 0.3, 0.2], y: 0 },
  ceilingfan: { mode: 'ceiling', size: [1.2, 0.35, 1.2], y: 0 },
  exhaust: { mode: 'ceiling', size: [0.3, 0.1, 0.3], y: 0 },
  standfan: { mode: 'floor', size: [0.45, 1.2, 0.45], y: 0 },
  washer: { mode: 'floor', size: [0.6, 0.85, 0.6], y: 0 },
  dishwasher: { mode: 'floor', size: [0.6, 0.85, 0.6], y: 0 },
  heater: { mode: 'wall', size: [0.4, 0.3, 0.15], y: 1.6 },
  purifier: { mode: 'floor', size: [0.35, 0.6, 0.2], y: 0 },
  pc: { mode: 'floor', size: [1.2, 0.74, 0.6], y: 0 },
  lamp: { mode: 'floor', size: [0.3, 1.55, 0.3], y: 0 },
  furniture: { mode: 'floor', size: [1, 0.8, 0.6], y: 0 },
}

function classify(type, category) {
  if (category === 'build') {
    if (WINDOW_KEYS.has(type)) return { kind: 'window', variant: type === 'double_glazed_window' ? 'double' : '' }
    if (DOOR_KEYS.has(type)) return { kind: 'door', variant: type === 'glass_sliding_door' ? 'glass' : '' }
    if (FURNITURE_KEYS.has(type)) return { kind: 'furniture', variant: type }
    return { kind: 'counter', variant: type === 'plain_countertop' ? 'plain' : 'sink' }
  }
  if (type.startsWith('aircon_')) {
    if (type === 'aircon_portable') return { kind: 'ac', variant: 'portable' }
    if (type === 'aircon_window' || type === 'aircon_casement') return { kind: 'ac', variant: 'window' }
    return { kind: 'ac', variant: 'split' }
  }
  if (type.startsWith('tv_')) return { kind: 'tv', variant: '' }
  if (type.startsWith('washer_')) return { kind: 'washer', variant: type === 'washer_top_load' ? 'top' : 'front' }
  if (type.startsWith('dryer_')) return { kind: 'dryer', variant: type.slice('dryer_'.length) }
  if (type.startsWith('light_')) return { kind: 'light', variant: type.slice('light_'.length) }
  if (type.includes('refrigerator')) {
    const variant = type.includes('ice') ? 'ice' : type.includes('commercial') ? 'commercial' : type.includes('no_freezer') ? 'mini' : ''
    return { kind: 'fridge', variant }
  }
  switch (type) {
    case 'stand_fan': return { kind: 'standfan', variant: '' }
    case 'exhaust_fan': return { kind: 'exhaust', variant: '' }
    case 'ceiling_fan': return { kind: 'ceilingfan', variant: '' }
    case 'instant_water_heater': case 'storage_water_heater': return { kind: 'heater', variant: type.startsWith('storage') ? 'storage' : 'instant' }
    case 'desktop_computer': return { kind: 'pc', variant: '' }
    case 'floor_lamp': return { kind: 'lamp', variant: '' }
    case 'air_purifier': case 'dehumidifier': return { kind: 'purifier', variant: type === 'dehumidifier' ? 'dehumidifier' : 'purifier' }
    case 'dishwasher': return { kind: 'dishwasher', variant: '' }
    case 'microwave_oven': case 'air_fryer': case 'rice_cooker': case 'induction_cooker': case 'electric_kettle': case 'toaster':
      return { kind: 'cook', variant: type }
  }
  return { kind: 'dryer', variant: '' }
}

const SINK = { from: 0.2, to: 0.7 }
export const sinkSpan = (counter) => (counter.variant === 'sink' ? [-counter.w / 2 + SINK.from, -counter.w / 2 + SINK.to] : null)

export function resolveSpec(type = '', category = '') {
  const { kind, variant } = classify(type, category)
  const base = KINDS[kind]
  let [w, h, d] = SIZES[type] || base.size
  let mode = base.mode, y = base.y
  if (kind === 'ac' && variant === 'window') { [w, h, d, y] = [0.6, 0.4, 0.5, 1.6] }
  if (kind === 'ac' && variant === 'portable') { [w, h, d, y, mode] = [0.4, 0.8, 0.4, 0, 'floor'] }
  if (kind === 'light') y = 0 
  if (kind === 'heater') y = variant === 'storage' ? 1.4 : 1.7
  return { kind, variant, mode, w, h, d, y, gap: base.gap }
}

function makeBuilder() {
  const group = new THREE.Group()
  const add = (geometry, color, [x, y, z], opts = {}) => {
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color, roughness: 0.5, ...opts }))
    mesh.position.set(x, y, z)
    mesh.castShadow = mesh.receiveShadow = true
    group.add(mesh)
    return mesh
  }
  return {
    group,
    box: (w, h, d, color, [x, y, z], opts) =>
      add(new RoundedBoxGeometry(w, h, d, 2, Math.min(0.02, w / 3, h / 3, d / 3)), color, [x, y + h / 2, z], opts),
    cyl: (r, h, color, [x, y, z], opts) => add(new THREE.CylinderGeometry(r, r, h, 24), color, [x, y + h / 2, z], opts),
    ball: (r, color, [x, y, z], opts) => add(new THREE.SphereGeometry(r, 24, 16), color, [x, y, z], opts),
    glass: (w, h, d, color, [x, y, z], opacity = 0.35) =>
      add(new THREE.BoxGeometry(w, h, d), color, [x, y + h / 2, z], { transparent: true, opacity, roughness: 0.05, depthWrite: false }),
  }
}

const STEEL = 0xaab4bd, DARK = 0x1f2933, WHITE = 0xf4f4f0, METAL = { metalness: 0.8, roughness: 0.25 }
const FABRIC = 0x7c8c99, FABRIC_DARK = 0x667684, OAK = 0xc8a47a, WALNUT = 0x7b5434, CREAM = 0xe9e4da

function cornerLegs({ w, d }, b, height, size, color, inset) {
  for (const sx of [-1, 1]) for (const sz of [-1, 1])
    b.box(size, height, size, color, [sx * (w / 2 - inset), 0, sz * (d / 2 - inset)])
}

function seating({ w, h, d }, b, seats, arm) {
  const back = 0.2, seatTop = 0.33
  cornerLegs({ w, d }, b, 0.08, 0.05, DARK, 0.08)
  b.box(w, 0.25, d, FABRIC_DARK, [0, 0.08, 0])
  b.box(w, h - seatTop, back, FABRIC, [0, seatTop, -d / 2 + back / 2])
  for (const side of [-1, 1]) b.box(arm, 0.3, d - back, FABRIC, [side * (w / 2 - arm / 2), seatTop, back / 2])
  const cushionW = (w - 2 * arm) / seats
  for (let i = 0; i < seats; i++) {
    const x = -w / 2 + arm + cushionW * (i + 0.5)
    b.box(cushionW - 0.02, 0.14, d - back - 0.04, FABRIC, [x, seatTop, back / 2])
    b.box(cushionW - 0.04, 0.4, 0.14, FABRIC_DARK, [x, seatTop + 0.14, -d / 2 + back + 0.07])
  }
}

function bed({ w, h, d }, b, pillows) {
  b.box(w, 0.25, d, WALNUT, [0, 0.1, 0])
  b.box(w, h - 0.1, 0.06, WALNUT, [0, 0.1, -d / 2 + 0.03])
  b.box(w - 0.06, 0.2, d - 0.1, 0xf5f3ee, [0, 0.35, 0.02])
  const pillowW = Math.min(0.55, (w - 0.1) / pillows)
  for (let i = 0; i < pillows; i++)
    b.box(pillowW - 0.04, 0.1, 0.32, 0xffffff, [-w / 2 + 0.05 + pillowW * (i + 0.5) + (w - 0.1 - pillowW * pillows) / 2, 0.55, -d / 2 + 0.32])
  b.box(w - 0.04, 0.04, d * 0.5, 0x8fa6b8, [0, 0.55, d / 2 - d * 0.25 - 0.03])
}

const FURNITURE_PARTS = {
  sofa_3_seater: (spec, b) => seating(spec, b, 3, 0.18),
  sofa_2_seater: (spec, b) => seating(spec, b, 2, 0.18),
  armchair: (spec, b) => seating(spec, b, 1, 0.14),
  bed_single: (spec, b) => bed(spec, b, 1),
  bed_queen: (spec, b) => bed(spec, b, 2),

  coffee_table(spec, b) {
    const { w, h, d } = spec
    cornerLegs(spec, b, h - 0.04, 0.05, WALNUT, 0.06)
    b.box(w - 0.14, 0.02, d - 0.14, WALNUT, [0, 0.12, 0])
    b.box(w, 0.04, d, OAK, [0, h - 0.04, 0], { roughness: 0.4 })
  },

  tv_console({ w, h, d }, b) {
    for (const sx of [-1, 1]) b.box(0.04, 0.08, d - 0.06, DARK, [sx * (w / 2 - 0.08), 0, 0])
    b.box(w, h - 0.08, d, WALNUT, [0, 0.08, 0])
    for (const x of [-w / 6, w / 6]) b.box(0.008, h - 0.16, 0.01, 0x4a3320, [x, 0.12, d / 2])
    for (const x of [-w / 6 - 0.04, -w / 6 + 0.04, w / 6 - 0.04, w / 6 + 0.04]) b.box(0.015, 0.1, 0.02, STEEL, [x, h * 0.55, d / 2 + 0.01], METAL)
  },

  dining_table(spec, b) {
    const { w, h, d } = spec
    cornerLegs(spec, b, h - 0.04, 0.06, WALNUT, 0.05)
    b.box(w, 0.04, d, OAK, [0, h - 0.04, 0], { roughness: 0.4 })
  },

  dining_chair({ w, h, d }, b) {
    const seat = 0.45
    cornerLegs({ w, d }, b, seat - 0.05, 0.04, WALNUT, 0.03)
    b.box(w, 0.05, d, 0xd6c3a5, [0, seat - 0.05, 0])
    b.box(w, h - seat, 0.04, 0xd6c3a5, [0, seat, -d / 2 + 0.02])
  },

  bedside_table({ w, h, d }, b) {
    cornerLegs({ w, d }, b, 0.1, 0.04, DARK, 0.03)
    b.box(w, h - 0.1, d, WALNUT, [0, 0.1, 0])
    b.box(w - 0.06, 0.012, 0.01, 0x4a3320, [0, h * 0.6, d / 2])
    b.ball(0.015, STEEL, [0, h * 0.78, d / 2 + 0.01], METAL)
    b.ball(0.015, STEEL, [0, h * 0.42, d / 2 + 0.01], METAL)
  },

  wardrobe({ w, h, d }, b) {
    b.box(w, h, d, CREAM, [0, 0, 0])
    const doors = Math.max(2, Math.round(w / 0.6)), step = w / doors
    for (let i = 1; i < doors; i++) b.box(0.008, h - 0.1, 0.01, 0x9a9488, [-w / 2 + i * step, 0.05, d / 2])
    for (let i = 1; i < doors; i++) for (const side of [-1, 1])
      b.box(0.015, 0.25, 0.02, STEEL, [-w / 2 + i * step + side * 0.04, h * 0.5, d / 2 + 0.01], METAL)
  },

  bookshelf({ w, h, d }, b) {
    const books = [0xb45309, 0x1d4ed8, 0x15803d, 0x9f1239, 0x6d28d9, 0xca8a04]
    for (const side of [-1, 1]) b.box(0.03, h, d, WALNUT, [side * (w / 2 - 0.015), 0, 0])
    b.box(w, h, 0.01, 0x5a3d22, [0, 0, -d / 2 + 0.005])
    const shelves = 5, gap = (h - 0.03) / shelves
    for (let s = 0; s <= shelves; s++) b.box(w - 0.06, 0.025, d - 0.02, WALNUT, [0, s * gap, 0])
    for (let s = 1; s < shelves - 1; s++) {
      const count = Math.floor((w - 0.14) / 0.055)
      for (let k = 0; k < count; k++) {
        const bookH = 0.2 - ((k + s) % 3) * 0.03
        b.box(0.045, bookH, d * 0.7, books[(s * 5 + k) % books.length], [-w / 2 + 0.07 + k * 0.055, s * gap + 0.025, 0])
      }
    }
  },

  study_desk({ w, h, d }, b) {
    b.box(0.03, h - 0.03, d - 0.04, CREAM, [-w / 2 + 0.015, 0, 0])
    b.box(0.4, h - 0.03, d - 0.04, CREAM, [w / 2 - 0.2, 0, 0])
    for (const y of [0.15, 0.4]) b.box(0.12, 0.015, 0.01, STEEL, [w / 2 - 0.2, y + 0.1, d / 2 - 0.015], METAL)
    b.box(w, 0.03, d, OAK, [0, h - 0.03, 0], { roughness: 0.4 })
  },

  office_chair({ w, h }, b) {
    b.cyl(w * 0.4, 0.03, DARK, [0, 0.05, 0])
    b.cyl(0.025, 0.3, STEEL, [0, 0.08, 0], METAL)
    b.box(w * 0.9, 0.08, w * 0.9, DARK, [0, 0.4, 0.02])
    b.box(w * 0.85, h - 0.48, 0.06, DARK, [0, 0.48, -w * 0.4])
  },
}

const BUILDERS = {
  window({ w, h, d, variant }, b) {
    const f = 0.05 
    b.box(w, f, d, DARK, [0, 0, 0]); b.box(w, f, d, DARK, [0, h - f, 0])
    b.box(f, h, d, DARK, [-w / 2 + f / 2, 0, 0]); b.box(f, h, d, DARK, [w / 2 - f / 2, 0, 0])
    b.box(0.04, h, d * 0.6, DARK, [0, 0, 0]) 
    const tint = variant === 'double' ? 0x3b82f6 : 0x9ccbf5
    b.glass(w - 2 * f, h - 2 * f, 0.015, tint, [0, f, 0], variant === 'double' ? 0.5 : 0.3)
    b.box(w + 0.1, 0.04, 0.2, 0xe5e7eb, [0, -0.04, d / 2 + 0.05])
    b.box(0.03, 0.12, 0.04, 0xcbd5e1, [-0.05, h / 2 - 0.06, d / 2], METAL)
  },

  door({ w, h, d, variant }, b) {
    const f = 0.06
    b.box(w, f, d, DARK, [0, h - f, 0])
    b.box(f, h, d, DARK, [-w / 2 + f / 2, 0, 0]); b.box(f, h, d, DARK, [w / 2 - f / 2, 0, 0])
    const pw = w - 2 * f, ph = h - f
    if (variant === 'glass') {
      b.glass(pw, ph, 0.03, 0x9ccbf5, [0, 0, 0])
      b.box(0.03, ph, 0.05, 0xcbd5e1, [0, 0, 0], METAL)
      b.box(0.03, 0.4, 0.06, 0xe2e8f0, [0.1, 0.9, d / 2], METAL)
    } else {
      b.box(pw, ph, 0.05, 0x8a4b2a, [0, 0, 0], { roughness: 0.7 })
      b.box(pw * 0.7, ph * 0.38, 0.06, 0x73401f, [0, ph * 0.08, 0], { roughness: 0.8 })
      b.box(pw * 0.7, ph * 0.38, 0.06, 0x73401f, [0, ph * 0.54, 0], { roughness: 0.8 })
      b.box(0.04, 0.04, 0.09, 0xe2e8f0, [pw / 2 - 0.1, 1.0, 0.03], METAL)
    }
  },

  counter({ w, h, d, variant }, b) {
    const top = 0.04, body = h - top, front = d / 2
    b.box(w, body, d - 0.02, 0xd9cfbd, [0, 0, -0.01])
    b.box(w + 0.02, top, d, 0xf8fafc, [0, body, 0], { roughness: 0.15 })
    b.box(w, 0.1, 0.02, 0xf8fafc, [0, h, -d / 2 + 0.01])
    const doors = Math.max(2, Math.round(w / 0.5)), step = w / doors
    for (let i = 1; i < doors; i++) b.box(0.006, body - 0.1, 0.01, 0x8a8170, [-w / 2 + i * step, 0.05, front - 0.01])
    for (let i = 0; i < doors; i++) b.box(0.12, 0.015, 0.02, STEEL, [-w / 2 + (i + 0.5) * step, body - 0.08, front], METAL)
    if (variant === 'plain') return
    const sinkMid = -w / 2 + (SINK.from + SINK.to) / 2
    b.box(SINK.to - SINK.from, 0.012, 0.36, 0xc8d0d8, [sinkMid, h, 0.02], METAL)
    b.cyl(0.015, 0.2, STEEL, [sinkMid, h, -0.2], METAL)
    b.box(0.015, 0.015, 0.12, STEEL, [sinkMid, h + 0.2, -0.14], METAL)
  },

  cook({ w, h, d, variant }, b) {
    const front = d / 2
    if (variant === 'microwave_oven') {
      b.box(w, h, d, 0xd5d9de, [0, 0, 0], METAL)
      b.box(w * 0.65, h * 0.78, 0.01, 0x14181d, [-w * 0.1, h * 0.11, front], { roughness: 0.1 })
      b.box(w * 0.2, h * 0.78, 0.012, 0x2b3139, [w * 0.35, h * 0.11, front])
      b.box(0.012, h * 0.6, 0.02, STEEL, [w * 0.2, h * 0.2, front + 0.01], METAL)
    } else if (variant === 'electric_kettle') {
      b.cyl(w * 0.45, h * 0.8, 0xe5e7eb, [0, 0, 0], METAL)
      b.cyl(w * 0.35, h * 0.2, 0x1f2933, [0, h * 0.8, 0])
      b.box(0.03, h * 0.6, 0.05, 0x111827, [w * 0.5, h * 0.15, 0])
      b.box(0.04, 0.02, 0.01, 0x38bdf8, [0, h * 0.4, w * 0.45], { emissive: 0x38bdf8, emissiveIntensity: 0.8 })
    } else if (variant === 'toaster') {
      b.box(w, h, d, 0xcbd5e1, [0, 0, 0], METAL)
      b.box(w * 0.7, 0.01, 0.05, 0x111827, [0, h, -0.04]); b.box(w * 0.7, 0.01, 0.05, 0x111827, [0, h, 0.04])
      b.box(0.02, 0.04, 0.03, 0x111827, [w / 2, h * 0.6, 0])
    } else if (variant === 'rice_cooker') {
      b.cyl(w * 0.48, h * 0.7, 0xf8fafc, [0, 0, 0])
      b.cyl(w * 0.46, h * 0.3, 0xcbd5e1, [0, h * 0.7, 0])
      b.box(0.1, 0.04, 0.01, 0x1f2933, [0, h * 0.35, w * 0.48])
      b.ball(0.02, 0x64748b, [0, h, 0])
    } else if (variant === 'air_fryer') {
      b.box(w, h * 0.78, d, 0x2b2f36, [0, 0, 0])
      b.cyl(w * 0.5, h * 0.22, 0x1c1f24, [0, h * 0.78, 0])
      b.box(w * 0.5, 0.05, 0.03, 0x4b5563, [0, h * 0.32, front + 0.01], METAL)
      b.box(0.04, 0.025, 0.01, 0x10b981, [0, h * 0.62, front], { emissive: 0x10b981, emissiveIntensity: 0.6 })
      b.cyl(w * 0.45, h * 0.75, 0xeceff3, [0, 0, 0])
      b.cyl(w * 0.47, h * 0.12, 0xcfd6dd, [0, h * 0.75, 0])
      b.ball(0.025, 0x64748b, [0, h * 0.9, 0])
      b.box(0.1, 0.04, 0.01, 0x374151, [0, h * 0.3, w * 0.45])
    } else {
      b.box(w, h, d, 0x111827, [0, 0, 0], { roughness: 0.15 })
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.004, 8, 32), new THREE.MeshStandardMaterial({ color: 0xef4444, emissive: 0xef4444, emissiveIntensity: 0.4 }))
      ring.rotation.x = Math.PI / 2; ring.position.set(0, h + 0.002, -0.02); b.group.add(ring)
      b.box(0.1, 0.004, 0.03, 0x64748b, [0, h, d / 2 - 0.05])
    }
  },

  fridge({ w, h, d, variant }, b) {
    const front = d / 2
    if (variant === 'mini') { 
      b.box(w, h, d, STEEL, [0, 0, 0], METAL)
      b.box(0.02, h * 0.5, 0.03, DARK, [w / 2 - 0.07, h * 0.25, front], METAL)
      return
    }
    if (variant === 'commercial') { 
      b.box(w, h, d, WHITE, [0, 0, 0])
      b.glass(w - 0.1, h - 0.2, 0.02, 0x93c5fd, [0, 0.1, front], 0.35)
      for (let i = 1; i < 5; i++) b.box(w - 0.12, 0.012, d * 0.8, 0xe2e8f0, [0, 0.1 + (i * (h - 0.2)) / 5, 0])
      b.box(0.03, h * 0.5, 0.04, DARK, [w / 2 - 0.05, h * 0.25, front + 0.02], METAL)
      return
    }
    b.box(w, h, d, STEEL, [0, 0, 0], METAL)
    const split = h * 0.66 
    b.box(w + 0.005, 0.012, d + 0.005, DARK, [0, h - split, 0])
    b.box(0.025, 0.5, 0.035, DARK, [w / 2 - 0.07, h - split + 0.1, front + 0.01], METAL) 
    b.box(0.025, 0.4, 0.035, DARK, [w / 2 - 0.07, h - split - 0.5, front + 0.01], METAL) 
    if (variant === 'ice') b.box(0.22, 0.32, 0.02, DARK, [-w / 4, h * 0.45, front], { roughness: 0.2 })
  },

  ac({ w, h, d, variant }, b) {
    if (variant === 'window') { 
      b.box(w, h, d, 0xe8e8e3, [0, 0, 0])
      b.box(w * 0.8, h * 0.45, 0.02, 0x64748b, [0, h * 0.4, d / 2])
      for (let i = 0; i < 4; i++) b.box(w * 0.8, 0.008, 0.02, DARK, [0, 0.04 + i * 0.03, d / 2 + 0.005])
      return
    }
    if (variant === 'portable') { 
      b.box(w, h - 0.06, d, 0xf0f0ec, [0, 0.06, 0])
      b.box(w * 0.7, 0.06, 0.02, DARK, [0, h - 0.18, d / 2])
      b.box(0.06, 0.1, 0.02, 0x10b981, [w / 2 - 0.08, h - 0.28, d / 2], { emissive: 0x10b981, emissiveIntensity: 0.5 })
      for (const x of [-1, 1]) for (const z of [-1, 1]) b.ball(0.025, DARK, [x * w * 0.35, 0.025, z * d * 0.35])
      return
    }

    b.box(w, h, d, WHITE, [0, 0, 0], { roughness: 0.3 })
    b.box(w * 0.92, 0.035, 0.05, DARK, [0, 0.03, d / 2 - 0.02]) 
    b.box(w * 0.88, 0.02, 0.01, 0xe2e8f0, [0, h - 0.08, d / 2]) 
    b.box(0.03, 0.012, 0.012, 0x10b981, [w / 2 - 0.1, h - 0.06, d / 2], { emissive: 0x10b981, emissiveIntensity: 1 })
  },

  tv({ w, h, d }, b) {
    const bezel = 0.012, panel = d * 0.55
    b.box(w * 0.3, h * 0.3, d - panel, 0x2b3139, [0, h * 0.35, -d / 2 + (d - panel) / 2], METAL)
    b.box(w, h, panel, 0x111418, [0, 0, d / 2 - panel / 2], { roughness: 0.35 })
    b.box(w - 2 * bezel, h - 2 * bezel, 0.004, 0x05070a, [0, bezel, d / 2 - 0.001], { roughness: 0.05, metalness: 0.3 })
  },

  dryer({ w, h, d, variant }, b) {
    const front = d / 2, colour = variant === 'heat_pump' ? 0xe2e8f0 : WHITE
    b.box(w, h, d, colour, [0, 0, 0], { roughness: 0.3 })
    b.box(w, 0.1, 0.02, 0x475569, [0, h - 0.14, front])
    b.cyl(0.02, 0.03, STEEL, [0.15, h - 0.1, front + 0.01], METAL).rotation.x = Math.PI / 2
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.03, 12, 32), new THREE.MeshStandardMaterial({ color: STEEL, ...METAL }))
    ring.position.set(0, h * 0.45, front); ring.castShadow = true; b.group.add(ring)
    const glass = b.cyl(0.19, 0.02, 0x1e293b, [0, 0, front - 0.005], { roughness: 0.1, transparent: true, opacity: 0.85 })
    glass.rotation.x = Math.PI / 2
    glass.position.y = h * 0.45
  },

  light({ w, h, variant }, b) {
    const glow = { color: 0xfff3b0, emissive: 0xffd24a, emissiveIntensity: 1.1 }
    const lit = (mesh) => { mesh.material.emissive.setHex(glow.emissive); mesh.material.emissiveIntensity = glow.emissiveIntensity; return mesh }
    if (variant.includes('tube') || variant.includes('linear')) { 
      const tube = b.cyl(h * 0.4, w, 0xffffff, [0, 0, 0]); tube.rotation.z = Math.PI / 2; tube.position.set(0, h / 2, 0); lit(tube)
      b.box(0.06, h * 0.4, 0.06, DARK, [-w / 2 + 0.05, h * 0.6, 0]); b.box(0.06, h * 0.4, 0.06, DARK, [w / 2 - 0.05, h * 0.6, 0])
      return
    }

    const r = w / 2, cord = h - r * 2
    b.cyl(0.05, 0.02, DARK, [0, h - 0.02, 0])
    b.cyl(0.006, cord, DARK, [0, r * 2, 0])
    lit(b.ball(variant === 'cfl' ? r * 0.7 : r, glow.color, [0, r, 0]))
    if (variant === 'cfl') b.cyl(r * 0.8, r * 1.6, 0xf1f5f9, [0, r * 1.4, 0])
  },

  ceilingfan({ w, h }, b) {
    const rotor = new THREE.Group()
    const blade = (a) => {
      const m = new THREE.Mesh(new RoundedBoxGeometry(0.5, 0.012, 0.13, 2, 0.005), new THREE.MeshStandardMaterial({ color: 0x8b6b4a, roughness: 0.6 }))
      m.position.set(Math.cos(a) * (w * 0.32), 0.06, Math.sin(a) * (w * 0.32))
      m.rotation.y = -a
      m.castShadow = true
      rotor.add(m)
    }
    for (let i = 0; i < 4; i++) blade((i * Math.PI) / 2)
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.1, 24), new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.4 }))
    hub.position.y = 0.06; hub.castShadow = true
    rotor.add(hub)
    b.group.add(rotor)
    b.group.userData.rotor = rotor
    b.cyl(0.015, h - 0.17, DARK, [0, 0.11, 0])
    b.cyl(0.06, 0.04, WHITE, [0, h - 0.04, 0])
  },

  exhaust({ w, h }, b) {
    b.box(w, h, w, WHITE, [0, 0, 0])
    b.cyl(w * 0.4, 0.012, 0x94a3b8, [0, 0, 0])
    for (let i = 0; i < 3; i++) b.box(w * 0.6, 0.006, 0.02, 0xcbd5e1, [0, 0.004, (i - 1) * 0.07])
  },

  standfan({ w, h }, b) {
    b.cyl(w * 0.42, 0.03, 0x374151, [0, 0, 0])
    b.cyl(0.018, h * 0.62, STEEL, [0, 0.03, 0], METAL)
    const head = new THREE.Group()
    head.position.set(0, h * 0.72, 0.03)
    const cage = new THREE.Mesh(new THREE.TorusGeometry(w * 0.45, 0.008, 8, 32), new THREE.MeshStandardMaterial({ color: STEEL, ...METAL }))
    cage.castShadow = true
    head.add(cage)
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.42, w * 0.42, 0.004, 24), new THREE.MeshStandardMaterial({ color: 0xbfdbfe, transparent: true, opacity: 0.45, depthWrite: false }))
    disc.rotation.x = Math.PI / 2
    head.add(disc)
    const motor = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.12, 16), new THREE.MeshStandardMaterial({ color: 0x475569 }))
    motor.rotation.x = Math.PI / 2; motor.position.z = -0.07; motor.castShadow = true
    head.add(motor)
    b.group.add(head)
  },

  washer({ w, h, d, variant }, b) {
    const front = d / 2
    b.box(w, h, d, WHITE, [0, 0, 0], { roughness: 0.3 })
    if (variant === 'top') {
      b.box(w, 0.08, d, 0xcbd5e1, [0, h - 0.08, 0])
      b.box(w * 0.7, 0.01, d * 0.55, 0x1e293b, [0, h, -0.04], { roughness: 0.1, transparent: true, opacity: 0.85 })
      b.box(w * 0.5, 0.04, 0.02, 0x475569, [0, h - 0.06, front])
      return
    }
    b.box(w, 0.1, 0.02, 0x475569, [0, h - 0.14, front])
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.03, 12, 32), new THREE.MeshStandardMaterial({ color: STEEL, ...METAL }))
    ring.position.set(0, h * 0.42, front); ring.castShadow = true; b.group.add(ring)
    const door = b.cyl(0.19, 0.02, 0x1e293b, [0, 0, front - 0.005], { roughness: 0.1, transparent: true, opacity: 0.85 })
    door.rotation.x = Math.PI / 2
    door.position.y = h * 0.42
  },

  dishwasher({ w, h, d }, b) {
    const front = d / 2
    b.box(w, h, d, STEEL, [0, 0, 0], METAL)
    b.box(w * 0.96, 0.08, 0.02, 0x1f2933, [0, h - 0.1, front])
    b.box(0.03, 0.012, 0.012, 0x10b981, [w * 0.35, h - 0.06, front + 0.01], { emissive: 0x10b981, emissiveIntensity: 0.9 })
    b.box(w * 0.6, 0.02, 0.03, 0x64748b, [0, h - 0.2, front + 0.015], METAL)
  },

  heater({ w, h, d, variant }, b) {
    const front = d / 2
    if (variant === 'storage') {
      b.cyl(w * 0.5, h * 0.9, WHITE, [0, 0.05, 0])
      b.cyl(w * 0.5, 0.05, 0xcbd5e1, [0, 0, 0])
      b.box(0.1, 0.06, 0.02, 0x1f2933, [0, h * 0.5, front])
      b.box(0.02, 0.02, 0.01, 0xef4444, [0.06, h * 0.5, front + 0.01], { emissive: 0xef4444, emissiveIntensity: 0.8 })
      return
    }
    b.box(w, h, d, WHITE, [0, 0, 0], { roughness: 0.3 })
    b.box(w * 0.7, 0.04, 0.01, 0x1f2933, [0, h * 0.6, front])
    b.cyl(0.02, 0.05, STEEL, [-w * 0.3, -0.04, 0], METAL)
    b.cyl(0.02, 0.05, STEEL, [w * 0.3, -0.04, 0], METAL)
    b.box(0.02, 0.02, 0.008, 0x38bdf8, [w * 0.35, h * 0.2, front], { emissive: 0x38bdf8, emissiveIntensity: 0.8 })
  },

  purifier({ w, h, d, variant }, b) {
    const front = d / 2
    b.box(w, h, d, variant === 'dehumidifier' ? 0xe2e8f0 : WHITE, [0, 0, 0], { roughness: 0.35 })
    for (let i = 0; i < 6; i++) b.box(w * 0.7, 0.008, 0.01, DARK, [0, h * 0.55 + i * 0.03, front])
    b.box(w * 0.5, 0.03, 0.01, 0x0f172a, [0, h - 0.1, front])
    b.box(0.03, 0.012, 0.012, variant === 'dehumidifier' ? 0x38bdf8 : 0x10b981, [w * 0.3, h - 0.05, front], { emissive: variant === 'dehumidifier' ? 0x38bdf8 : 0x10b981, emissiveIntensity: 1 })
    if (variant === 'dehumidifier') b.box(w * 0.7, h * 0.18, 0.02, 0x93c5fd, [0, 0.05, front], { transparent: true, opacity: 0.6 })
  },

  pc({ w, d }, b) {
    const top = 0.74, slab = 0.04, WOOD = 0xb08968, LEG = 0x374151
    b.box(w, slab, d, WOOD, [0, top - slab, 0], { roughness: 0.6 })
    for (const sx of [-1, 1]) for (const sz of [-1, 1])
      b.box(0.05, top - slab, 0.05, LEG, [sx * (w / 2 - 0.05), 0, sz * (d / 2 - 0.05)], METAL)
    b.box(w - 0.12, 0.28, 0.02, WOOD, [0, top - slab - 0.28, -d / 2 + 0.06], { roughness: 0.7 })

    const tx = -w / 2 + 0.2
    b.box(0.18, 0.4, 0.4, 0x1f2933, [tx, top, -0.05])
    b.box(0.015, 0.02, 0.01, 0x38bdf8, [tx, top + 0.32, 0.155], { emissive: 0x38bdf8, emissiveIntensity: 1 })

    const mx = 0.1, mz = -0.12
    b.box(0.26, 0.015, 0.2, 0x374151, [mx, top, mz])
    b.box(0.03, 0.18, 0.03, 0x374151, [mx, top + 0.015, mz])
    b.box(0.5, 0.3, 0.025, 0x111418, [mx, top + 0.2, mz])
    b.box(0.47, 0.27, 0.005, 0x0b1220, [mx, top + 0.215, mz + 0.015], { roughness: 0.05, emissive: 0x1d4ed8, emissiveIntensity: 0.25 })

    b.box(0.38, 0.015, 0.13, 0x2d3748, [mx, top, 0.12])
    b.box(0.06, 0.025, 0.1, 0x2d3748, [mx + 0.34, top, 0.12])
  },

  furniture(spec, b) {
    const parts = FURNITURE_PARTS[spec.variant]
    if (parts) return parts(spec, b)
    b.box(spec.w, spec.h, spec.d, FABRIC, [0, 0, 0])
  },

  lamp({ h }, b) {
    b.cyl(0.11, 0.025, 0x374151, [0, 0, 0])
    b.cyl(0.01, h - 0.3, 0x374151, [0, 0.025, 0])
    const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.15, 0.25, 24, 1, true), new THREE.MeshStandardMaterial({ color: 0xfff3b0, emissive: 0xffd24a, emissiveIntensity: 0.7, side: THREE.DoubleSide }))
    shade.position.y = h - 0.15
    b.group.add(shade)
  },

}

export function createAppliance3DModel(type = '', category = '') {
  const spec = resolveSpec(type, category)
  const b = makeBuilder()
  ;(BUILDERS[spec.kind] || BUILDERS.dryer)(spec, b)
  b.group.userData.spec = spec
  return b.group
}