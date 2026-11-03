// applianceModels.js
// Builds the 3D models (three.js) for everything we can put in a room:
// appliances, furniture, doors, windows and counters.
//
// Receives: the type key (for example 'sofa_3_seater') and the category ('build', 'kitchen', ...)
// Gives back:
//   createAppliance3DModel(type, category) -> a three.js Group (the model)
//   resolveSpec(type, category)            -> the size and kind of the thing
//   sinkSpan(counter)                      -> where the sink is on a counter
//
// Used by: placement.js, FloorPlan3D.vue, ThreeDSpatial.vue, EnergyPlanner.vue, utils/thumbnails.js

import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { WINDOW_KEYS, DOOR_KEYS, FURNITURE_KEYS } from './catalog.js'

// ============================================================
// SIZES (in metres) - [width, height, depth]
// ============================================================

// Exact sizes for some types. Types that are not listed here use the size of their "kind".
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

// Every "kind" of thing has a default size, a mode (where it sits) and a height above the floor (y).
//   mode 'opening' = a hole in a wall (door, window)
//   mode 'wall'    = stands against / hangs on a wall
//   mode 'floor'   = stands on the floor anywhere
//   mode 'top'     = sits on top of a counter
//   mode 'ceiling' = hangs from the ceiling
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

// ============================================================
// WORK OUT WHAT KIND OF THING A TYPE KEY IS
// ============================================================

// Looks at the type key and says which "kind" it is, plus a "variant" for small differences.
function classify(type, category) {
  if (category === 'build') {
    if (WINDOW_KEYS.has(type)) {
      let variant = ''
      if (type === 'double_glazed_window') {
        variant = 'double'
      }
      return { kind: 'window', variant: variant }
    }
    if (DOOR_KEYS.has(type)) {
      let variant = ''
      if (type === 'glass_sliding_door') {
        variant = 'glass'
      }
      return { kind: 'door', variant: variant }
    }
    if (FURNITURE_KEYS.has(type)) {
      return { kind: 'furniture', variant: type }
    }
    let variant = 'sink'
    if (type === 'plain_countertop') {
      variant = 'plain'
    }
    return { kind: 'counter', variant: variant }
  }

  // air conditioners
  if (type.startsWith('aircon_')) {
    if (type === 'aircon_portable') {
      return { kind: 'ac', variant: 'portable' }
    }
    if (type === 'aircon_window' || type === 'aircon_casement') {
      return { kind: 'ac', variant: 'window' }
    }
    return { kind: 'ac', variant: 'split' }
  }

  // types that share a prefix
  if (type.startsWith('tv_')) {
    return { kind: 'tv', variant: '' }
  }
  if (type.startsWith('washer_')) {
    let variant = 'front'
    if (type === 'washer_top_load') {
      variant = 'top'
    }
    return { kind: 'washer', variant: variant }
  }
  if (type.startsWith('dryer_')) {
    return { kind: 'dryer', variant: type.slice('dryer_'.length) }
  }
  if (type.startsWith('light_')) {
    return { kind: 'light', variant: type.slice('light_'.length) }
  }

  // refrigerators
  if (type.includes('refrigerator')) {
    let variant = ''
    if (type.includes('ice')) {
      variant = 'ice'
    } else if (type.includes('commercial')) {
      variant = 'commercial'
    } else if (type.includes('no_freezer')) {
      variant = 'mini'
    }
    return { kind: 'fridge', variant: variant }
  }

  // everything else is matched by its exact name
  if (type === 'stand_fan') {
    return { kind: 'standfan', variant: '' }
  }
  if (type === 'exhaust_fan') {
    return { kind: 'exhaust', variant: '' }
  }
  if (type === 'ceiling_fan') {
    return { kind: 'ceilingfan', variant: '' }
  }
  if (type === 'instant_water_heater' || type === 'storage_water_heater') {
    let variant = 'instant'
    if (type.startsWith('storage')) {
      variant = 'storage'
    }
    return { kind: 'heater', variant: variant }
  }
  if (type === 'desktop_computer') {
    return { kind: 'pc', variant: '' }
  }
  if (type === 'floor_lamp') {
    return { kind: 'lamp', variant: '' }
  }
  if (type === 'air_purifier' || type === 'dehumidifier') {
    let variant = 'purifier'
    if (type === 'dehumidifier') {
      variant = 'dehumidifier'
    }
    return { kind: 'purifier', variant: variant }
  }
  if (type === 'dishwasher') {
    return { kind: 'dishwasher', variant: '' }
  }
  if (
    type === 'microwave_oven' ||
    type === 'air_fryer' ||
    type === 'rice_cooker' ||
    type === 'induction_cooker' ||
    type === 'electric_kettle' ||
    type === 'toaster'
  ) {
    return { kind: 'cook', variant: type }
  }

  // anything unidentified is drawn like a dryer
  return { kind: 'dryer', variant: '' }
}

// ============================================================
// SINK POSITION ON A COUNTER
// ============================================================

// The sink starts 0.2 m and ends 0.7 m from the left end of the counter.
const SINK = { from: 0.2, to: 0.7 }

// Gives [start, end] of the sink measured from the counter's centre, or null if the counter has no sink.
export function sinkSpan(counter) {
  if (counter.variant === 'sink') {
    return [-counter.w / 2 + SINK.from, -counter.w / 2 + SINK.to]
  }
  return null
}

// ============================================================
// resolveSpec - THE SIZE AND KIND OF A THING
// ============================================================

// Returns { kind, variant, mode, w, h, d, y, gap }  (w = width, h = height, d = depth, y = height above the floor)
export function resolveSpec(type = '', category = '') {
  const found = classify(type, category)
  const kind = found.kind
  const variant = found.variant
  const base = KINDS[kind]

  // an exact size if we have one, otherwise the default size of the kind
  let size = SIZES[type]
  if (!size) {
    size = base.size
  }
  let w = size[0]
  let h = size[1]
  let d = size[2]
  let mode = base.mode
  let y = base.y

  // some variants are different from the normal size of their kind
  if (kind === 'ac' && variant === 'window') {
    w = 0.6
    h = 0.4
    d = 0.5
    y = 1.6
  }
  if (kind === 'ac' && variant === 'portable') {
    w = 0.4
    h = 0.8
    d = 0.4
    y = 0
    mode = 'floor'
  }
  if (kind === 'light') {
    y = 0
  }
  if (kind === 'heater') {
    if (variant === 'storage') {
      y = 1.4
    } else {
      y = 1.7
    }
  }

  return { kind: kind, variant: variant, mode: mode, w: w, h: h, d: d, y: y, gap: base.gap }
}

// ============================================================
// THE BUILDER - small helper that adds coloured shapes to a group
// ============================================================

// Makes a three.js Group and gives back helper functions that add shapes to it.
// Every helper takes a colour and a position [x, y, z]:
//   box(w, h, d, ...)   a rounded box that stands ON the position (its bottom is at y)
//   cyl(r, h, ...)      a cylinder that stands ON the position
//   ball(r, ...)        a ball CENTRED on the position
//   glass(w, h, d, ...) a see-through box
// "opts" is an optional object with extra material settings, for example { metalness: 0.8 }
function makeBuilder() {
  const group = new THREE.Group()

  // Puts one mesh (geometry + material) into the group.
  function addMesh(geometry, color, pos, opts) {
    const options = { color: color, roughness: 0.5 }
    const keys = Object.keys(opts)
    for (const key of keys) {
      options[key] = opts[key]
    }
    const material = new THREE.MeshStandardMaterial(options)
    const mesh = new THREE.Mesh(geometry, material)
    mesh.position.set(pos[0], pos[1], pos[2])
    mesh.castShadow = true
    mesh.receiveShadow = true
    group.add(mesh)
    return mesh
  }

  function box(w, h, d, color, pos, opts = {}) {
    const radius = Math.min(0.02, w / 3, h / 3, d / 3)
    const geometry = new RoundedBoxGeometry(w, h, d, 2, radius)
    return addMesh(geometry, color, [pos[0], pos[1] + h / 2, pos[2]], opts)
  }

  function cyl(r, h, color, pos, opts = {}) {
    const geometry = new THREE.CylinderGeometry(r, r, h, 24)
    return addMesh(geometry, color, [pos[0], pos[1] + h / 2, pos[2]], opts)
  }

  function ball(r, color, pos, opts = {}) {
    const geometry = new THREE.SphereGeometry(r, 24, 16)
    return addMesh(geometry, color, pos, opts)
  }

  function glass(w, h, d, color, pos, opacity = 0.35) {
    const geometry = new THREE.BoxGeometry(w, h, d)
    const options = { transparent: true, opacity: opacity, roughness: 0.05, depthWrite: false }
    return addMesh(geometry, color, [pos[0], pos[1] + h / 2, pos[2]], options)
  }

  return { group: group, box: box, cyl: cyl, ball: ball, glass: glass }
}

// ============================================================
// COLOURS
// ============================================================

const STEEL = 0xaab4bd
const DARK = 0x1f2933
const WHITE = 0xf4f4f0
const FABRIC = 0x7c8c99
const FABRIC_DARK = 0x667684
const OAK = 0xc8a47a
const WALNUT = 0x7b5434
const CREAM = 0xe9e4da

// Shiny metal look. Pass it as the last argument of box / cyl / ball.
const METAL = { metalness: 0.8, roughness: 0.25 }

// ============================================================
// FURNITURE PARTS
// ============================================================

function cornerLegs(spec, b, height, size, color, inset) {
  const w = spec.w
  const d = spec.d
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      b.box(size, height, size, color, [sx * (w / 2 - inset), 0, sz * (d / 2 - inset)])
    }
  }
}

// A sofa or armchair. "seats" = number of seat cushions, "arm" = thickness of the armrests.
function seating(spec, b, seats, arm) {
  const w = spec.w
  const h = spec.h
  const d = spec.d
  const back = 0.2
  const seatTop = 0.33

  cornerLegs(spec, b, 0.08, 0.05, DARK, 0.08)
  b.box(w, 0.25, d, FABRIC_DARK, [0, 0.08, 0])
  b.box(w, h - seatTop, back, FABRIC, [0, seatTop, -d / 2 + back / 2])
  for (const side of [-1, 1]) {
    b.box(arm, 0.3, d - back, FABRIC, [side * (w / 2 - arm / 2), seatTop, back / 2])
  }

  const cushionW = (w - 2 * arm) / seats
  for (let i = 0; i < seats; i++) {
    const x = -w / 2 + arm + cushionW * (i + 0.5)
    b.box(cushionW - 0.02, 0.14, d - back - 0.04, FABRIC, [x, seatTop, back / 2])
    b.box(cushionW - 0.04, 0.4, 0.14, FABRIC_DARK, [x, seatTop + 0.14, -d / 2 + back + 0.07])
  }
}

// A bed. "pillows" = number of pillows.
function bed(spec, b, pillows) {
  const w = spec.w
  const h = spec.h
  const d = spec.d

  b.box(w, 0.25, d, WALNUT, [0, 0.1, 0])
  b.box(w, h - 0.1, 0.06, WALNUT, [0, 0.1, -d / 2 + 0.03])
  b.box(w - 0.06, 0.2, d - 0.1, 0xf5f3ee, [0, 0.35, 0.02])

  const pillowW = Math.min(0.55, (w - 0.1) / pillows)
  for (let i = 0; i < pillows; i++) {
    const x = -w / 2 + 0.05 + pillowW * (i + 0.5) + (w - 0.1 - pillowW * pillows) / 2
    b.box(pillowW - 0.04, 0.1, 0.32, 0xffffff, [x, 0.55, -d / 2 + 0.32])
  }
  b.box(w - 0.04, 0.04, d * 0.5, 0x8fa6b8, [0, 0.55, d / 2 - d * 0.25 - 0.03])
}

function sofa3(spec, b) {
  seating(spec, b, 3, 0.18)
}

function sofa2(spec, b) {
  seating(spec, b, 2, 0.18)
}

function armchair(spec, b) {
  seating(spec, b, 1, 0.14)
}

function bedSingle(spec, b) {
  bed(spec, b, 1)
}

function bedQueen(spec, b) {
  bed(spec, b, 2)
}

function coffeeTable(spec, b) {
  const w = spec.w
  const h = spec.h
  const d = spec.d

  cornerLegs(spec, b, h - 0.04, 0.05, WALNUT, 0.06)
  b.box(w - 0.14, 0.02, d - 0.14, WALNUT, [0, 0.12, 0])
  b.box(w, 0.04, d, OAK, [0, h - 0.04, 0], { roughness: 0.4 })
}

function tvConsole(spec, b) {
  const w = spec.w
  const h = spec.h
  const d = spec.d

  for (const sx of [-1, 1]) {
    b.box(0.04, 0.08, d - 0.06, DARK, [sx * (w / 2 - 0.08), 0, 0])
  }
  b.box(w, h - 0.08, d, WALNUT, [0, 0.08, 0])
  for (const x of [-w / 6, w / 6]) {
    b.box(0.008, h - 0.16, 0.01, 0x4a3320, [x, 0.12, d / 2])
  }
  const handleXs = [-w / 6 - 0.04, -w / 6 + 0.04, w / 6 - 0.04, w / 6 + 0.04]
  for (const x of handleXs) {
    b.box(0.015, 0.1, 0.02, STEEL, [x, h * 0.55, d / 2 + 0.01], METAL)
  }
}

function diningTable(spec, b) {
  const w = spec.w
  const h = spec.h
  const d = spec.d

  cornerLegs(spec, b, h - 0.04, 0.06, WALNUT, 0.05)
  b.box(w, 0.04, d, OAK, [0, h - 0.04, 0], { roughness: 0.4 })
}

function diningChair(spec, b) {
  const w = spec.w
  const h = spec.h
  const d = spec.d
  const seat = 0.45

  cornerLegs(spec, b, seat - 0.05, 0.04, WALNUT, 0.03)
  b.box(w, 0.05, d, 0xd6c3a5, [0, seat - 0.05, 0])
  b.box(w, h - seat, 0.04, 0xd6c3a5, [0, seat, -d / 2 + 0.02])
}

function bedsideTable(spec, b) {
  const w = spec.w
  const h = spec.h
  const d = spec.d

  cornerLegs(spec, b, 0.1, 0.04, DARK, 0.03)
  b.box(w, h - 0.1, d, WALNUT, [0, 0.1, 0])
  b.box(w - 0.06, 0.012, 0.01, 0x4a3320, [0, h * 0.6, d / 2])
  b.ball(0.015, STEEL, [0, h * 0.78, d / 2 + 0.01], METAL)
  b.ball(0.015, STEEL, [0, h * 0.42, d / 2 + 0.01], METAL)
}

function wardrobe(spec, b) {
  const w = spec.w
  const h = spec.h
  const d = spec.d

  b.box(w, h, d, CREAM, [0, 0, 0])

  const doors = Math.max(2, Math.round(w / 0.6))
  const step = w / doors
  for (let i = 1; i < doors; i++) {
    b.box(0.008, h - 0.1, 0.01, 0x9a9488, [-w / 2 + i * step, 0.05, d / 2])
  }
  for (let i = 1; i < doors; i++) {
    for (const side of [-1, 1]) {
      b.box(0.015, 0.25, 0.02, STEEL, [-w / 2 + i * step + side * 0.04, h * 0.5, d / 2 + 0.01], METAL)
    }
  }
}

function bookshelf(spec, b) {
  const w = spec.w
  const h = spec.h
  const d = spec.d
  const books = [0xb45309, 0x1d4ed8, 0x15803d, 0x9f1239, 0x6d28d9, 0xca8a04]

  // two sides and a back
  for (const side of [-1, 1]) {
    b.box(0.03, h, d, WALNUT, [side * (w / 2 - 0.015), 0, 0])
  }
  b.box(w, h, 0.01, 0x5a3d22, [0, 0, -d / 2 + 0.005])

  // the shelf boards
  const shelves = 5
  const gap = (h - 0.03) / shelves
  for (let s = 0; s <= shelves; s++) {
    b.box(w - 0.06, 0.025, d - 0.02, WALNUT, [0, s * gap, 0])
  }

  // rows of books on the middle shelves
  for (let s = 1; s < shelves - 1; s++) {
    const count = Math.floor((w - 0.14) / 0.055)
    for (let k = 0; k < count; k++) {
      const bookH = 0.2 - ((k + s) % 3) * 0.03
      const color = books[(s * 5 + k) % books.length]
      b.box(0.045, bookH, d * 0.7, color, [-w / 2 + 0.07 + k * 0.055, s * gap + 0.025, 0])
    }
  }
}

function studyDesk(spec, b) {
  const w = spec.w
  const h = spec.h
  const d = spec.d

  b.box(0.03, h - 0.03, d - 0.04, CREAM, [-w / 2 + 0.015, 0, 0])
  b.box(0.4, h - 0.03, d - 0.04, CREAM, [w / 2 - 0.2, 0, 0])
  for (const y of [0.15, 0.4]) {
    b.box(0.12, 0.015, 0.01, STEEL, [w / 2 - 0.2, y + 0.1, d / 2 - 0.015], METAL)
  }
  b.box(w, 0.03, d, OAK, [0, h - 0.03, 0], { roughness: 0.4 })
}

function officeChair(spec, b) {
  const w = spec.w
  const h = spec.h

  b.cyl(w * 0.4, 0.03, DARK, [0, 0.05, 0])
  b.cyl(0.025, 0.3, STEEL, [0, 0.08, 0], METAL)
  b.box(w * 0.9, 0.08, w * 0.9, DARK, [0, 0.4, 0.02])
  b.box(w * 0.85, h - 0.48, 0.06, DARK, [0, 0.48, -w * 0.4])
}

// Which function draws which piece of furniture
const FURNITURE_PARTS = {
  sofa_3_seater: sofa3,
  sofa_2_seater: sofa2,
  armchair: armchair,
  bed_single: bedSingle,
  bed_queen: bedQueen,
  coffee_table: coffeeTable,
  tv_console: tvConsole,
  dining_table: diningTable,
  dining_chair: diningChair,
  bedside_table: bedsideTable,
  wardrobe: wardrobe,
  bookshelf: bookshelf,
  study_desk: studyDesk,
  office_chair: officeChair,
}

// ============================================================
// ONE BUILD FUNCTION PER KIND
// ============================================================
// Each function gets the spec (size + variant) and the builder "b", and adds shapes to b.group.

function buildWindow(spec, b) {
  const w = spec.w
  const h = spec.h
  const d = spec.d
  const f = 0.05 // frame thickness

  // frame: bottom, top, left, right, and the bar in the middle
  b.box(w, f, d, DARK, [0, 0, 0])
  b.box(w, f, d, DARK, [0, h - f, 0])
  b.box(f, h, d, DARK, [-w / 2 + f / 2, 0, 0])
  b.box(f, h, d, DARK, [w / 2 - f / 2, 0, 0])
  b.box(0.04, h, d * 0.6, DARK, [0, 0, 0])

  // the glass (double glazed is darker blue)
  let tint = 0x9ccbf5
  let opacity = 0.3
  if (spec.variant === 'double') {
    tint = 0x3b82f6
    opacity = 0.5
  }
  b.glass(w - 2 * f, h - 2 * f, 0.015, tint, [0, f, 0], opacity)

  // window sill and handle
  b.box(w + 0.1, 0.04, 0.2, 0xe5e7eb, [0, -0.04, d / 2 + 0.05])
  b.box(0.03, 0.12, 0.04, 0xcbd5e1, [-0.05, h / 2 - 0.06, d / 2 + 0.015], METAL)
}

function buildDoor(spec, b) {
  const w = spec.w
  const h = spec.h
  const d = spec.d
  const f = 0.06 // frame thickness

  // frame: top, left, right
  b.box(w, f, d, DARK, [0, h - f, 0])
  b.box(f, h, d, DARK, [-w / 2 + f / 2, 0, 0])
  b.box(f, h, d, DARK, [w / 2 - f / 2, 0, 0])

  const pw = w - 2 * f
  const ph = h - f

  if (spec.variant === 'glass') {
    b.glass(pw, ph, 0.03, 0x9ccbf5, [0, 0, 0])
    b.box(0.03, ph, 0.05, 0xcbd5e1, [0, 0, 0], METAL)
    for (const side of [1, -1]) {
      b.box(0.03, 0.4, 0.03, 0xe2e8f0, [0.1 * side, 0.7, side * DOOR_HANDLE_OUT], METAL)
      for (const y of [0.74, 1.04]) {
        b.box(0.03, 0.03, DOOR_HANDLE_OUT - 0.02, 0xe2e8f0, [0.1 * side, y, side * (DOOR_HANDLE_OUT / 2 + 0.01)], METAL)
      }
    }
  } else {
    b.box(pw, ph, 0.05, 0x8a4b2a, [0, 0, 0], { roughness: 0.7 })
    b.box(pw * 0.7, ph * 0.38, 0.06, 0x73401f, [0, ph * 0.08, 0], { roughness: 0.8 })
    b.box(pw * 0.7, ph * 0.38, 0.06, 0x73401f, [0, ph * 0.54, 0], { roughness: 0.8 })
    const latchX = pw / 2 - 0.09
    addLeverHandle(b, latchX, 1.0, 1)
    addLeverHandle(b, -latchX, 1.0, -1)
  }
}

const DOOR_HANDLE_OUT = 0.1

function addLeverHandle(b, x, y, side) {
  const plateZ = 0.025 + 0.006
  // back plate, flat on the door leaf
  b.box(0.05, 0.17, 0.012, 0xcfd6dd, [x, y - 0.085, side * plateZ], METAL)
  // lock block under the lever
  b.box(0.04, 0.06, 0.014, 0xcfd6dd, [x, y - 0.2, side * (0.025 + 0.007)], METAL)
  // stem from the plate out past the wall face
  b.box(0.026, 0.026, DOOR_HANDLE_OUT - 0.037 - 0.012, 0xe2e8f0, [x, y - 0.013, side * ((0.037 + DOOR_HANDLE_OUT - 0.012) / 2)], METAL)
  // the lever, pointing back towards the hinge side
  b.box(0.15, 0.024, 0.024, 0xe2e8f0, [x - Math.sign(x) * 0.065, y - 0.012, side * (DOOR_HANDLE_OUT - 0.012)], METAL)
}

function buildCounter(spec, b) {
  const w = spec.w
  const h = spec.h
  const d = spec.d
  const top = 0.04
  const body = h - top
  const front = d / 2

  // the cabinet, the worktop and the small back edge
  b.box(w, body, d - 0.02, 0xd9cfbd, [0, 0, -0.01])
  b.box(w + 0.02, top, d, 0xf8fafc, [0, body, 0], { roughness: 0.15 })
  b.box(w, 0.1, 0.02, 0xf8fafc, [0, h, -d / 2 + 0.01])

  // cabinet doors: thin lines between them, and a handle on each
  const doors = Math.max(2, Math.round(w / 0.5))
  const step = w / doors
  for (let i = 1; i < doors; i++) {
    b.box(0.006, body - 0.1, 0.01, 0x8a8170, [-w / 2 + i * step, 0.05, front - 0.01])
  }
  for (let i = 0; i < doors; i++) {
    b.box(0.12, 0.015, 0.02, STEEL, [-w / 2 + (i + 0.5) * step, body - 0.08, front], METAL)
  }

  // a plain countertop has no sink
  if (spec.variant === 'plain') {
    return
  }

  // sink basin and tap
  const sinkMid = -w / 2 + (SINK.from + SINK.to) / 2
  b.box(SINK.to - SINK.from, 0.012, 0.36, 0xc8d0d8, [sinkMid, h, 0.02], METAL)
  b.cyl(0.015, 0.2, STEEL, [sinkMid, h, -0.2], METAL)
  b.box(0.015, 0.015, 0.12, STEEL, [sinkMid, h + 0.2, -0.14], METAL)
}

// Small cooking appliances. The variant is the type key (microwave_oven, toaster, ...).
function buildCook(spec, b) {
  const w = spec.w
  const h = spec.h
  const d = spec.d
  const variant = spec.variant
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
    b.box(w * 0.7, 0.01, 0.05, 0x111827, [0, h, -0.04])
    b.box(w * 0.7, 0.01, 0.05, 0x111827, [0, h, 0.04])
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
    // NOTE: the original code also draws these rice-cooker style shapes on top of the air fryer.
    // They are kept so the model looks exactly the same as before.
    b.cyl(w * 0.45, h * 0.75, 0xeceff3, [0, 0, 0])
    b.cyl(w * 0.47, h * 0.12, 0xcfd6dd, [0, h * 0.75, 0])
    b.ball(0.025, 0x64748b, [0, h * 0.9, 0])
    b.box(0.1, 0.04, 0.01, 0x374151, [0, h * 0.3, w * 0.45])
  } else {
    // induction cooker: a black flat plate with a red glowing ring
    b.box(w, h, d, 0x111827, [0, 0, 0], { roughness: 0.15 })
    const ringGeometry = new THREE.TorusGeometry(0.11, 0.004, 8, 32)
    const ringMaterial = new THREE.MeshStandardMaterial({ color: 0xef4444, emissive: 0xef4444, emissiveIntensity: 0.4 })
    const ring = new THREE.Mesh(ringGeometry, ringMaterial)
    ring.rotation.x = Math.PI / 2
    ring.position.set(0, h + 0.002, -0.02)
    b.group.add(ring)
    b.box(0.1, 0.004, 0.03, 0x64748b, [0, h, d / 2 - 0.05])
  }
}

function buildFridge(spec, b) {
  const w = spec.w
  const h = spec.h
  const d = spec.d
  const variant = spec.variant
  const front = d / 2

  // small one-door fridge
  if (variant === 'mini') {
    b.box(w, h, d, STEEL, [0, 0, 0], METAL)
    b.box(0.02, h * 0.5, 0.03, DARK, [w / 2 - 0.07, h * 0.25, front], METAL)
    return
  }

  // shop fridge with a glass door and shelves
  if (variant === 'commercial') {
    b.box(w, h, d, WHITE, [0, 0, 0])
    b.glass(w - 0.1, h - 0.2, 0.02, 0x93c5fd, [0, 0.1, front], 0.35)
    for (let i = 1; i < 5; i++) {
      b.box(w - 0.12, 0.012, d * 0.8, 0xe2e8f0, [0, 0.1 + (i * (h - 0.2)) / 5, 0])
    }
    b.box(0.03, h * 0.5, 0.04, DARK, [w / 2 - 0.05, h * 0.25, front + 0.02], METAL)
    return
  }

  // normal fridge with a freezer: a line between the two doors and a handle on each
  b.box(w, h, d, STEEL, [0, 0, 0], METAL)
  const split = h * 0.66
  b.box(w + 0.005, 0.012, d + 0.005, DARK, [0, h - split, 0])
  b.box(0.025, 0.5, 0.035, DARK, [w / 2 - 0.07, h - split + 0.1, front + 0.01], METAL)
  b.box(0.025, 0.4, 0.035, DARK, [w / 2 - 0.07, h - split - 0.5, front + 0.01], METAL)
  if (variant === 'ice') {
    b.box(0.22, 0.32, 0.02, DARK, [-w / 4, h * 0.45, front], { roughness: 0.2 })
  }
}

function buildAc(spec, b) {
  const w = spec.w
  const h = spec.h
  const d = spec.d
  const variant = spec.variant

  // window aircon
  if (variant === 'window') {
    b.box(w, h, d, 0xe8e8e3, [0, 0, 0])
    b.box(w * 0.8, h * 0.45, 0.02, 0x64748b, [0, h * 0.4, d / 2])
    for (let i = 0; i < 4; i++) {
      b.box(w * 0.8, 0.008, 0.02, DARK, [0, 0.04 + i * 0.03, d / 2 + 0.005])
    }
    return
  }

  // portable aircon (stands on four small wheels)
  if (variant === 'portable') {
    b.box(w, h - 0.06, d, 0xf0f0ec, [0, 0.06, 0])
    b.box(w * 0.7, 0.06, 0.02, DARK, [0, h - 0.18, d / 2])
    b.box(0.06, 0.1, 0.02, 0x10b981, [w / 2 - 0.08, h - 0.28, d / 2], { emissive: 0x10b981, emissiveIntensity: 0.5 })
    for (const x of [-1, 1]) {
      for (const z of [-1, 1]) {
        b.ball(0.025, DARK, [x * w * 0.35, 0.025, z * d * 0.35])
      }
    }
    return
  }

  // wall mounted split aircon
  b.box(w, h, d, WHITE, [0, 0, 0], { roughness: 0.3 })
  b.box(w * 0.92, 0.035, 0.05, DARK, [0, 0.03, d / 2 - 0.02])
  b.box(w * 0.88, 0.02, 0.01, 0xe2e8f0, [0, h - 0.08, d / 2])
  b.box(0.03, 0.012, 0.012, 0x10b981, [w / 2 - 0.1, h - 0.06, d / 2], { emissive: 0x10b981, emissiveIntensity: 1 })
}

function buildTv(spec, b) {
  const w = spec.w
  const h = spec.h
  const d = spec.d
  const bezel = 0.012
  const panel = d * 0.55

  b.box(w * 0.3, h * 0.3, d - panel, 0x2b3139, [0, h * 0.35, -d / 2 + (d - panel) / 2], METAL)
  b.box(w, h, panel, 0x111418, [0, 0, d / 2 - panel / 2], { roughness: 0.35 })
  b.box(w - 2 * bezel, h - 2 * bezel, 0.004, 0x05070a, [0, bezel, d / 2 - 0.001], { roughness: 0.05, metalness: 0.3 })
}

function buildDryer(spec, b) {
  const w = spec.w
  const h = spec.h
  const d = spec.d
  const front = d / 2

  let colour = WHITE
  if (spec.variant === 'heat_pump') {
    colour = 0xe2e8f0
  }

  b.box(w, h, d, colour, [0, 0, 0], { roughness: 0.3 })
  b.box(w, 0.1, 0.02, 0x475569, [0, h - 0.14, front])

  // round knob
  const knob = b.cyl(0.02, 0.03, STEEL, [0.15, h - 0.1, front + 0.01], METAL)
  knob.rotation.x = Math.PI / 2

  // steel ring around the round door
  const ringGeometry = new THREE.TorusGeometry(0.2, 0.03, 12, 32)
  const ringMaterial = new THREE.MeshStandardMaterial({ color: STEEL, metalness: 0.8, roughness: 0.25 })
  const ring = new THREE.Mesh(ringGeometry, ringMaterial)
  ring.position.set(0, h * 0.45, front)
  ring.castShadow = true
  b.group.add(ring)

  // dark glass in the door
  const glass = b.cyl(0.19, 0.02, 0x1e293b, [0, 0, front - 0.005], { roughness: 0.1, transparent: true, opacity: 0.85 })
  glass.rotation.x = Math.PI / 2
  glass.position.y = h * 0.45
}

function buildLight(spec, b) {
  const w = spec.w
  const h = spec.h
  const variant = spec.variant

  // makes a mesh glow yellow
  function makeGlow(mesh) {
    mesh.material.emissive.setHex(0xffd24a)
    mesh.material.emissiveIntensity = 1.1
    return mesh
  }

  // tube lights (fluorescent tube and linear LED)
  if (variant.includes('tube') || variant.includes('linear')) {
    const tube = b.cyl(h * 0.4, w, 0xffffff, [0, 0, 0])
    tube.rotation.z = Math.PI / 2
    tube.position.set(0, h / 2, 0)
    makeGlow(tube)
    b.box(0.06, h * 0.4, 0.06, DARK, [-w / 2 + 0.05, h * 0.6, 0])
    b.box(0.06, h * 0.4, 0.06, DARK, [w / 2 - 0.05, h * 0.6, 0])
    return
  }

  // bulbs hanging on a cord
  const r = w / 2
  const cord = h - r * 2
  b.cyl(0.05, 0.02, DARK, [0, h - 0.02, 0])
  b.cyl(0.006, cord, DARK, [0, r * 2, 0])

  let bulbRadius = r
  if (variant === 'cfl') {
    bulbRadius = r * 0.7
  }
  makeGlow(b.ball(bulbRadius, 0xfff3b0, [0, r, 0]))
  if (variant === 'cfl') {
    b.cyl(r * 0.8, r * 1.6, 0xf1f5f9, [0, r * 1.4, 0])
  }
}

function buildCeilingFan(spec, b) {
  const w = spec.w
  const h = spec.h

  // the part that spins is a group of its own, so FloorPlan3D can turn it
  const rotor = new THREE.Group()

  // one wooden blade at the angle "a"
  function addBlade(a) {
    const geometry = new RoundedBoxGeometry(0.5, 0.012, 0.13, 2, 0.005)
    const material = new THREE.MeshStandardMaterial({ color: 0x8b6b4a, roughness: 0.6 })
    const mesh = new THREE.Mesh(geometry, material)
    mesh.position.set(Math.cos(a) * (w * 0.32), 0.06, Math.sin(a) * (w * 0.32))
    mesh.rotation.y = -a
    mesh.castShadow = true
    rotor.add(mesh)
  }
  for (let i = 0; i < 4; i++) {
    addBlade((i * Math.PI) / 2)
  }

  const hubGeometry = new THREE.CylinderGeometry(0.1, 0.1, 0.1, 24)
  const hubMaterial = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.4 })
  const hub = new THREE.Mesh(hubGeometry, hubMaterial)
  hub.position.y = 0.06
  hub.castShadow = true
  rotor.add(hub)

  b.group.add(rotor)
  b.group.userData.rotor = rotor

  // the rod and the ceiling plate
  b.cyl(0.015, h - 0.17, DARK, [0, 0.11, 0])
  b.cyl(0.06, 0.04, WHITE, [0, h - 0.04, 0])
}

function buildExhaust(spec, b) {
  const w = spec.w
  const h = spec.h

  b.box(w, h, w, WHITE, [0, 0, 0])
  b.cyl(w * 0.4, 0.012, 0x94a3b8, [0, 0, 0])
  for (let i = 0; i < 3; i++) {
    b.box(w * 0.6, 0.006, 0.02, 0xcbd5e1, [0, 0.004, (i - 1) * 0.07])
  }
}

function buildStandFan(spec, b) {
  const w = spec.w
  const h = spec.h

  // base and pole
  b.cyl(w * 0.42, 0.03, 0x374151, [0, 0, 0])
  b.cyl(0.018, h * 0.62, STEEL, [0, 0.03, 0], METAL)

  // the head: a ring, a see-through disc and the motor
  const head = new THREE.Group()
  head.position.set(0, h * 0.72, 0.03)

  const cageGeometry = new THREE.TorusGeometry(w * 0.45, 0.008, 8, 32)
  const cageMaterial = new THREE.MeshStandardMaterial({ color: STEEL, metalness: 0.8, roughness: 0.25 })
  const cage = new THREE.Mesh(cageGeometry, cageMaterial)
  cage.castShadow = true
  head.add(cage)

  const discGeometry = new THREE.CylinderGeometry(w * 0.42, w * 0.42, 0.004, 24)
  const discMaterial = new THREE.MeshStandardMaterial({ color: 0xbfdbfe, transparent: true, opacity: 0.45, depthWrite: false })
  const disc = new THREE.Mesh(discGeometry, discMaterial)
  disc.rotation.x = Math.PI / 2
  head.add(disc)

  const motorGeometry = new THREE.CylinderGeometry(0.05, 0.05, 0.12, 16)
  const motorMaterial = new THREE.MeshStandardMaterial({ color: 0x475569 })
  const motor = new THREE.Mesh(motorGeometry, motorMaterial)
  motor.rotation.x = Math.PI / 2
  motor.position.z = -0.07
  motor.castShadow = true
  head.add(motor)

  b.group.add(head)
}

function buildWasher(spec, b) {
  const w = spec.w
  const h = spec.h
  const d = spec.d
  const front = d / 2

  b.box(w, h, d, WHITE, [0, 0, 0], { roughness: 0.3 })

  // top loader: a lid with dark glass and a control strip
  if (spec.variant === 'top') {
    b.box(w, 0.08, d, 0xcbd5e1, [0, h - 0.08, 0])
    b.box(w * 0.7, 0.01, d * 0.55, 0x1e293b, [0, h, -0.04], { roughness: 0.1, transparent: true, opacity: 0.85 })
    b.box(w * 0.5, 0.04, 0.02, 0x475569, [0, h - 0.06, front])
    return
  }

  // front loader: a control strip, a steel ring and a round glass door
  b.box(w, 0.1, 0.02, 0x475569, [0, h - 0.14, front])
  const ringGeometry = new THREE.TorusGeometry(0.2, 0.03, 12, 32)
  const ringMaterial = new THREE.MeshStandardMaterial({ color: STEEL, metalness: 0.8, roughness: 0.25 })
  const ring = new THREE.Mesh(ringGeometry, ringMaterial)
  ring.position.set(0, h * 0.42, front)
  ring.castShadow = true
  b.group.add(ring)

  const door = b.cyl(0.19, 0.02, 0x1e293b, [0, 0, front - 0.005], { roughness: 0.1, transparent: true, opacity: 0.85 })
  door.rotation.x = Math.PI / 2
  door.position.y = h * 0.42
}

function buildDishwasher(spec, b) {
  const w = spec.w
  const h = spec.h
  const d = spec.d
  const front = d / 2

  b.box(w, h, d, STEEL, [0, 0, 0], METAL)
  b.box(w * 0.96, 0.08, 0.02, 0x1f2933, [0, h - 0.1, front])
  b.box(0.03, 0.012, 0.012, 0x10b981, [w * 0.35, h - 0.06, front + 0.01], { emissive: 0x10b981, emissiveIntensity: 0.9 })
  b.box(w * 0.6, 0.02, 0.03, 0x64748b, [0, h - 0.2, front + 0.015], METAL)
}

function buildHeater(spec, b) {
  const w = spec.w
  const h = spec.h
  const d = spec.d
  const front = d / 2

  // storage water heater: a round tank
  if (spec.variant === 'storage') {
    b.cyl(w * 0.5, h * 0.9, WHITE, [0, 0.05, 0])
    b.cyl(w * 0.5, 0.05, 0xcbd5e1, [0, 0, 0])
    b.box(0.1, 0.06, 0.02, 0x1f2933, [0, h * 0.5, front])
    b.box(0.02, 0.02, 0.01, 0xef4444, [0.06, h * 0.5, front + 0.01], { emissive: 0xef4444, emissiveIntensity: 0.8 })
    return
  }

  // instant water heater: a small box with two pipes underneath
  b.box(w, h, d, WHITE, [0, 0, 0], { roughness: 0.3 })
  b.box(w * 0.7, 0.04, 0.01, 0x1f2933, [0, h * 0.6, front])
  b.cyl(0.02, 0.05, STEEL, [-w * 0.3, -0.04, 0], METAL)
  b.cyl(0.02, 0.05, STEEL, [w * 0.3, -0.04, 0], METAL)
  b.box(0.02, 0.02, 0.008, 0x38bdf8, [w * 0.35, h * 0.2, front], { emissive: 0x38bdf8, emissiveIntensity: 0.8 })
}

// Air purifier and dehumidifier look almost the same; the dehumidifier is blue.
function buildPurifier(spec, b) {
  const w = spec.w
  const h = spec.h
  const d = spec.d
  const front = d / 2

  let bodyColor = WHITE
  let lightColor = 0x10b981
  if (spec.variant === 'dehumidifier') {
    bodyColor = 0xe2e8f0
    lightColor = 0x38bdf8
  }

  b.box(w, h, d, bodyColor, [0, 0, 0], { roughness: 0.35 })
  for (let i = 0; i < 6; i++) {
    b.box(w * 0.7, 0.008, 0.01, DARK, [0, h * 0.55 + i * 0.03, front])
  }
  b.box(w * 0.5, 0.03, 0.01, 0x0f172a, [0, h - 0.1, front])
  b.box(0.03, 0.012, 0.012, lightColor, [w * 0.3, h - 0.05, front], { emissive: lightColor, emissiveIntensity: 1 })
  if (spec.variant === 'dehumidifier') {
    b.box(w * 0.7, h * 0.18, 0.02, 0x93c5fd, [0, 0.05, front], { transparent: true, opacity: 0.6 })
  }
}

// A desk with a computer: tower, monitor, keyboard and mouse.
function buildPc(spec, b) {
  const w = spec.w
  const d = spec.d
  const top = 0.74
  const slab = 0.04
  const WOOD = 0xb08968
  const LEG = 0x374151

  // desk top, four legs and a back panel
  b.box(w, slab, d, WOOD, [0, top - slab, 0], { roughness: 0.6 })
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      b.box(0.05, top - slab, 0.05, LEG, [sx * (w / 2 - 0.05), 0, sz * (d / 2 - 0.05)], METAL)
    }
  }
  b.box(w - 0.12, 0.28, 0.02, WOOD, [0, top - slab - 0.28, -d / 2 + 0.06], { roughness: 0.7 })

  // computer tower on the left
  const tx = -w / 2 + 0.2
  b.box(0.18, 0.4, 0.4, 0x1f2933, [tx, top, -0.05])
  b.box(0.015, 0.02, 0.01, 0x38bdf8, [tx, top + 0.32, 0.155], { emissive: 0x38bdf8, emissiveIntensity: 1 })

  // monitor: stand, pole, frame and screen
  const mx = 0.1
  const mz = -0.12
  b.box(0.26, 0.015, 0.2, 0x374151, [mx, top, mz])
  b.box(0.03, 0.18, 0.03, 0x374151, [mx, top + 0.015, mz])
  b.box(0.5, 0.3, 0.025, 0x111418, [mx, top + 0.2, mz])
  b.box(0.47, 0.27, 0.005, 0x0b1220, [mx, top + 0.215, mz + 0.015], { roughness: 0.05, emissive: 0x1d4ed8, emissiveIntensity: 0.25 })

  // keyboard and mouse
  b.box(0.38, 0.015, 0.13, 0x2d3748, [mx, top, 0.12])
  b.box(0.06, 0.025, 0.1, 0x2d3748, [mx + 0.34, top, 0.12])
}

// Furniture: use the function for that piece, or a plain grey box if we do not have one.
function buildFurniture(spec, b) {
  const buildPart = FURNITURE_PARTS[spec.variant]
  if (buildPart) {
    buildPart(spec, b)
    return
  }
  b.box(spec.w, spec.h, spec.d, FABRIC, [0, 0, 0])
}

function buildLamp(spec, b) {
  const h = spec.h

  b.cyl(0.11, 0.025, 0x374151, [0, 0, 0])
  b.cyl(0.01, h - 0.3, 0x374151, [0, 0.025, 0])

  // lamp shade (open cylinder, glows yellow)
  const shadeGeometry = new THREE.CylinderGeometry(0.1, 0.15, 0.25, 24, 1, true)
  const shadeMaterial = new THREE.MeshStandardMaterial({ color: 0xfff3b0, emissive: 0xffd24a, emissiveIntensity: 0.7, side: THREE.DoubleSide })
  const shade = new THREE.Mesh(shadeGeometry, shadeMaterial)
  shade.position.y = h - 0.15
  b.group.add(shade)
}

// Which function draws which kind
const BUILDERS = {
  window: buildWindow,
  door: buildDoor,
  counter: buildCounter,
  cook: buildCook,
  fridge: buildFridge,
  ac: buildAc,
  tv: buildTv,
  dryer: buildDryer,
  light: buildLight,
  ceilingfan: buildCeilingFan,
  exhaust: buildExhaust,
  standfan: buildStandFan,
  washer: buildWasher,
  dishwasher: buildDishwasher,
  heater: buildHeater,
  purifier: buildPurifier,
  pc: buildPc,
  furniture: buildFurniture,
  lamp: buildLamp,
}

// ============================================================
// createAppliance3DModel - THE MAIN FUNCTION
// ============================================================

// Builds the model for one type. The spec is saved in model.userData.spec so other files can read it.
export function createAppliance3DModel(type = '', category = '') {
  const spec = resolveSpec(type, category)
  const b = makeBuilder()

  // a kind we do not have a drawing for is drawn like a dryer
  let build = BUILDERS[spec.kind]
  if (!build) {
    build = BUILDERS.dryer
  }
  build(spec, b)

  b.group.userData.spec = spec
  return b.group
}