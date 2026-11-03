// energy.js
// The maths behind the energy overlays and the "energy planner" advice.
// It answers questions like: where does the sun fall? how hot is this spot?
// which way does the aircon blow? how much extra electricity does a bad spot cost?
//
// Receives: a room ({ w, d }), a list of items in the room (each has x, z, wall, t, rotY, kwh, spec ...)
// Gives back: numbers (0 to 1), lists of tips, and "move it here" recommendations
//
// Exports:
//   sunAt, heatAt, airDirection, throwOf  -> used by FloorPlan3D.vue (the overlays)
//   factors                               -> used by EnergyPlanner.vue
//   analyse                               -> used by ThreeDSpatial.vue
// It uses the wall helpers from placement.js.

import { NORMAL, TANGENT, wallPoint, nearestWall, wallLength, onWall, placeAt, isBlocked } from './placement.js'

// ============================================================
// NUMBERS WE USE (the "rules of thumb")
// ============================================================

// How many percent of an item's electricity each problem can add.
const WEIGHTS = {
  sun: 12,    // direct sun on an aircon or fridge
  heat: 8,    // NEA: keep the fridge away from heat sources (cooker, oven, sun); aircon works harder next to them
  air: 8,     // aircon airflow cut short by furniture
  side: 4,    // aircon needs air round it; NEA: fridge needs about 2 cm each side
  clear: 10,  // NEA: fridge needs about 5 cm at the back
  fan: 6,     // a stand fan next to / in front of an aircon fights its airflow (charged to the aircon)
  glare: 5,   // NEA: place TV and computer screens perpendicular to windows, so brightness need not go up
  corner: 5,  // NEA: put lamps in corners, where wall reflections add light
  overlap: 10, // two aircons cooling the same part of a room: the later one mostly adds running cost
  window: 10, // an aircon close to a window loses cool air and picks up the sun's heat
  reach: 10,  // rooms joined by an opened wall: an aircon should be able to cool the open area next to it
}

// The name of each problem, shown on screen.
const LABELS = {
  sun: 'Sunlight near window',
  heat: 'Nearby heat source',
  air: 'Blocked airflow',
  side: 'Too close to a side wall',
  clear: 'Too close to the wall',
  fan: 'Fan too close to the aircon',
  glare: 'Screen facing the window',
  corner: 'Lamp not in a corner',
  overlap: 'Another aircon already cools this spot',
  window: 'Too close to a window',
  reach: 'Not reaching the open area next door',
}

// The sentence used in a recommendation: "Move the ... , <reason>".
const REASONS = {
  sun: 'out of the sunlight from the window',
  heat: 'away from heat sources (cooker, dryer, dishwasher, computer)',
  air: 'where its airflow can reach more of the room',
  side: 'with a little more room beside it for air to circulate',
  clear: 'with a little breathing room behind it',
  fan: "out of the aircon's airflow and away from the unit",
  glare: 'at a right angle to the window, so the screen has less glare',
  corner: 'in a corner, where the walls reflect more of its light',
  overlap: 'away from the other aircon, so the two are not cooling the same part of the room',
  window: 'further from the window, so less cool air is lost',
  reach: 'where it can also cool the open area next to it',
  sunwindow: 'further from the window, out of its sunlight and warm air',
}

const FRIDGE_REAR_GAP = 0.05
const FRIDGE_SIDE_GAP = 0.02
const AC_SIDE_GAP = 0.2
const MAX_THROW = 3.5
const FAN_NEAR = 1.0
const FAN_PATH_REACH = 3.0
const GLARE_RANGE = 3
const CORNER_REACH = 0.6
const AC_OVERLAP_SPREAD = 3.0 // metres: two aircons closer than this mostly cool the same air
const AC_M2_PER_KW = 5 // NEA rule of thumb: cooling capacity (kW) = floor area (m²) ÷ 5
const TALL = 1.2 // appliances this tall (fridge, dryer...) block a window if they stand in front of it
const WINDOW_CLEAR = 0.8 // metres of floor in front of a window to keep clear (NEA: keep windows clear of large furniture)
const WINDOW_KEEP = 2.0 // metres: an aircon this far from a window (or glass door) loses nothing to it
const COOL_REACH = 4.5 // metres: how far an aircon's cool air is felt across an open floor
const REACH_STEP = 0.75 // spacing of the sample points used to measure how much of an open area an aircon reaches
const GOOD_TICKS = 3 // NEA checklist: choose a 3-tick air-conditioner, refrigerator or lamp
const TICKED = ['ac', 'fridge', 'lamp']
const SAME_SPOT_TOLERANCE = 0.005
const WORTH_MOVING = 0.01

// How much heat each kind of appliance gives off: [strength, how far it spreads in metres]
const HEAT_GLOW = {
  fridge: [0.5, 0.7],
  cook: [0.4, 0.6],
  dryer: [0.5, 0.8],
  dishwasher: [0.4, 0.7],
  ac: [0.15, 0.7],
  pc: [0.35, 0.6],
  tv: [0.2, 0.5],
}
const HEAT_EMITTERS = ['fridge', 'cook', 'dryer', 'dishwasher', 'pc']
const HEAT_SENSITIVE = ['ac', 'fridge']
const SCREENS = ['tv', 'pc']
const MOVABLE = ['ac', 'fridge', 'standfan', 'tv', 'pc', 'lamp']

// ============================================================
// SMALL HELPER FUNCTIONS
// ============================================================

// Keeps a number between lo and hi.
function clamp(value, lo, hi) {
  return Math.max(lo, Math.min(hi, value))
}

// A bell curve: 1 when distance is 0, and it falls towards 0 as the distance grows.
function gauss(distance, spread) {
  const ratio = distance / spread
  return Math.exp(-Math.pow(ratio, 2))
}

// Straight-line distance between two items (they have x and z).
function dist(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z)
}

// Adds up all the values inside an object, e.g. { sun: 0.1, heat: 0.2 } -> 0.3 (approximately)
function sumOf(factorObject) {
  let total = 0
  for (const key of Object.keys(factorObject)) {
    total = total + factorObject[key]
  }
  return total
}

// True when a value is undefined or null.
function isMissing(value) {
  return value === undefined || value === null
}

// ============================================================
// SUN, HEAT AND AIR
// ============================================================

// How strong the sunlight is at the point p = [x, z]: 0 (none) to 1 (full sun).
// The sun comes in through windows and makes a patch on the floor.
export function sunAt(room, items, p) {
  let best = 0
  for (const w of items) {
    if (w.spec.kind !== 'window') {
      continue
    }
    const mid = wallPoint(room, w.wall, w.t)
    const along = TANGENT[w.wall]
    const inward = NORMAL[w.wall]

    // how far into the room is p, and how far to the side of the window?
    const intoRoom = (p[0] - mid[0]) * inward[0] + (p[1] - mid[1]) * inward[1]
    if (intoRoom < -0.05) {
      continue
    }
    const sideways = Math.abs((p[0] - mid[0]) * along[0] + (p[1] - mid[1]) * along[1])

    // the patch of sun gets wider the further it goes into the room
    const patchHalfWidth = w.spec.w / 2 + 0.5 * Math.max(intoRoom, 0) + 0.3
    const outside = Math.max(0, sideways - patchHalfWidth)
    const fadeWithDistance = Math.exp(-Math.max(intoRoom, 0) / 2)
    const fadeAtEdge = Math.exp(-Math.pow(outside / 0.5, 2))
    best = Math.max(best, fadeWithDistance * fadeAtEdge)
  }
  return best
}

// How hot the point p = [x, z] is: 0 to 1. Counts the sun and the heat from nearby appliances.
export function heatAt(room, items, p) {
  let heat = sunAt(room, items, p) * 0.7
  for (const o of items) {
    const glow = HEAT_GLOW[o.spec.kind]
    if (glow) {
      heat = heat + glow[0] * gauss(Math.hypot(o.x - p[0], o.z - p[1]), glow[1])
    }
  }
  return Math.min(1, heat)
}

// The direction an item faces, as [x, z]. rotY is the turn angle of the item.
export function airDirection(item) {
  return [Math.sin(item.rotY), Math.cos(item.rotY)]
}

// From a point, walking in direction d, how far is it to the room's wall?
function distanceToWall(room, origin, d) {
  let t = Infinity
  if (d[0] > 1e-9) {
    t = Math.min(t, (room.w - origin[0]) / d[0])
  }
  if (d[0] < -1e-9) {
    t = Math.min(t, -origin[0] / d[0])
  }
  if (d[1] > 1e-9) {
    t = Math.min(t, (room.d - origin[1]) / d[1])
  }
  if (d[1] < -1e-9) {
    t = Math.min(t, -origin[1] / d[1])
  }
  return t
}

// How far an aircon's air travels before it hits a wall or a tall piece of furniture.
// options.ignoreFans = true means stand fans do not count as something in the way.
export function throwOf(room, items, ac, options = {}) {
  let ignoreFans = false
  if (options.ignoreFans) {
    ignoreFans = true
  }

  const dir = airDirection(ac)
  let reach = distanceToWall(room, [ac.x, ac.z], dir)

  for (const o of items) {
    if (o === ac || o.spec.mode !== 'floor' || o.spec.h < 1.2) {
      continue
    }
    if (ignoreFans && o.spec.kind === 'standfan') {
      continue
    }
    const vx = o.x - ac.x
    const vz = o.z - ac.z
    const ahead = vx * dir[0] + vz * dir[1]
    const sideways = Math.abs(vx * dir[1] - vz * dir[0])
    if (ahead > 0 && sideways < 0.45 && ahead < reach) {
      reach = ahead
    }
  }
  return reach
}

// How much a stand fan fights the aircon's airflow: 0 (not at all) to 1 (a lot). Uses the worst fan.
function fanClash(items, ac) {
  const dir = airDirection(ac)
  let worst = 0
  for (const o of items) {
    if (o.spec.kind !== 'standfan') {
      continue
    }
    const vx = o.x - ac.x
    const vz = o.z - ac.z
    const d = Math.hypot(vx, vz)

    let clash = 1
    if (d > FAN_NEAR) {
      clash = gauss(d - FAN_NEAR, 0.5)
    }

    // a fan standing in front of the aircon is worse
    const ahead = vx * dir[0] + vz * dir[1]
    const sideways = Math.abs(vx * dir[1] - vz * dir[0])
    if (ahead > 0 && sideways < 0.6 && ahead < FAN_PATH_REACH) {
      clash = Math.max(clash, 1 - ahead / FAN_PATH_REACH)
    }
    worst = Math.max(worst, clash)
  }
  return worst
}

// Free space (metres) on each side of item a along its wall.
function sideSpace(room, others, a) {
  let gap = Math.min(a.t, wallLength(room, a.wall) - a.t) - a.spec.w / 2
  for (const o of others) {
    if (o.wall !== a.wall || o.spec.mode === 'ceiling' || o.spec.mode === 'top' || o.spec.y !== 0) {
      continue
    }
    gap = Math.min(gap, Math.abs(a.t - o.t) - (a.spec.w + o.spec.w) / 2)
  }
  return Math.max(0, gap)
}

// How much a screen (TV or computer) faces a window: 0 (not at all) to 1 (straight at it).
function glareAt(room, others, a) {
  const faceDir = airDirection(a)
  const fx = faceDir[0]
  const fz = faceDir[1]
  let worst = 0
  for (const w of others) {
    if (w.spec.kind !== 'window') {
      continue
    }
    const inward = NORMAL[w.wall]
    const facing = fx * inward[0] + fz * inward[1]
    const mid = wallPoint(room, w.wall, w.t)
    const near = Math.exp(-Math.hypot(a.x - mid[0], a.z - mid[1]) / GLARE_RANGE)
    worst = Math.max(worst, facing * facing * near)
  }
  return worst
}

// Distance from item a to the closest corner of the room.
function cornerDistance(room, a) {
  const corners = [[0, 0], [room.w, 0], [0, room.d], [room.w, room.d]]
  let closest = Infinity
  for (const corner of corners) {
    closest = Math.min(closest, Math.hypot(a.x - corner[0], a.z - corner[1]))
  }
  return closest
}

// ============================================================
// WHICH ITEM WAS PLACED FIRST, AND GLASS
// ============================================================

// The id of an item as text (it may be called id or _id).
function idOf(x) {
  if (!isMissing(x.id)) {
    return String(x.id)
  }
  if (!isMissing(x._id)) {
    return String(x._id)
  }
  return ''
}

// The "rank" of an item is its position in the list (set in analyse). Missing means 0.
function rankOf(x) {
  if (isMissing(x.rank)) {
    return 0
  }
  return x.rank
}

// True when item o comes before item a (compare ids first, then rank).
function placedBefore(o, a) {
  const p = idOf(o)
  const q = idOf(a)
  if (p !== q) {
    return p < q
  }
  return rankOf(o) < rankOf(a)
}

// Windows and glass doors let sun and heat through.
function isGlass(spec) {
  return spec.kind === 'window' || (spec.kind === 'door' && spec.variant === 'glass')
}

// Shortest distance from point p to the line segment a-b (all are [x, z]).
function distanceToSegment(p, a, b) {
  const vx = b[0] - a[0]
  const vz = b[1] - a[1]
  const len2 = vx * vx + vz * vz
  let u = 0
  if (len2) {
    u = clamp(((p[0] - a[0]) * vx + (p[1] - a[1]) * vz) / len2, 0, 1)
  }
  return Math.hypot(p[0] - (a[0] + u * vx), p[1] - (a[1] + u * vz))
}

// Distance from point p to the nearest window or glass door.
function windowGap(room, items, p) {
  let best = Infinity
  for (const w of items) {
    // skip things that are not glass, or that are not on a wall
    if (!isGlass(w.spec) || !(w.wall >= 0)) {
      continue
    }
    const half = w.spec.w / 2
    const start = wallPoint(room, w.wall, w.t - half)
    const end = wallPoint(room, w.wall, w.t + half)
    best = Math.min(best, distanceToSegment(p, start, end))
  }
  return best
}

// ============================================================
// ROOMS JOINED BY AN OPEN WALL
// ============================================================

// Do the line p-q and the line a-b cross each other? (all are [x, z])
function segmentsCross(p, q, a, b) {
  function side(o, u, v) {
    return (u[0] - o[0]) * (v[1] - o[1]) - (u[1] - o[1]) * (v[0] - o[0])
  }
  return side(p, q, a) * side(p, q, b) <= 0 && side(a, b, p) * side(a, b, q) <= 0
}

// Does the line from "from" to "q" go through any of the openings?
function crossesAnyGap(from, q, gaps) {
  for (const gap of gaps) {
    if (segmentsCross(from, q, gap[0], gap[1])) {
      return true
    }
  }
  return false
}

// What share (0 to 1) of this room plus the open rooms next door the aircon can reach.
// We test a grid of points and count how many are close enough.
function reachShare(room, ac, link) {
  const from = [ac.x, ac.z]
  let covered = 0
  let total = 0

  // points inside this room
  for (let x = REACH_STEP / 2; x < room.w; x += REACH_STEP) {
    for (let z = REACH_STEP / 2; z < room.d; z += REACH_STEP) {
      total = total + 1
      if (Math.hypot(x - from[0], z - from[1]) <= COOL_REACH) {
        covered = covered + 1
      }
    }
  }

  // points inside each neighbour (the air must pass through the opening)
  for (const n of link.near) {
    const gaps = []
    for (const o of link.open) {
      if (o.to === n.name) {
        gaps.push([wallPoint(room, o.wall, o.t0), wallPoint(room, o.wall, o.t1)])
      }
    }
    for (let x = REACH_STEP / 2; x < n.w; x += REACH_STEP) {
      for (let z = REACH_STEP / 2; z < n.d; z += REACH_STEP) {
        total = total + 1
        const q = [x + n.dx, z + n.dz]
        if (Math.hypot(q[0] - from[0], q[1] - from[1]) <= COOL_REACH && crossesAnyGap(from, q, gaps)) {
          covered = covered + 1
        }
      }
    }
  }

  if (total) {
    return covered / total
  }
  return 1
}

// The appliances of the rooms next door (empty list when there is no link).
function foreignItems(link) {
  if (isMissing(link)) {
    return []
  }
  if (isMissing(link.foreign)) {
    return []
  }
  return link.foreign
}

// The items in this room plus the appliances from the rooms next door.
function withForeignItems(others, link) {
  const all = []
  for (const o of others) {
    all.push(o)
  }
  for (const o of foreignItems(link)) {
    all.push(o)
  }
  return all
}

// Takes the link to the open rooms and adds a "foreign" list:
// the aircons and heat sources of the next rooms, with their positions moved into this room's coordinates.
function withForeign(link) {
  if (!link) {
    return null
  }
  const near = link.near || []
  const open = link.open || []

  const foreign = []
  for (const n of near) {
    for (const o of n.items) {
      if (o.spec.kind === 'ac' || HEAT_EMITTERS.includes(o.spec.kind)) {
        foreign.push({
          id: o.id,
          name: o.name,
          x: o.x + n.dx,
          z: o.z + n.dz,
          kwh: o.kwh,
          spec: { kind: o.spec.kind, mode: 'foreign' },
        })
      }
    }
  }

  // a copy of the link with near, open and foreign filled in
  const result = {}
  for (const key of Object.keys(link)) {
    result[key] = link[key]
  }
  result.near = near
  result.open = open
  result.foreign = foreign
  return result
}

// ============================================================
// FACTORS - WHAT IS WRONG WITH THE SPOT OF ONE ITEM
// ============================================================

// Gives an object like { sun: 0.03, heat: 0.01 } for item a.
// Each number is the extra share of electricity (0.03 = 3%) caused by that problem.
// options.ownOnly = true leaves out problems caused by other items (the fan).
// options.link = the open rooms next door (or null).
export function factors(room, others, a, options = {}) {
  let ownOnly = false
  if (options.ownOnly) {
    ownOnly = true
  }
  let link = null
  if (options.link !== undefined) {
    link = options.link
  }

  const kind = a.spec.kind
  const p = [a.x, a.z]
  const f = {}
  if (!MOVABLE.includes(kind)) {
    return f
  }

  // aircons and fridges: sun and nearby heat
  if (HEAT_SENSITIVE.includes(kind)) {
    f.sun = (WEIGHTS.sun / 100) * sunAt(room, others, p)

    let heat = 0
    const everything = withForeignItems(others, link)
    for (const o of everything) {
      if (HEAT_EMITTERS.includes(o.spec.kind)) {
        heat = heat + gauss(dist(a, o), 0.8)
      }
    }
    f.heat = (WEIGHTS.heat / 100) * Math.min(1, heat)
  }

  // fridge: space behind it and beside it
  if (kind === 'fridge') {
    const gap = Math.max(0, nearestWall(room, p).d - a.spec.d / 2)
    f.clear = (WEIGHTS.clear / 100) * Math.max(0, FRIDGE_REAR_GAP - gap) / FRIDGE_REAR_GAP
    if (a.wall >= 0) {
      f.side = (WEIGHTS.side / 100) * Math.max(0, FRIDGE_SIDE_GAP - sideSpace(room, others, a)) / FRIDGE_SIDE_GAP
    }
  }

  // aircon: airflow, side space, fan, other aircons, window, open rooms
  if (kind === 'ac') {
    const wanted = Math.min(MAX_THROW, 0.8 * Math.max(room.w, room.d))
    const thrown = throwOf(room, others, a, { ignoreFans: true })
    f.air = (WEIGHTS.air / 100) * (1 - Math.min(1, thrown / wanted))

    if (a.wall >= 0) {
      const sideSpaceAc = Math.min(a.t, wallLength(room, a.wall) - a.t) - a.spec.w / 2
      f.side = (WEIGHTS.side / 100) * Math.max(0, AC_SIDE_GAP - sideSpaceAc) / AC_SIDE_GAP
    }

    if (!ownOnly) {
      f.fan = (WEIGHTS.fan / 100) * fanClash(others, a)
    }

    let overlap = 0
    const everything = withForeignItems(others, link)
    for (const o of everything) {
      if (o.spec.kind === 'ac' && placedBefore(o, a)) {
        overlap = Math.max(overlap, gauss(dist(a, o), AC_OVERLAP_SPREAD))
      }
    }
    f.overlap = (WEIGHTS.overlap / 100) * overlap

    f.window = (WEIGHTS.window / 100) * clamp(1 - windowGap(room, others, p) / WINDOW_KEEP, 0, 1)

    if (link && link.near && link.near.length) {
      f.reach = (WEIGHTS.reach / 100) * (1 - reachShare(room, a, link))
    }
  }

  // screens: glare from windows
  if (SCREENS.includes(kind)) {
    f.glare = (WEIGHTS.glare / 100) * glareAt(room, others, a)
  }

  // lamps: should be in a corner
  if (kind === 'lamp') {
    f.corner = (WEIGHTS.corner / 100) * clamp((cornerDistance(room, a) - CORNER_REACH) / 1.4, 0, 1)
  }
  return f
}

// ============================================================
// FINDING A BETTER SPOT
// ============================================================

// The openings (gaps) between this room and the next ones.
function openingsOf(link) {
  if (isMissing(link)) {
    return []
  }
  if (!link.open) {
    return []
  }
  return link.open
}

// True when the position pos would sit in front of one of the openings.
function inFrontOfOpening(pos, a, openings) {
  for (const o of openings) {
    if (o.wall === pos.wall && o.t0 < pos.t + a.spec.w / 2 && o.t1 > pos.t - a.spec.w / 2) {
      return true
    }
  }
  return false
}

// A list of positions to try for item a: along every wall, small steps near where it is now,
// and (for floor items) a grid across the floor.
function candidates(room, a, others, link) {
  const out = []

  // along every wall
  for (let wall = 0; wall < 4; wall++) {
    const length = wallLength(room, wall)
    for (let t = 0.3; t < length - 0.3; t += 0.25) {
      const pos = onWall(room, a.spec, wall, t)
      if (pos) {
        out.push(pos)
      }
    }
  }

  // small moves from the current spot on the same wall
  if (a.wall >= 0) {
    for (const step of [0.03, 0.06, 0.1, 0.15, 0.2]) {
      for (const sign of [-1, 1]) {
        const pos = onWall(room, a.spec, a.wall, a.t + sign * step)
        if (pos) {
          out.push(pos)
        }
      }
    }
  }

  // a grid across the floor
  if (a.spec.mode === 'floor') {
    for (let x = 0.3; x < room.w; x += 0.25) {
      for (let z = 0.3; z < room.d; z += 0.25) {
        const pos = placeAt(room, a.spec, [x, z], a, others)
        if (pos && pos.wall < 0) {
          out.push(pos)
        }
      }
    }
  }

  // do not suggest a spot in front of an opening between rooms
  const openings = openingsOf(link)
  const allowed = []
  for (const pos of out) {
    if (pos.wall < 0 || !inFrontOfOpening(pos, a, openings)) {
      allowed.push(pos)
    }
  }
  return allowed
}

// The extra electricity of putting item "test" in its spot.
// own = the problems with the spot, knock = extra electricity a stand fan causes the aircons.
function costOf(room, others, test, a, link) {
  const own = factors(room, others, test, { ownOnly: true, link: link })

  let knock = 0
  if (test.spec.kind === 'standfan') {
    const withFan = []
    for (const o of others) {
      withFan.push(o)
    }
    withFan.push(test)
    for (const ac of others) {
      if (ac.spec.kind === 'ac' && ac.kwh > 0) {
        knock = knock + ac.kwh * (WEIGHTS.fan / 100) * fanClash(withFan, ac)
      }
    }
  }
  return { own: own, knock: knock, kwh: a.kwh * sumOf(own) + knock }
}

// A copy of item a with the new position pos put on top of it.
function movedCopy(a, pos) {
  const copy = {}
  for (const key of Object.keys(a)) {
    copy[key] = a[key]
  }
  for (const key of Object.keys(pos)) {
    copy[key] = pos[key]
  }
  return copy
}

// Tries every candidate spot and returns the one that costs the least electricity.
// If several are almost as good, it takes the one closest to where the item is now.
function findBestSpot(room, a, others, link) {
  const tried = []
  for (const pos of candidates(room, a, others, link)) {
    const test = movedCopy(a, pos)
    if (isBlocked(test, others)) {
      continue
    }
    const cost = costOf(room, others, test, a, link)
    tried.push({ pos: pos, own: cost.own, knock: cost.knock, kwh: cost.kwh })
  }
  if (!tried.length) {
    return null
  }

  // the lowest cost of all the spots
  let lowest = Infinity
  for (const s of tried) {
    lowest = Math.min(lowest, s.kwh)
  }

  // how much electricity is at stake (a stand fan also affects the aircons)
  let stake = a.kwh
  if (a.spec.kind === 'standfan') {
    let acKwh = 0
    for (const o of others) {
      if (o.spec.kind === 'ac') {
        acKwh = acKwh + o.kwh
      }
    }
    stake = a.kwh + acKwh
  }

  // keep the spots that are nearly as good as the best one
  const nearlyBest = []
  for (const s of tried) {
    if (s.kwh <= lowest + SAME_SPOT_TOLERANCE * Math.max(stake, 20)) {
      nearlyBest.push(s)
    }
  }

  // and of those, pick the closest to the current spot
  let closest = nearlyBest[0]
  for (let i = 1; i < nearlyBest.length; i++) {
    if (dist(a, nearlyBest[i].pos) < dist(a, closest.pos)) {
      closest = nearlyBest[i]
    }
  }
  return closest
}

// ============================================================
// WORDS FOR THE ADVICE TEXT
// ============================================================

// The compass direction of a move: 'north', 'south', 'east' or 'west'.
function compass(dx, dz) {
  if (Math.abs(dx) > Math.abs(dz)) {
    if (dx > 0) {
      return 'east'
    }
    return 'west'
  }
  if (dz > 0) {
    return 'south'
  }
  return 'north'
}

// Joins reasons into one sentence: "a", "a and b", "a, b and c".
function joinReasons(list) {
  if (list.length < 2) {
    return list.join('')
  }
  return list.slice(0, -1).join(', ') + ' and ' + list[list.length - 1]
}

// 12.3 -> "12 kWh", 4.56 -> "4.6 kWh"
function kwhText(v) {
  if (v >= 10) {
    return Math.round(v) + ' kWh'
  }
  return v.toFixed(1) + ' kWh'
}

// A distance in metres as text: "35 cm" or "1.2 m".
function howFar(m) {
  if (m < 0.1) {
    return Math.max(1, Math.round(m * 100)) + ' cm'
  }
  return m.toFixed(1) + ' m'
}

// ============================================================
// TIPS (general advice that is not about one exact spot)
// ============================================================

function tipsFor(room, items, roomName, link) {
  const tips = []
  const area = room.w * room.d

  const acs = []
  for (const o of items) {
    if (o.spec.kind === 'ac') {
      acs.push(o)
    }
  }

  // two aircons in a small room
  if (!link && acs.length >= 2 && area / AC_M2_PER_KW <= 5) {
    const lastAc = acs[acs.length - 1]
    tips.push({
      id: lastAc.id,
      text: `${roomName} is about ${area.toFixed(0)} m², which needs roughly ${(area / AC_M2_PER_KW).toFixed(1)} kW of cooling (NEA rule of thumb: floor area ÷ 5). One aircon is enough here; a second one mostly adds running cost, so consider keeping it for another room.`,
    })
  }

  // advice for rooms joined by an open wall
  const openTips = openSpaceTips(roomName, area, acs, link)
  for (const tip of openTips) {
    tips.push(tip)
  }

  // an aircon but no fan
  let hasFan = false
  for (const o of items) {
    if (o.spec.kind === 'standfan') {
      hasFan = true
    }
  }
  if (acs.length && !hasFan) {
    tips.push({
      id: acs[0].id,
      text: `Add a fan to ${roomName}. NEA says using a fan instead of the aircon can save about $460 a year, so keep the aircon for the hottest hours.`,
    })
  }

  for (const o of items) {
    // low-tick models
    if (TICKED.includes(o.spec.kind) && o.ticks && o.ticks < GOOD_TICKS) {
      tips.push({
        id: o.id,
        text: `The ${o.name} is a ${o.ticks}-tick model. NEA suggests ${GOOD_TICKS} ticks or better: it costs more to buy but saves on electricity over its lifespan.`,
      })
    }

    // tall things standing in front of a window
    if (o.spec.mode === 'floor' && o.spec.h >= TALL) {
      for (const w of items) {
        if (w.spec.kind !== 'window') {
          continue
        }
        const mid = wallPoint(room, w.wall, w.t)
        const along = TANGENT[w.wall]
        const inward = NORMAL[w.wall]
        const into = (o.x - mid[0]) * inward[0] + (o.z - mid[1]) * inward[1]
        const side = Math.abs((o.x - mid[0]) * along[0] + (o.z - mid[1]) * along[1])
        if (into > -0.05 && into < WINDOW_CLEAR + o.spec.d / 2 && side < (w.spec.w + o.spec.w) / 2) {
          tips.push({
            id: o.id,
            text: `The ${o.name} stands in front of a window. NEA advises keeping windows clear of large furniture so air can flow through the room.`,
          })
          break
        }
      }
    }
  }
  return tips
}

// Advice when this room is open to other rooms (one big shared space).
function openSpaceTips(roomName, area, acs, link) {
  if (!link || !link.near || !link.near.length) {
    return []
  }

  // names of all the rooms in the open space, and the text "A, B and C"
  const names = [roomName]
  const nearNames = []
  let nearArea = 0
  for (const n of link.near) {
    names.push(n.name)
    nearNames.push(n.name)
    nearArea = nearArea + n.w * n.d
  }
  let together = ''
  if (names.length === 2) {
    together = `${names[0]} and ${names[1]}`
  } else {
    together = `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
  }

  const totalArea = area + nearArea
  const kw = (totalArea / AC_M2_PER_KW).toFixed(1)

  // count the aircons in this room and in the rooms next door
  let otherAcCount = 0
  for (const o of link.foreign) {
    if (o.spec.kind === 'ac') {
      otherAcCount = otherAcCount + 1
    }
  }
  const allCount = acs.length + otherAcCount

  if (!allCount) {
    return []
  }
  if (!acs.length) {
    return [{ id: null, text: `${roomName} is open to ${nearNames.join(' and ')}, so the aircon there can cool this space too. Put it close to the opening so its air reaches both, rather than adding another aircon here.` }]
  }
  if (allCount >= 2 && totalArea / AC_M2_PER_KW <= 5) {
    return [{ id: acs[acs.length - 1].id, text: `${together} are now one open space of about ${totalArea.toFixed(0)} m², which needs roughly ${kw} kW of cooling (NEA rule of thumb: floor area ÷ 5). One aircon placed near the opening can serve both, so a second one mostly adds running cost.` }]
  }
  if (allCount === 1 && totalArea / AC_M2_PER_KW <= 5) {
    return [{ id: acs[0].id, text: `${together} are one open space of about ${totalArea.toFixed(0)} m² (roughly ${kw} kW of cooling). This one aircon can serve both if it sits near the opening.` }]
  }
  if (allCount >= 2) {
    return [{ id: null, text: `${together} are one open space of about ${totalArea.toFixed(0)} m² (roughly ${kw} kW of cooling), more than one aircon covers. Two is reasonable here, but keep them well apart so each cools its own end.` }]
  }
  return [{ id: acs[0].id, text: `${together} are one open space of about ${totalArea.toFixed(0)} m² (roughly ${kw} kW of cooling). One aircon will struggle to cool the far end, so keep it near the opening and use a fan to move the air.` }]
}

// ============================================================
// analyse - THE MAIN FUNCTION
// ============================================================

// Looks at every item in a room and works out:
//   rows  - for each item: its normal kWh, its kWh with its current problems, and how much could be avoided
//   recs  - "move it here" recommendations, biggest saving first
//   tips  - general advice
// roomName is only used in the advice text. openLink describes rooms joined by an open wall (or null).
export function analyse(room, items, roomName = 'room', openLink = null) {
  const link = withForeign(openLink)
  const rows = []
  const recs = []

  // remember the order of the items (used to decide which of two aircons came first)
  for (let i = 0; i < items.length; i++) {
    items[i].rank = i
  }

  for (const a of items) {
    if (a.kwh <= 0) {
      continue
    }
    const others = []
    for (const o of items) {
      if (o !== a) {
        others.push(o)
      }
    }

    // the problems with the current spot
    const full = factors(room, others, a, { link: link })
    const now = costOf(room, others, a, a, link)
    const nowPenalty = sumOf(full)

    // look for a better spot; "avoidable" is how much of each problem the better spot would remove
    const avoidable = {}
    let best = null
    if (now.kwh > 0) {
      const found = findBestSpot(room, a, others, link)
      if (found && now.kwh - found.kwh >= WORTH_MOVING * a.kwh) {
        best = found
        for (const key of Object.keys(now.own)) {
          let better = 0
          if (!isMissing(found.own[key])) {
            better = found.own[key]
          }
          avoidable[key] = Math.max(0, now.own[key] - better)
        }
      }
    }
    const avoidFraction = sumOf(avoidable)
    let knockSaved = 0
    if (best) {
      knockSaved = Math.max(0, now.knock - best.knock)
    }
    const avoidKwh = a.kwh * avoidFraction + knockSaved

    // the problems that can be avoided, as a list for the screen
    const rowFactors = []
    for (const key of Object.keys(avoidable)) {
      if (avoidable[key] > 0.001) {
        rowFactors.push({ key: key, label: LABELS[key], pct: avoidable[key] * 100 })
      }
    }
    let causedByOthers = []
    if (full.fan > 0.001) {
      causedByOthers = [{ key: 'fan', label: LABELS.fan, pct: full.fan * 100 }]
    }
    let knockOn = []
    if (knockSaved >= 0.5) {
      knockOn = [{ label: 'aircon', kwh: knockSaved }]
    }

    rows.push({
      id: a.id,
      base: a.kwh,
      kwh: a.kwh * (1 + nowPenalty),
      avoidKwh: avoidKwh,
      factors: rowFactors,
      causedByOthers: causedByOthers,
      knockOn: knockOn,
    })

    // no better spot, so no recommendation
    if (!best) {
      continue
    }
    const moveX = best.pos.x - a.x
    const moveZ = best.pos.z - a.z
    const distance = Math.hypot(moveX, moveZ)
    if (distance < 0.02 || (avoidFraction < WORTH_MOVING && knockSaved < 1)) {
      continue
    }

    // the reasons, biggest first
    const reasonList = []
    for (const key of Object.keys(avoidable)) {
      if (avoidable[key] > 0.002) {
        reasonList.push({ key: key, value: avoidable[key] })
      }
    }
    reasonList.sort(function (x, y) {
      return y.value - x.value
    })
    let reasonKeys = []
    for (const r of reasonList) {
      reasonKeys.push(r.key)
    }

    // The sun and the window are one reason to the reader: "further from the window, out of its sunlight".
    if (reasonKeys.includes('sun') && reasonKeys.includes('window')) {
      const merged = []
      for (const k of reasonKeys) {
        if (k === 'window') {
          continue
        }
        if (k === 'sun') {
          merged.push('sunwindow')
        } else {
          merged.push(k)
        }
      }
      reasonKeys = merged
    }
    if (knockSaved >= 1) {
      reasonKeys.push('fan')
    }

    // what the move should save
    const effects = []
    if (avoidFraction >= WORTH_MOVING) {
      effects.push(`It should use about ${(avoidFraction * 100).toFixed(0)}% less (around ${kwhText(a.kwh * avoidFraction)} a year)`)
    }
    if (knockSaved >= 1) {
      let start = 'It'
      if (effects.length) {
        start = 'and it'
      }
      effects.push(`${start} should cut the aircon's use by about ${kwhText(knockSaved)} a year`)
    }

    const reasonTexts = []
    for (const k of reasonKeys) {
      reasonTexts.push(REASONS[k])
    }
    recs.push({
      id: a.id,
      to: best.pos,
      savedKwh: avoidKwh,
      text: `Move the ${a.name} ${howFar(distance)} ${compass(moveX, moveZ)}, ${joinReasons(reasonTexts)}. ${effects.join(' ')}.`,
    })
  }

  // totals for the whole room
  let base = 0
  let kwh = 0
  let totalAvoid = 0
  for (const r of rows) {
    base = base + r.base
  }
  for (const r of rows) {
    kwh = kwh + r.kwh
  }
  for (const r of rows) {
    totalAvoid = totalAvoid + r.avoidKwh
  }
  let avoidPct = 0
  if (base) {
    avoidPct = (totalAvoid / base) * 100
  }

  // biggest saving first
  recs.sort(function (x, y) {
    return y.savedKwh - x.savedKwh
  })

  return {
    rows: rows,
    base: base,
    kwh: kwh,
    avoidKwh: totalAvoid,
    avoidPct: avoidPct,
    recs: recs,
    tips: tipsFor(room, items, roomName, link),
  }
}
