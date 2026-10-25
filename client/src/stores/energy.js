import { NORMAL, TANGENT, wallPoint, nearestWall, wallLength, onWall, placeAt, isBlocked } from './placement.js'

// How much extra electricity (as a % of the appliance's rated use) each placement problem costs.
// The first few are heuristics of this planner; the ones marked NEA follow the NEA "Energy Efficiency
// Tips for Households" guide (guide.pdf), the others are the planner's own simplifications.
export const WEIGHTS = {
  sun: 12,    // direct sun on an aircon or fridge
  heat: 8,    // NEA: keep the fridge away from heat sources (cooker, oven, sun); aircon works harder next to them
  air: 8,     // aircon airflow cut short by furniture
  side: 4,    // aircon needs air round it; NEA: fridge needs about 2 cm each side
  clear: 10,  // NEA: fridge needs about 5 cm at the back
  fan: 6,     // a stand fan next to / in front of an aircon fights its airflow (charged to the aircon)
  glare: 5,   // NEA: place TV and computer screens perpendicular to windows, so brightness need not go up
  corner: 5,  // NEA: put lamps in corners, where wall reflections add light
}

export const LABELS = {
  sun: 'Sunlight near window',
  heat: 'Nearby heat source',
  air: 'Blocked airflow',
  side: 'Too close to a side wall',
  clear: 'Too close to the wall',
  fan: 'Fan too close to the aircon',
  glare: 'Screen facing the window',
  corner: 'Lamp not in a corner',
}

const REASONS = {
  sun: 'out of the sunlight from the window',
  heat: 'away from heat sources (cooker, dryer, dishwasher, computer)',
  air: 'where its airflow can reach more of the room',
  side: 'with a little more room beside it for air to circulate',
  clear: 'with a little breathing room behind it',
  fan: "out of the aircon's airflow and away from the unit",
  glare: 'at a right angle to the window, so the screen has less glare',
  corner: 'in a corner, where the walls reflect more of its light',
}

// NEA guide: leave about 2 cm either side of a fridge and 5 cm behind it.
const FRIDGE_REAR_GAP = 0.05
const FRIDGE_SIDE_GAP = 0.02
const AC_SIDE_GAP = 0.2
const MAX_THROW = 3.5
// A stand fan closer than this to an aircon (or standing in the way of its air) fights it.
const FAN_NEAR = 1.0
const FAN_PATH_REACH = 3.0
const GLARE_RANGE = 3
const CORNER_REACH = 0.6
const SAME_SPOT_TOLERANCE = 0.005
const WORTH_MOVING = 0.01

const HEAT_GLOW = {
  fridge: [0.5, 0.7], cook: [0.4, 0.6], dryer: [0.5, 0.8], dishwasher: [0.4, 0.7], ac: [0.15, 0.7],
  pc: [0.35, 0.6], tv: [0.2, 0.5],
}
const HEAT_EMITTERS = ['fridge', 'cook', 'dryer', 'dishwasher', 'pc']
const HEAT_SENSITIVE = ['ac', 'fridge']
const SCREENS = ['tv', 'pc']
const MOVABLE = ['ac', 'fridge', 'standfan', 'tv', 'pc', 'lamp']

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))
const gauss = (distance, spread) => Math.exp(-((distance / spread) ** 2))
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z)
const sum = (numbers) => numbers.reduce((total, n) => total + n, 0)
const sumOf = (factorObject) => sum(Object.values(factorObject))

export function sunAt(room, items, p) {
  let best = 0
  for (const w of items) {
    if (w.spec.kind !== 'window') continue
    const mid = wallPoint(room, w.wall, w.t), along = TANGENT[w.wall], inward = NORMAL[w.wall]
    const intoRoom = (p[0] - mid[0]) * inward[0] + (p[1] - mid[1]) * inward[1]
    if (intoRoom < -0.05) continue
    const sideways = Math.abs((p[0] - mid[0]) * along[0] + (p[1] - mid[1]) * along[1])
    const patchHalfWidth = w.spec.w / 2 + 0.5 * Math.max(intoRoom, 0) + 0.3
    const outside = Math.max(0, sideways - patchHalfWidth)
    best = Math.max(best, Math.exp(-Math.max(intoRoom, 0) / 2) * Math.exp(-((outside / 0.5) ** 2)))
  }
  return best
}

export function heatAt(room, items, p) {
  let heat = sunAt(room, items, p) * 0.7
  for (const o of items) {
    const glow = HEAT_GLOW[o.spec.kind]
    if (glow) heat += glow[0] * gauss(Math.hypot(o.x - p[0], o.z - p[1]), glow[1])
  }
  return Math.min(1, heat)
}

export const airDirection = (item) => [Math.sin(item.rotY), Math.cos(item.rotY)]

function distanceToWall(room, origin, d) {
  let t = Infinity
  if (d[0] > 1e-9) t = Math.min(t, (room.w - origin[0]) / d[0])
  if (d[0] < -1e-9) t = Math.min(t, -origin[0] / d[0])
  if (d[1] > 1e-9) t = Math.min(t, (room.d - origin[1]) / d[1])
  if (d[1] < -1e-9) t = Math.min(t, -origin[1] / d[1])
  return t
}

// How far an aircon/fan's air travels before it meets a wall or something tall. `ignoreFans` leaves
// stand fans out, because a fan in the way is charged to its own "fan too close" factor instead.
export function throwOf(room, items, ac, { ignoreFans = false } = {}) {
  const dir = airDirection(ac)
  let reach = distanceToWall(room, [ac.x, ac.z], dir)
  for (const o of items) {
    if (o === ac || o.spec.mode !== 'floor' || o.spec.h < 1.2) continue
    if (ignoreFans && o.spec.kind === 'standfan') continue
    const vx = o.x - ac.x, vz = o.z - ac.z
    const ahead = vx * dir[0] + vz * dir[1]
    const sideways = Math.abs(vx * dir[1] - vz * dir[0])
    if (ahead > 0 && sideways < 0.45 && ahead < reach) reach = ahead
  }
  return reach
}

// 0 (no problem) to 1 (as bad as it gets): how much the stand fans in the room get in an aircon's way.
// A fan within FAN_NEAR of the unit is as bad as it gets; further away it fades, and a fan standing in
// the aircon's blown air is penalised by how far down the stream it is.
export function fanClash(items, ac) {
  const dir = airDirection(ac)
  let worst = 0
  for (const o of items) {
    if (o.spec.kind !== 'standfan') continue
    const vx = o.x - ac.x, vz = o.z - ac.z, d = Math.hypot(vx, vz)
    let clash = d <= FAN_NEAR ? 1 : gauss(d - FAN_NEAR, 0.5)
    const ahead = vx * dir[0] + vz * dir[1], sideways = Math.abs(vx * dir[1] - vz * dir[0])
    if (ahead > 0 && sideways < 0.6 && ahead < FAN_PATH_REACH) clash = Math.max(clash, 1 - ahead / FAN_PATH_REACH)
    worst = Math.max(worst, clash)
  }
  return worst
}

// Gap (m) between the sides of a unit standing against a wall and whatever is next to it: a corner,
// or the next thing on the floor along the same wall.
function sideSpace(room, others, a) {
  let gap = Math.min(a.t, wallLength(room, a.wall) - a.t) - a.spec.w / 2
  for (const o of others) {
    if (o.wall !== a.wall || o.spec.mode === 'ceiling' || o.spec.mode === 'top' || o.spec.y !== 0) continue
    gap = Math.min(gap, Math.abs(a.t - o.t) - (a.spec.w + o.spec.w) / 2)
  }
  return Math.max(0, gap)
}

// 0..1: how much a screen faces towards (or away from) a nearby window instead of sitting at a right angle to it.
function glareAt(room, others, a) {
  const [fx, fz] = airDirection(a)
  let worst = 0
  for (const w of others) {
    if (w.spec.kind !== 'window') continue
    const inward = NORMAL[w.wall], facing = fx * inward[0] + fz * inward[1]
    const mid = wallPoint(room, w.wall, w.t)
    worst = Math.max(worst, facing * facing * Math.exp(-Math.hypot(a.x - mid[0], a.z - mid[1]) / GLARE_RANGE))
  }
  return worst
}

function cornerDistance(room, a) {
  return Math.min(...[[0, 0], [room.w, 0], [0, room.d], [room.w, room.d]].map(([cx, cz]) => Math.hypot(a.x - cx, a.z - cz)))
}

// Extra electricity, as a fraction of `a`'s rated use, caused by where `a` stands.
// `ownOnly` leaves out the "fan too close" factor, which is fixed by moving the fan, not the aircon.
export function factors(room, others, a, { ownOnly = false } = {}) {
  const kind = a.spec.kind, p = [a.x, a.z], f = {}
  if (!MOVABLE.includes(kind)) return f

  if (HEAT_SENSITIVE.includes(kind)) {
    f.sun = (WEIGHTS.sun / 100) * sunAt(room, others, p)
    let heat = 0
    for (const o of others) if (HEAT_EMITTERS.includes(o.spec.kind)) heat += gauss(dist(a, o), 0.8)
    f.heat = (WEIGHTS.heat / 100) * Math.min(1, heat)
  }

  if (kind === 'fridge') {
    const gap = Math.max(0, nearestWall(room, p).d - a.spec.d / 2)
    f.clear = (WEIGHTS.clear / 100) * Math.max(0, FRIDGE_REAR_GAP - gap) / FRIDGE_REAR_GAP
    if (a.wall >= 0) f.side = (WEIGHTS.side / 100) * Math.max(0, FRIDGE_SIDE_GAP - sideSpace(room, others, a)) / FRIDGE_SIDE_GAP
  }

  if (kind === 'ac') {
    const wanted = Math.min(MAX_THROW, 0.8 * Math.max(room.w, room.d))
    f.air = (WEIGHTS.air / 100) * (1 - Math.min(1, throwOf(room, others, a, { ignoreFans: true }) / wanted))
    if (a.wall >= 0) {
      const sideSpaceAc = Math.min(a.t, wallLength(room, a.wall) - a.t) - a.spec.w / 2
      f.side = (WEIGHTS.side / 100) * Math.max(0, AC_SIDE_GAP - sideSpaceAc) / AC_SIDE_GAP
    }
    if (!ownOnly) f.fan = (WEIGHTS.fan / 100) * fanClash(others, a)
  }

  if (SCREENS.includes(kind)) f.glare = (WEIGHTS.glare / 100) * glareAt(room, others, a)
  if (kind === 'lamp') f.corner = (WEIGHTS.corner / 100) * clamp((cornerDistance(room, a) - CORNER_REACH) / 1.4, 0, 1)
  return f
}

function candidates(room, a, others) {
  const out = []
  for (let wall = 0; wall < 4; wall++) {
    const length = wallLength(room, wall)
    for (let t = 0.3; t < length - 0.3; t += 0.25) {
      const pos = onWall(room, a.spec, wall, t)
      if (pos) out.push(pos)
    }
  }
  // Small slides along the wall it is on now (e.g. to open a 2 cm gap beside a fridge).
  if (a.wall >= 0)
    for (const step of [0.03, 0.06, 0.1, 0.15, 0.2])
      for (const sign of [-1, 1]) {
        const pos = onWall(room, a.spec, a.wall, a.t + sign * step)
        if (pos) out.push(pos)
      }
  if (a.spec.mode === 'floor')
    for (let x = 0.3; x < room.w; x += 0.25)
      for (let z = 0.3; z < room.d; z += 0.25) {
        const pos = placeAt(room, a.spec, [x, z], a, others)
        if (pos && pos.wall < 0) out.push(pos)
      }
  return out
}

// What it costs, in kWh a year, to have `a` standing as `test` (a copy of it at some position):
// its own extra use, plus (for a stand fan) the extra use it causes in any aircon.
function costOf(room, others, test, a) {
  const own = factors(room, others, test, { ownOnly: true })
  let knock = 0
  if (test.spec.kind === 'standfan') {
    const withFan = [...others, test]
    for (const ac of others) if (ac.spec.kind === 'ac' && ac.kwh > 0) knock += ac.kwh * (WEIGHTS.fan / 100) * fanClash(withFan, ac)
  }
  return { own, knock, kwh: a.kwh * sumOf(own) + knock }
}

function findBestSpot(room, a, others) {
  const tried = []
  for (const pos of candidates(room, a, others)) {
    const test = { ...a, ...pos }
    if (isBlocked(test, others)) continue
    tried.push({ pos, ...costOf(room, others, test, a) })
  }
  if (!tried.length) return null
  const lowest = Math.min(...tried.map((s) => s.kwh))
  // Spots within a hair of the best count as equally good, so the suggestion is the nearest of them.
  // For a fan that "hair" is measured against the aircon it affects, which is where its saving is.
  const stake = a.kwh + (a.spec.kind === 'standfan' ? sum(others.filter((o) => o.spec.kind === 'ac').map((o) => o.kwh)) : 0)
  const nearlyBest = tried.filter((s) => s.kwh <= lowest + SAME_SPOT_TOLERANCE * Math.max(stake, 20))
  return nearlyBest.reduce((closest, s) => (dist(a, s.pos) < dist(a, closest.pos) ? s : closest))
}

const compass = (dx, dz) => (Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? 'east' : 'west') : dz > 0 ? 'south' : 'north')
const joinReasons = (list) => (list.length < 2 ? list.join('') : list.slice(0, -1).join(', ') + ' and ' + list[list.length - 1])
const money = (v) => `S$${v >= 10 ? v.toFixed(0) : v.toFixed(2)}`
const howFar = (m) => (m < 0.1 ? `${Math.max(1, Math.round(m * 100))} cm` : `${m.toFixed(1)} m`)

export function analyse(room, items, tariff) {
  const rows = []
  const recs = []

  for (const a of items) {
    if (a.kwh <= 0) continue
    const others = items.filter((o) => o !== a)
    const full = factors(room, others, a)               // what it costs now, including a fan nearby
    const now = costOf(room, others, a, a)               // what moving it could change
    const nowPenalty = sumOf(full)

    const avoidable = {}
    let best = null
    if (now.kwh > 0) {
      const found = findBestSpot(room, a, others)
      if (found && now.kwh - found.kwh >= WORTH_MOVING * a.kwh) {
        best = found
        for (const key of Object.keys(now.own)) avoidable[key] = Math.max(0, now.own[key] - (found.own[key] ?? 0))
      }
    }
    const avoidFraction = sumOf(avoidable)
    const knockSaved = best ? Math.max(0, now.knock - best.knock) : 0   // kWh a year saved on aircons by moving this fan
    const avoidKwh = a.kwh * avoidFraction + knockSaved

    rows.push({
      id: a.id, base: a.kwh, kwh: a.kwh * (1 + nowPenalty), cost: a.kwh * (1 + nowPenalty) * tariff, avoidKwh,
      factors: Object.entries(avoidable).filter(([, v]) => v > 0.001).map(([key, v]) => ({ key, label: LABELS[key], pct: v * 100 })),
      // Extra use that moving another item (the fan) would remove.
      causedByOthers: full.fan > 0.001 ? [{ key: 'fan', label: LABELS.fan, pct: full.fan * 100 }] : [],
      knockOn: knockSaved >= 0.5 ? [{ label: 'aircon', kwh: knockSaved }] : [],
    })

    if (!best) continue
    const moveX = best.pos.x - a.x, moveZ = best.pos.z - a.z
    const distance = Math.hypot(moveX, moveZ)
    if (distance < 0.02 || (avoidFraction < WORTH_MOVING && knockSaved < 1)) continue

    const reasonKeys = Object.entries(avoidable).filter(([, v]) => v > 0.002).sort((x, y) => y[1] - x[1]).map(([key]) => key)
    if (knockSaved >= 1) reasonKeys.push('fan')
    const effects = []
    if (avoidFraction >= WORTH_MOVING)
      effects.push(`It should use about ${(avoidFraction * 100).toFixed(0)}% less (around ${money(a.kwh * avoidFraction * tariff)} a year)`)
    if (knockSaved >= 1)
      effects.push(`${effects.length ? 'and it' : 'It'} should cut the aircon's use by about ${money(knockSaved * tariff)} a year`)
    recs.push({
      id: a.id, to: best.pos, savedKwh: avoidKwh,
      text: `Move the ${a.name} ${howFar(distance)} ${compass(moveX, moveZ)}, ${joinReasons(reasonKeys.map((k) => REASONS[k]))}. ${effects.join(' ')}.`,
    })
  }

  const base = sum(rows.map((r) => r.base))
  const kwh = sum(rows.map((r) => r.kwh))
  const avoidKwh = sum(rows.map((r) => r.avoidKwh))
  return {
    rows, base, kwh, cost: kwh * tariff, avoidKwh,
    avoidPct: base ? (avoidKwh / base) * 100 : 0,
    recs: recs.sort((x, y) => y.savedKwh - x.savedKwh),
  }
}
