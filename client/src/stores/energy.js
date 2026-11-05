import { NORMAL, TANGENT, wallPoint, nearestWall, wallLength, onWall, placeAt, isBlocked } from './placement.js'
import { RULES, ruleApplies, ruleTip, tipText, recText } from '../data/placementRules.js'

// ============================================================
// NUMBERS WE USE (the "rules of thumb")
// ============================================================

// How many percent of an item's electricity each problem can add.
const WEIGHTS = {
  sun: 12,    // direct sun on an aircon or fridge
  heat: 14,   // NEA: keep the fridge away from heat sources (cooker, oven, sun); aircon works harder next to them
  air: 8,     // aircon airflow cut short by furniture
  side: 4,    // aircon needs air round it; NEA: fridge needs about 2 cm each side
  clear: 10,  // NEA: fridge needs about 5 cm at the back
  fan: 6,     // a stand fan next to / in front of an aircon fights its airflow (charged to the aircon)
  glare: 5,   // NEA: place TV and computer screens perpendicular to windows, so brightness need not go up
  beside: 5,  // guide: put a floor lamp beside a sofa, armchair or study desk, where its light is used
  door: 3,    // fridge door blocked by something in front of it, so it stays open longer
  good: 4,    // credit (a saving, not a cost): the most an item earns for standing where nothing works against it
  cramped: 5, // dryer, purifier, computer or portable aircon squeezed in with no air on both sides
  overlap: 10, // two aircons cooling the same part of a room: the later one mostly adds running cost
  window: 10, // an aircon close to a window loses cool air and picks up the sun's heat
  sunMild: 4, // direct sun on a screen, washer or kitchen appliance (milder than on an aircon or fridge)
  occupied: 6, // fan or air purifier far from where people sit or sleep: its air does not reach them
  sink: 4,    // dishwasher and kettle belong near the sink and water
  extract: 5, // induction cooker and air fryer: cooking heat and steam should reach the exhaust fan
  cookzone: 8, // exhaust fan far from the cooking: it removes heat at the source only when close
  group: 3,   // washer + dryer together, kitchen appliances together (NEA layout principle)
  centre: 5,  // ceiling light / fan away from the middle of the room or of where people sit
  hose: 8,    // portable aircon: its hot-air hose must be short, so it stays close to a window
  outdoor: 3, // air purifier right beside a window keeps pulling in outdoor air
  draft: 6,   // aircon air blowing straight onto a bed or seat (uncomfortable, so people turn the temperature down)
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
  beside: 'Lamp away from seating',
  good: 'Not in the best spot',
  door: 'Fridge door blocked',
  cramped: 'Squeezed in on both sides',
  overlap: 'Another aircon already cools this spot',
  window: 'Too close to a window',
  reach: 'Not reaching the open area next door',
  draft: 'Airflow aimed at a bed or seat',
  occupied: 'Far from where people sit or sleep',
  sink: 'Far from the sink',
  extract: 'Far from the exhaust fan',
  cookzone: 'Far from the cooking area',
  group: 'Apart from the appliances it works with',
  centre: 'Not in the middle of the room',
  hose: 'Far from a window for the hose',
  outdoor: 'Beside a window',
}

// The reason in a recommendation. 
const REASONS = {
  sun: 'keeps it out of the sunlight from the window',
  heat: 'keeps it away from heat sources (cooker, dryer, dishwasher, computer)',
  air: 'lets its airflow reach more of the room',
  side: 'leaves more room beside it for air to circulate',
  clear: 'leaves more room behind it for air to circulate',
  fan: "keeps it out of the aircon's airflow and away from the unit",
  glare: 'turns the screen at a right angle to the window, so there is less glare',
  beside: 'puts it beside a sofa, armchair or study desk, where its light is used',
  overlap: 'keeps it away from the other aircon, so the two do not cool the same part of the room',
  window: 'moves it away from the window, so less cool air is lost',
  reach: 'lets it also cool the open area next to it',
  draft: 'stops its airflow blowing straight onto a bed or seat',
  occupied: 'brings it closer to where people sit or sleep, so its air reaches them',
  sink: 'brings it closer to the sink and water connections',
  extract: 'brings it closer to the exhaust fan, so cooking heat and steam are taken out at once',
  cookzone: 'brings it closer to the cooking area, so it removes heat and steam at the source',
  group: 'puts it next to the appliances it is used with',
  centre: 'brings it nearer the middle, so its light or air spreads evenly',
  hose: 'brings it closer to a window, so the exhaust hose stays short',
  outdoor: 'moves it away from the window, so it does not keep pulling in outdoor air',
  door: 'leaves room in front of it so its door can open fully',
  good: 'leaves nothing else working against it',
  cramped: 'leaves air space on at least one side of it',
  sunwindow: 'moves it away from the window, out of its sunlight and warm air',
  others: 'stops it adding to the running cost of the other aircon and appliances near it',
}

// The names of all the problems factors() can report, and of the checks that show tips (used by the tests).
export const FACTOR_KEYS = Object.keys(WEIGHTS)

const FRIDGE_REAR_GAP = 0.05
const FRIDGE_SIDE_GAP = 0.02
const AC_SIDE_GAP = 0.2
const MAX_THROW = 3.5
const FAN_NEAR = 1.0
const FAN_PATH_REACH = 3.0
const GLARE_RANGE = 3
const FRIDGE_DOOR_SWING = 0.6 // metres of floor in front of a fridge that its door needs
const CRAMP_GAP = 0.1 // metres of free space on a side below which an item counts as squeezed in
const LAMP_NEAR = 0.8 // metres from the edge of seating or a desk: a floor lamp this close is well placed
const WARDROBE_HEAT_RANGE = 0.5 // metres between the edges: a wardrobe this close to a heat source is too near
const DESK_GLARE = 0.5 // a desk facing a window more than this (0 to 1) should be turned
const LAMP_SHADE_RANGE = 0.5 // metres: tall things this close to a floor lamp block its light
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
const SAME_SPOT_MAX_KWH = 0.5 // spots count as tied only if they are within this many kWh a year, however big the appliance is
const FLOOR_STEP = 0.5 // metres between the spots tried across the floor or ceiling (the fine search closes the gaps)
const REFINE_STEPS = [0.25, 0.12, 0.06, 0.03] // metres: the fine search along a wall moves in smaller and smaller steps
const REFINE_SPOTS = 2 // how many separate good areas get a fine search
const MIN_SAVING_KWH = 1 // a move must save at least this many kWh a year to be recommended (so no real saving is hidden)

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
const HEAT_SENSITIVE = ['ac', 'fridge', 'dryer', 'pc'] // guide: away from sun and heat sources
const SUN_MILD = ['tv', 'pc', 'washer', 'cook'] // guide: avoid direct sun on screens, washers and kitchen appliances
const SCREENS = ['tv', 'pc']
const SEATING = ['bed_single', 'bed_queen', 'sofa_3_seater', 'sofa_2_seater', 'armchair', 'dining_table']
const CRAMPED_KINDS = ['dryer', 'purifier', 'pc'] // kinds that need air round them (a portable aircon too)
const LAMP_TARGETS = ['sofa_3_seater', 'sofa_2_seater', 'armchair', 'study_desk']
// Credits for good placement: the most (in percent) each kind of item can save, and the penalty level at which the credit is gone.
const GOOD_MAX = { ac: 4, fridge: 3, dryer: 2, pc: 2, tv: 2, lamp: 2, standfan: 3, purifier: 2, ceilingfan: 2 }
const GOOD_LIMIT = 0.03
// Safety rails on one item: its placement penalties can add at most 40%, and its credits can take off at most 10%.
export const MAX_PENALTY = 0.4
export const MAX_CREDIT = 0.1
const HEAT_SPREAD = 0.6 // metres of empty gap over which a heat source's effect fades (edge to edge)
const MOVABLE = ['ac', 'fridge', 'standfan', 'tv', 'pc', 'lamp', 'dryer', 'washer', 'cook', 'dishwasher', 'purifier', 'light', 'ceilingfan', 'exhaust']

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

// The empty space (metres) between the edges of two items, roughly: the distance between their middles
// minus half the size of each. Items from the next room have no size, so they count as a point.
function edgeGap(a, b) {
  return Math.max(0, dist(a, b) - halfSize(a) - halfSize(b))
}

// Half the typical width of an item (0 when its size is not known).
function halfSize(item) {
  if (isMissing(item.spec.w) || isMissing(item.spec.d)) {
    return 0
  }
  return (item.spec.w + item.spec.d) / 4
}

// Adds up all the values inside an object
function sumOf(factorObject) {
  let total = 0
  for (const key of Object.keys(factorObject)) {
    total = total + factorObject[key]
  }
  return total
}

// The total of the problems in the object. Negative numbers do not count.
function penaltyOf(factorObject) {
  let total = 0
  for (const key of Object.keys(factorObject)) {
    if (factorObject[key] > 0) {
      total = total + factorObject[key]
    }
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

// How strong the sunlight is at the point
export function sunAt(room, items, p) {
  let best = 0
  for (const w of items) {
    if (!isGlass(w.spec) || !(w.wall >= 0)) {
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

// How much an aircon blows straight onto a bed, sofa or dining table: 0 (not at all) to 1 (right in front of it).
function draftAt(items, ac) {
  const dir = airDirection(ac)
  let worst = 0
  for (const o of items) {
    if (o.spec.kind !== 'furniture' || !SEATING.includes(o.spec.variant)) {
      continue
    }
    const vx = o.x - ac.x
    const vz = o.z - ac.z
    const ahead = vx * dir[0] + vz * dir[1]
    const sideways = Math.abs(vx * dir[1] - vz * dir[0])
    if (ahead > 0 && ahead < MAX_THROW && sideways < 0.8) {
      worst = Math.max(worst, 1 - ahead / MAX_THROW)
    }
  }
  return worst
}

// Free space (metres) on each side of item a along its wall, as [low side, high side].
function sideGaps(room, others, a) {
  let low = a.t - a.spec.w / 2
  let high = wallLength(room, a.wall) - a.t - a.spec.w / 2
  for (const o of others) {
    if (o.wall !== a.wall || o.spec.mode === 'ceiling' || o.spec.mode === 'top' || o.spec.y !== 0) {
      continue
    }
    const gap = Math.abs(a.t - o.t) - (a.spec.w + o.spec.w) / 2
    if (o.t < a.t) {
      low = Math.min(low, gap)
    } else {
      high = Math.min(high, gap)
    }
  }
  return [Math.max(0, low), Math.max(0, high)]
}

// Free space (metres) on the tighter side of item a along its wall.
function sideSpace(room, others, a) {
  const gaps = sideGaps(room, others, a)
  return Math.min(gaps[0], gaps[1])
}

// How squeezed in item a is: 0 (air on at least one side) to 1 (no air on either side).
function squeezed(room, others, a) {
  const gaps = sideGaps(room, others, a)
  let total = 1
  for (const gap of gaps) {
    total = total * (1 - clamp(gap / CRAMP_GAP, 0, 1))
  }
  return total
}

// How much the door of a fridge is blocked: 0 (clear) to 1 (something right in front of it).
function doorBlocked(others, a) {
  const dir = airDirection(a)
  let worst = 0
  for (const o of others) {
    if (o === a || (o.spec.mode !== 'floor' && o.spec.kind !== 'counter')) {
      continue
    }
    const vx = o.x - a.x
    const vz = o.z - a.z
    const ahead = vx * dir[0] + vz * dir[1]
    const sideways = Math.abs(vx * dir[1] - vz * dir[0])
    const half = Math.min(o.spec.w, o.spec.d) / 2
    const free = ahead - a.spec.d / 2 - half
    if (ahead > 0 && sideways < a.spec.w / 2 + half && free < FRIDGE_DOOR_SWING) {
      worst = Math.max(worst, clamp((FRIDGE_DOOR_SWING - free) / FRIDGE_DOOR_SWING, 0, 1))
    }
  }
  return worst
}

// How much a screen (TV or computer) faces a window: 0 (not at all) to 1 (straight at it).
function glareAt(room, others, a) {
  const faceDir = airDirection(a)
  const fx = faceDir[0]
  const fz = faceDir[1]
  let worst = 0
  for (const w of others) {
    if (!isGlass(w.spec) || !(w.wall >= 0)) {
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

// How much of the cool air of aircon a is already given by an earlier aircon: 0 (none) to 1 (the same air).
// Only an aircon placed BEFORE a counts, so the later one is the one that pays for the overlap.
function overlapOf(a, list, extra) {
  let overlap = 0
  for (let i = 0; i <= list.length; i++) {
    const o = i < list.length ? list[i] : extra
    if (o && o !== a && o.spec.kind === 'ac' && placedBefore(o, a)) {
      overlap = Math.max(overlap, gauss(dist(a, o), AC_OVERLAP_SPREAD))
    }
  }
  return overlap
}

// How much heat from nearby heat sources reaches item a: 0 (none) to 1 (a lot).
function heatOf(a, list, extra) {
  let heat = 0
  for (let i = 0; i <= list.length; i++) {
    const o = i < list.length ? list[i] : extra
    if (o && o !== a && HEAT_EMITTERS.includes(o.spec.kind)) {
      heat = heat + gauss(edgeGap(a, o), HEAT_SPREAD)
    }
  }
  return Math.min(1, heat)
}

// Gives an object like { sun: 0.03, heat: 0.01 } for item a.
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

  // sun: strong for aircons, fridges, dryers; milder for screens, washers and kitchen appliances
  if (HEAT_SENSITIVE.includes(kind) || SUN_MILD.includes(kind)) {
    let sunWeight = WEIGHTS.sun
    if (SUN_MILD.includes(kind)) {
      sunWeight = WEIGHTS.sunMild
    }
    f.sun = (sunWeight / 100) * sunAt(room, others, p)
  }

  // nearby heat (aircons, fridges, dryers, computers)
  if (HEAT_SENSITIVE.includes(kind)) {
    f.heat = (WEIGHTS.heat / 100) * heatOf(a, withForeignItems(others, link), null)
  }

  // fridge: space behind it and beside it
  if (kind === 'fridge') {
    const gap = Math.max(0, nearestWall(room, p).d - a.spec.d / 2)
    f.clear = (WEIGHTS.clear / 100) * Math.max(0, FRIDGE_REAR_GAP - gap) / FRIDGE_REAR_GAP
    if (a.wall >= 0) {
      f.side = (WEIGHTS.side / 100) * Math.max(0, FRIDGE_SIDE_GAP - sideSpace(room, others, a)) / FRIDGE_SIDE_GAP
    }
    f.door = (WEIGHTS.door / 100) * doorBlocked(others, a)
  }

  // dryer, purifier, dehumidifier, computer tower and portable aircon: need air on at least one side
  if ((CRAMPED_KINDS.includes(kind) || (kind === 'ac' && a.spec.variant === 'portable')) && a.wall >= 0) {
    f.cramped = (WEIGHTS.cramped / 100) * squeezed(room, others, a)
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

    f.overlap = (WEIGHTS.overlap / 100) * overlapOf(a, withForeignItems(others, link), null)

    f.draft = (WEIGHTS.draft / 100) * draftAt(others, a)

    // a normal aircon loses cool air next to glass; a portable one needs a window close by for its hose;
    // a window aircon is built into the window, so neither rule applies to it
    if (a.spec.variant === 'portable') {
      f.hose = (WEIGHTS.hose / 100) * farness(windowGap(room, others, p), 1.0, 2.0)
    } else if (a.spec.variant !== 'window') {
      f.window = (WEIGHTS.window / 100) * clamp(1 - windowGap(room, others, p) / WINDOW_KEEP, 0, 1)
    }

    // sun and window are one problem to the reader (the same window), so together they cost no more than the sun alone
    if (!isMissing(f.sun) && !isMissing(f.window) && f.sun + f.window > WEIGHTS.sun / 100) {
      const scale = (WEIGHTS.sun / 100) / (f.sun + f.window)
      f.sun = f.sun * scale
      f.window = f.window * scale
    }

    if (link && link.near && link.near.length) {
      f.reach = (WEIGHTS.reach / 100) * (1 - reachShare(room, a, link))
    }
  }

  // screens: glare from windows
  if (SCREENS.includes(kind)) {
    f.glare = (WEIGHTS.glare / 100) * glareAt(room, others, a)
  }

  neighbourFactors(room, others, a, f)

  // floor lamps: beside a sofa, armchair or study desk
  if (kind === 'lamp') {
    let seatDistance = Infinity
    for (const o of others) {
      if (o.spec.kind === 'furniture' && LAMP_TARGETS.includes(o.spec.variant)) {
        seatDistance = Math.min(seatDistance, Math.max(0, dist(a, o) - Math.max(o.spec.w, o.spec.d) / 2))
      }
    }
    f.beside = (WEIGHTS.beside / 100) * farness(seatDistance, LAMP_NEAR, 2.0)
  }

  // a credit when nothing works against the item: full credit with no penalties, none at GOOD_LIMIT or more
  if (GOOD_MAX[kind]) {
    let penalty = 0
    for (const key of Object.keys(f)) {
      if (f[key] > 0) {
        penalty = penalty + f[key]
      }
    }
    f.good = -(GOOD_MAX[kind] / 100) * (1 - clamp(penalty / GOOD_LIMIT, 0, 1))
  }
  return capFactors(f)
}

// Keeps the penalties of one item to MAX_PENALTY and its credits to MAX_CREDIT (every problem is scaled down together).
export function capFactors(f) {
  let penalty = 0
  let credit = 0
  for (const key of Object.keys(f)) {
    if (f[key] > 0) {
      penalty = penalty + f[key]
    } else {
      credit = credit - f[key]
    }
  }
  const penaltyScale = penalty > MAX_PENALTY ? MAX_PENALTY / penalty : 1
  const creditScale = credit > MAX_CREDIT ? MAX_CREDIT / credit : 1
  for (const key of Object.keys(f)) {
    if (f[key] > 0) {
      f[key] = f[key] * penaltyScale
    } else {
      f[key] = f[key] * creditScale
    }
  }
  return f
}

// ============================================================
// WHERE AN APPLIANCE BELONGS IN RELATION TO OTHER THINGS
// ============================================================

// Distance from item a to the closest other item for which test(item) is true. Infinity when there is none.
function nearestDistance(others, a, test) {
  let best = Infinity
  for (const o of others) {
    if (o !== a && test(o)) {
      best = Math.min(best, dist(a, o))
    }
  }
  return best
}

// How far (0 to 1) a distance d is beyond the "near" distance, reaching 1 after "span" more metres.
function farness(d, near, span) {
  if (d === Infinity) {
    return 0
  }
  return clamp((d - near) / span, 0, 1)
}

function isSeating(o) {
  return o.spec.kind === 'furniture' && SEATING.includes(o.spec.variant)
}

// The point a ceiling light or fan should hang over: the middle of the beds and seats, or else of the room.
function ceilingTarget(room, others, a) {
  if (a.spec.kind === 'ceilingfan') {
    let x = 0
    let z = 0
    let count = 0
    for (const o of others) {
      if (isSeating(o)) {
        x = x + o.x
        z = z + o.z
        count = count + 1
      }
    }
    if (count > 0) {
      return [x / count, z / count]
    }
  }
  return [room.w / 2, room.d / 2]
}

// The problems that come from where an appliance stands compared with the other things in the room.
// These are the placement hints for kitchen, laundry, air, lighting and screens.
function neighbourFactors(room, others, a, f) {
  const kind = a.spec.kind
  const variant = a.spec.variant

  // stand fan, air purifier and dehumidifier: near where people sit or sleep
  if (kind === 'standfan' || kind === 'purifier') {
    f.occupied = (WEIGHTS.occupied / 100) * farness(nearestDistance(others, a, isSeating), 1.5, 2.5)
  }
  // air purifier and dehumidifier: not right beside a window
  if (kind === 'purifier') {
    f.outdoor = (WEIGHTS.outdoor / 100) * clamp(1 - windowGap(room, others, [a.x, a.z]) / 1.0, 0, 1)
  }

  // dishwasher and kettle: near the sink
  if (kind === 'dishwasher' || variant === 'electric_kettle') {
    const sinkDistance = nearestDistance(others, a, function (o) {
      return o.spec.kind === 'counter' && o.spec.variant === 'sink'
    })
    f.sink = (WEIGHTS.sink / 100) * farness(sinkDistance, 1.0, 2.5)
  }

  // induction cooker and air fryer: near the exhaust fan
  if (variant === 'induction_cooker' || variant === 'air_fryer') {
    const exhaustDistance = nearestDistance(others, a, function (o) {
      return o.spec.kind === 'exhaust'
    })
    f.extract = (WEIGHTS.extract / 100) * farness(exhaustDistance, 1.5, 2.5)
  }

  // exhaust fan: above the cooking
  if (kind === 'exhaust') {
    const cookDistance = nearestDistance(others, a, function (o) {
      return o.spec.kind === 'cook'
    })
    f.cookzone = (WEIGHTS.cookzone / 100) * farness(cookDistance, 0.6, 2.0)
  }

  // washer with dryer; kitchen appliances together
  if (kind === 'washer' || kind === 'dryer') {
    const partner = nearestDistance(others, a, function (o) {
      return o.spec.kind === 'washer' || o.spec.kind === 'dryer'
    })
    f.group = (WEIGHTS.group / 100) * farness(partner, 1.5, 3)
  }
  if (kind === 'cook') {
    const partner = nearestDistance(others, a, function (o) {
      return o.spec.kind === 'cook'
    })
    f.group = (WEIGHTS.group / 100) * farness(partner, 1.2, 3)
  }

  // ceiling fan: over the occupied area. Light: the first light in a room in the middle (the others spread out freely)
  let wantsCentre = kind === 'ceilingfan'
  if (kind === 'light') {
    wantsCentre = true
    for (const o of others) {
      if (o.spec.kind === 'light' && placedBefore(o, a)) {
        wantsCentre = false
      }
    }
  }
  if (wantsCentre) {
    const target = ceilingTarget(room, others, a)
    const half = Math.hypot(room.w, room.d) / 2
    f.centre = (WEIGHTS.centre / 100) * clamp((Math.hypot(a.x - target[0], a.z - target[1]) - 0.3) / half, 0, 1)
  }
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

// A list of positions to try for item a: along every wall (wall and floor items), along its counter
// (counter-top items) and a grid across the floor or ceiling.
function candidates(room, a, others, link) {
  const out = []
  const mode = a.spec.mode

  // things that stand on a counter slide along their own counter (they stay on it)
  if (mode === 'top') {
    for (const c of others) {
      if (c.spec.kind !== 'counter' || c.id !== a.on) {
        continue
      }
      for (let cu = -c.spec.w / 2; cu <= c.spec.w / 2; cu += 0.15) {
        const point = [c.x + TANGENT[c.wall][0] * cu, c.z + TANGENT[c.wall][1] * cu]
        const pos = placeAt(room, a.spec, point, a, others)
        if (pos) {
          out.push(pos)
        }
      }
    }
  }

  // along every wall (ceiling items hang free of the walls, counter-top items stay on their counter)
  if (mode === 'wall' || mode === 'floor') {
    for (let wall = 0; wall < 4; wall++) {
      const length = wallLength(room, wall)
      for (let t = 0.3; t < length - 0.3; t += 0.25) {
        const pos = onWall(room, a.spec, wall, t)
        if (pos) {
          out.push(pos)
        }
      }
    }
  }

  // a grid across the floor (or the ceiling)
  if (mode === 'floor' || mode === 'ceiling') {
    for (let x = 0.3; x < room.w; x += FLOOR_STEP) {
      for (let z = 0.3; z < room.d; z += FLOOR_STEP) {
        const pos = placeAt(room, a.spec, [x, z], a, others)
        if (pos && pos.wall < 0) {
          out.push(pos)
        }
      }
    }
  }

  return notInFrontOfOpening(out, a, link)
}

// Leaves out the spots that are in front of an opening between rooms
function notInFrontOfOpening(spots, a, link) {
  const openings = openingsOf(link)
  const allowed = []
  for (const pos of spots) {
    if (pos.wall < 0 || !inFrontOfOpening(pos, a, openings)) {
      allowed.push(pos)
    }
  }
  return allowed
}

// The spots one step away from pos: the two next to it along a wall, or the eight around it on the floor or ceiling.
function nearbySpots(room, a, others, pos, step) {
  const out = []
  const mode = a.spec.mode
  if (pos.wall >= 0 && (mode === 'wall' || mode === 'floor')) {
    for (const dir of [-1, 1]) {
      const moved = onWall(room, a.spec, pos.wall, pos.t + dir * step)
      if (moved) {
        out.push(moved)
      }
    }
  } else if (pos.wall < 0 && (mode === 'floor' || mode === 'ceiling')) {
    for (const i of [-1, 0, 1]) {
      for (const j of [-1, 0, 1]) {
        if (i !== 0 || j !== 0) {
          const moved = placeAt(room, a.spec, [pos.x + i * step, pos.z + j * step], a, others)
          if (moved && moved.wall < 0) {
            out.push(moved)
          }
        }
      }
    }
  }
  return out
}

// The extra electricity of putting item "test" in its spot.
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

  // The extra electricity this spot causes the OTHER appliances (an aircon placed before another one makes the later one
  // pay for the overlap; a heat source raises the cost of the aircon, fridge, dryer or computer next to it).
  let other = 0
  const kind = test.spec.kind
  if (kind === 'ac' || HEAT_EMITTERS.includes(kind)) {
    const everyone = withForeignItems(others, link)
    for (const o of everyone) {
      if (!(o.kwh > 0)) {
        continue
      }
      if (kind === 'ac' && o.spec.kind === 'ac') {
        other = other + o.kwh * (WEIGHTS.overlap / 100) * overlapOf(o, everyone, test)
      }
      if (HEAT_EMITTERS.includes(kind) && HEAT_SENSITIVE.includes(o.spec.kind)) {
        other = other + o.kwh * (WEIGHTS.heat / 100) * heatOf(o, everyone, test)
      }
    }
  }
  return { own: own, knock: knock, other: other, kwh: a.kwh * sumOf(own) + knock + other }
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
// If several are almost as good, it takes the one in the middle of that group.
function findBestSpot(room, a, others, link) {
  const tried = []

  // works out the cost of one spot, remembers it and gives it back (null when the spot is blocked)
  function tryOne(pos) {
    const test = movedCopy(a, pos)
    if (isBlocked(test, others)) {
      return null
    }
    const cost = costOf(room, others, test, a, link)
    const spot = { pos: pos, own: cost.own, knock: cost.knock, other: cost.other, kwh: cost.kwh }
    tried.push(spot)
    return spot
  }

  for (const pos of candidates(room, a, others, link)) {
    tryOne(pos)
  }
  if (!tried.length) {
    return null
  }

  // The fine search: from each of the best few areas, step to a cheaper neighbouring spot, with smaller and smaller steps,
  // so the best spot is not missed because it fell between two coarse spots.
  const ranked = tried.slice().sort(function (x, y) {
    return x.kwh - y.kwh
  })
  const areas = []
  for (const s of ranked) {
    let isNewArea = true
    for (const done of areas) {
      if (dist(s.pos, done.pos) < 0.5) {
        isNewArea = false
      }
    }
    if (isNewArea && areas.length < REFINE_SPOTS) {
      areas.push(s)
    }
  }
  for (const area of areas) {
    let current = area
    for (const step of REFINE_STEPS) {
      for (let turn = 0; turn < 4; turn++) {
        let cheaper = null
        for (const pos of notInFrontOfOpening(nearbySpots(room, a, others, current.pos, step), a, link)) {
          const spot = tryOne(pos)
          if (spot && spot.kwh < current.kwh - 1e-9 && (cheaper === null || spot.kwh < cheaper.kwh)) {
            cheaper = spot
          }
        }
        if (cheaper === null) {
          break
        }
        current = cheaper
      }
    }
  }

  // the lowest cost of all the spots
  let lowest = Infinity
  for (const s of tried) {
    lowest = Math.min(lowest, s.kwh)
  }

  // how much electricity is at stake
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
    if (s.kwh <= lowest + Math.min(SAME_SPOT_TOLERANCE * Math.max(stake, 20), SAME_SPOT_MAX_KWH)) {
      nearlyBest.push(s)
    }
  }

  // and of those, pick the one in the middle of the group (the smallest total distance to the others)
  let middle = nearlyBest[0]
  let middleTotal = Infinity
  for (const s of nearlyBest) {
    let total = 0
    for (const other of nearlyBest) {
      total = total + dist(s.pos, other.pos)
    }
    if (total < middleTotal - 1e-9) {
      middle = s
      middleTotal = total
    }
  }
  return middle
}

// ============================================================
// REMEMBERING SEARCH RESULTS
// ============================================================
const spotCache = new Map()
const CACHE_LIMIT = 400

// A short text that changes whenever something that the search depends on changes.
function itemKey(o) {
  const spec = o.spec
  return [idOf(o), rankOf(o), o.on, spec.kind, spec.variant, spec.mode, spec.w, spec.d, spec.h, spec.y,
    o.kwh, o.wall, Number(o.x).toFixed(3), Number(o.z).toFixed(3), Number(o.t).toFixed(3), Number(o.rotY).toFixed(3)].join(',')
}

function searchKey(room, a, others, link) {
  const parts = [room.w, room.d, itemKey(a)]
  for (const o of others) {
    parts.push(itemKey(o))
  }
  if (link) {
    for (const gap of link.open) {
      parts.push('open', gap.to, gap.wall, gap.t0, gap.t1)
    }
    for (const n of link.near) {
      parts.push('near', n.name, n.w, n.d, n.dx, n.dz)
    }
    for (const o of link.foreign) {
      parts.push('far', idOf(o), o.spec.kind, o.kwh, Number(o.x).toFixed(3), Number(o.z).toFixed(3))
    }
  }
  return parts.join('|')
}

// findBestSpot, but remembers the answer.
function findBestSpotCached(room, a, others, link) {
  const key = searchKey(room, a, others, link)
  if (spotCache.has(key)) {
    return spotCache.get(key)
  }
  const found = findBestSpot(room, a, others, link)
  if (spotCache.size >= CACHE_LIMIT) {
    spotCache.clear()
  }
  spotCache.set(key, found)
  return found
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

// The first item standing in the way of the aircon's air (a tall thing in its path), or null.
function airBlocker(room, items, ac) {
  const wanted = Math.min(MAX_THROW, 0.8 * Math.max(room.w, room.d))
  const dir = airDirection(ac)
  let blocker = null
  let nearest = Math.min(wanted, distanceToWall(room, [ac.x, ac.z], dir))
  for (const o of items) {
    if (o === ac || o.spec.mode !== 'floor' || o.spec.h < 1.2 || o.spec.kind === 'standfan') {
      continue
    }
    const vx = o.x - ac.x
    const vz = o.z - ac.z
    const ahead = vx * dir[0] + vz * dir[1]
    const sideways = Math.abs(vx * dir[1] - vz * dir[0])
    if (ahead > 0 && sideways < 0.45 && ahead < nearest) {
      blocker = o
      nearest = ahead
    }
  }
  return blocker
}

// True when item o stands in front of one of the windows (or glass doors).
function blocksWindow(room, items, o) {
  if (o.spec.mode !== 'floor' || !(o.spec.h >= TALL || o.spec.kind === 'furniture')) {
    return false
  }
  for (const w of items) {
    if (!isGlass(w.spec) || !(w.wall >= 0)) {
      continue
    }
    const mid = wallPoint(room, w.wall, w.t)
    const along = TANGENT[w.wall]
    const inward = NORMAL[w.wall]
    const into = (o.x - mid[0]) * inward[0] + (o.z - mid[1]) * inward[1]
    const side = Math.abs((o.x - mid[0]) * along[0] + (o.z - mid[1]) * along[1])
    if (into > -0.05 && into < WINDOW_CLEAR + o.spec.d / 2 && side < (w.spec.w + o.spec.w) / 2) {
      return true
    }
  }
  return false
}

// The checks that decide whether a rule's tip is shown
const DETECTORS = {
  // things in the way of an aircon's air
  acBlocked: function (room, items) {
    const found = []
    for (const ac of items) {
      if (ac.spec.kind !== 'ac' || ac.spec.variant !== 'split') {
        continue
      }
      const blocker = airBlocker(room, items, ac)
      if (blocker && !found.includes(blocker)) {
        found.push(blocker)
      }
    }
    return found
  },
  // things standing in front of a window
  windowBlocked: function (room, items) {
    const found = []
    for (const o of items) {
      if (blocksWindow(room, items, o)) {
        found.push(o)
      }
    }
    return found
  },
  // a desk that faces a window
  deskGlare: function (room, items) {
    const found = []
    for (const o of items) {
      if (o.spec.kind === 'furniture' && o.spec.variant === 'study_desk' && glareAt(room, items, o) > DESK_GLARE) {
        found.push(o)
      }
    }
    return found
  },
  // a wardrobe close to something that gives off heat
  wardrobeHeat: function (room, items) {
    const found = []
    for (const o of items) {
      if (o.spec.kind !== 'furniture' || o.spec.variant !== 'wardrobe') {
        continue
      }
      for (const h of items) {
        if (HEAT_EMITTERS.includes(h.spec.kind) && dist(o, h) - (o.spec.w + h.spec.w) / 2 < WARDROBE_HEAT_RANGE) {
          found.push(o)
          break
        }
      }
    }
    return found
  },
  // a floor lamp with something tall right beside it
  lampBlocked: function (room, items) {
    const found = []
    for (const o of items) {
      if (o.spec.kind !== 'lamp') {
        continue
      }
      for (const t of items) {
        if (t !== o && t.spec.mode === 'floor' && t.spec.h >= TALL && dist(o, t) < LAMP_SHADE_RANGE + t.spec.w / 2) {
          found.push(o)
          break
        }
      }
    }
    return found
  },
}

// The names of the checks (used by the tests).
export const DETECTOR_NAMES = Object.keys(DETECTORS)

// The tips that come from the rule table.
function ruleTips(room, items) {
  const tips = []
  const seen = {}
  const used = {}
  for (const r of RULES) {
    if (r.detect) {
      const detector = DETECTORS[r.detect]
      if (!used[r.detect]) {
        used[r.detect] = {}
      }
      for (const o of detector(room, items)) {
        if (!ruleApplies(r, o.spec) || used[r.detect][idOf(o)]) {
          continue
        }
        used[r.detect][idOf(o)] = true
        const text = ruleTip(r, o.name)
        if (!seen[text]) {
          seen[text] = true
          tips.push({ id: o.id, text: text, rule: r.id })
        }
      }
    } else if (!r.factor) {
      for (const o of items) {
        if (ruleApplies(r, o.spec)) {
          const text = ruleTip(r, o.name)
          if (!seen[text]) {
            seen[text] = true
            tips.push({ id: o.id, text: text, rule: r.id })
          }
          break
        }
      }
    }
  }
  return tips
}

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
      text: tipText({
        title: 'Aircon size',
        instruction: `Use one aircon in the ${roomName}`,
        reason: `The ${roomName} is about ${area.toFixed(0)} m², which needs roughly ${(area / AC_M2_PER_KW).toFixed(1)} kW of cooling (floor area ÷ 5), so a second aircon mostly adds running cost and could be kept for another room`,
        source: 'NEA',
      }),
    })
  }

  // advice for rooms joined by an open wall
  const openTips = openSpaceTips(roomName, area, acs, link)
  for (const tip of openTips) {
    tips.push(tip)
  }

  // an aircon but no fan (a stand fan or a ceiling fan both count; an exhaust fan does not)
  let hasFan = false
  for (const o of items) {
    if (o.spec.kind === 'standfan' || o.spec.kind === 'ceilingfan') {
      hasFan = true
    }
  }
  if (acs.length && !hasFan) {
    tips.push({
      id: acs[0].id,
      text: tipText({
        title: 'Add a fan',
        instruction: `Add a fan to the ${roomName}`,
        reason: 'Using a fan instead of the aircon can save about $460 a year, so keep the aircon for the hottest hours',
        source: 'NEA',
      }),
    })
  }

  // low-tick models
  for (const o of items) {
    if (TICKED.includes(o.spec.kind) && o.ticks && o.ticks < GOOD_TICKS) {
      tips.push({
        id: o.id,
        text: tipText({
          title: 'Energy label',
          instruction: `Choose a model with ${GOOD_TICKS} ticks or more when you replace the ${o.name}, which has ${o.ticks}`,
          reason: 'A better model costs more to buy but saves on electricity over its lifespan',
          source: 'NEA',
        }),
      })
    }
  }

  // the rest of the placement rules (kitchen, cooling, laundry, bathroom, lighting, screens, furniture)
  for (const tip of ruleTips(room, items)) {
    tips.push(tip)
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
    return [{ id: null, text: tipText({
      title: 'Open space',
      instruction: 'Put the aircon close to the opening so its air reaches both rooms, rather than adding another aircon here',
      reason: `The ${roomName} is open to ${nearNames.join(' and ')}, so the aircon there can cool this space too`,
      source: 'NEA',
    }) }]
  }
  if (allCount >= 2 && totalArea / AC_M2_PER_KW <= 5) {
    return [{ id: acs[acs.length - 1].id, text: tipText({
      title: 'Open space',
      instruction: 'Keep one aircon near the opening to serve both rooms',
      reason: `${together} are now one open space of about ${totalArea.toFixed(0)} m², which needs roughly ${kw} kW of cooling (floor area ÷ 5), so a second aircon mostly adds running cost`,
      source: 'NEA',
    }) }]
  }
  if (allCount === 1 && totalArea / AC_M2_PER_KW <= 5) {
    return [{ id: acs[0].id, text: tipText({
      title: 'Open space',
      instruction: 'Keep this aircon near the opening so it serves both rooms',
      reason: `${together} are one open space of about ${totalArea.toFixed(0)} m² (roughly ${kw} kW of cooling), which one aircon can serve from near the opening`,
      source: 'NEA',
    }) }]
  }
  if (allCount >= 2) {
    return [{ id: null, text: tipText({
      title: 'Open space',
      instruction: 'Keep the two aircons well apart so each cools its own end',
      reason: `${together} are one open space of about ${totalArea.toFixed(0)} m² (roughly ${kw} kW of cooling), which is more than one aircon covers, so two is reasonable here`,
      source: 'NEA',
    }) }]
  }
  return [{ id: acs[0].id, text: tipText({
    title: 'Open space',
    instruction: 'Keep the aircon near the opening and use a fan to move the air',
    reason: `${together} are one open space of about ${totalArea.toFixed(0)} m² (roughly ${kw} kW of cooling), and one aircon will struggle to cool the far end`,
    source: 'NEA',
  }) }]
}

// ============================================================
// analyse - THE MAIN FUNCTION
// ============================================================

// Looks at every item in a room and works out rows, recs and tips
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
    if (a.kwh * penaltyOf(now.own) + now.knock + now.other >= MIN_SAVING_KWH) {
      const found = findBestSpotCached(room, a, others, link)
      if (found && now.kwh - found.kwh >= MIN_SAVING_KWH) {
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
    let avoidFraction = sumOf(avoidable)
    let knockSaved = 0
    let otherSaved = 0
    if (best) {
      knockSaved = Math.max(0, now.knock - best.knock)
      otherSaved = Math.max(0, now.other - best.other)
    }

    // A move too small to be worth recommending is not shown as a loss
    if (best) {
      const small = Math.hypot(best.pos.x - a.x, best.pos.z - a.z) < 0.02
      if (small || a.kwh * avoidFraction + knockSaved + otherSaved < MIN_SAVING_KWH) {
        best = null
        avoidFraction = 0
        knockSaved = 0
        otherSaved = 0
        for (const key of Object.keys(avoidable)) {
          avoidable[key] = 0
        }
      }
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
      creditPct: Math.max(0, -(isMissing(full.good) ? 0 : full.good)) * 100,
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
    if (distance < 0.02 || avoidKwh + otherSaved < MIN_SAVING_KWH) {
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
    if (otherSaved >= 1) {
      reasonKeys.push('others')
    }

    // what the move should save: "about 12% (around 40 kWh a year)", and the aircon's saving if a stand fan was the cause
    let saving = ''
    if (avoidFraction >= 0.005) {
      saving = `about ${(avoidFraction * 100).toFixed(0)}% (around ${kwhText(a.kwh * avoidFraction)} a year)`
    } else if (a.kwh * avoidFraction >= MIN_SAVING_KWH) {
      saving = `around ${kwhText(a.kwh * avoidFraction)} a year`
    }
    if (knockSaved >= 1) {
      if (saving) {
        saving = `${saving}, plus about ${kwhText(knockSaved)} a year less for the aircon`
      } else {
        saving = `about ${kwhText(knockSaved)} a year less for the aircon`
      }
    }
    if (otherSaved >= 1) {
      if (saving) {
        saving = `${saving}, plus about ${kwhText(otherSaved)} a year less for the other appliances`
      } else {
        saving = `about ${kwhText(otherSaved)} a year less for the other appliances`
      }
    }

    const reasonTexts = []
    for (const k of reasonKeys) {
      reasonTexts.push(REASONS[k])
    }
    recs.push({
      id: a.id,
      to: best.pos,
      savedKwh: avoidKwh + otherSaved,
      title: 'Move the ' + a.name,
      text: recText({
        name: a.name,
        distance: howFar(distance),
        direction: compass(moveX, moveZ),
        reason: 'This ' + joinReasons(reasonTexts),
        saving: saving,
      }),
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