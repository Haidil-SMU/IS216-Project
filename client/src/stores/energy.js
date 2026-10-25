import { NORMAL, TANGENT, wallPoint, nearestWall, wallLength, onWall, placeAt, isBlocked } from './placement.js'

export const WEIGHTS = { sun: 12, heat: 8, air: 8, side: 4, clear: 10 }

export const LABELS = {
  sun: 'Sunlight near window',
  heat: 'Nearby heat source',
  air: 'Blocked airflow',
  side: 'Too close to a side wall',
  clear: 'Too close to the wall',
}

const REASONS = {
  sun: 'out of the sunlight from the window',
  heat: 'away from heat sources (cooker, dryer, dishwasher)',
  air: 'where its airflow can reach more of the room',
  side: 'with more space beside it for air to circulate',
  clear: 'with a little breathing room behind it',
}

const FRIDGE_REAR_GAP = 0.05
const AC_SIDE_GAP = 0.2
const MAX_THROW = 3.5
const SAME_SPOT_TOLERANCE = 0.005
const WORTH_MOVING = 0.01

const HEAT_GLOW = { fridge: [0.5, 0.7], cook: [0.4, 0.6], dryer: [0.5, 0.8], dishwasher: [0.4, 0.7], ac: [0.15, 0.7] }
const HEAT_EMITTERS = ['fridge', 'cook', 'dryer', 'dishwasher']
const MOVABLE = ['ac', 'fridge']

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

export function throwOf(room, items, ac) {
  const dir = airDirection(ac)
  let reach = distanceToWall(room, [ac.x, ac.z], dir)
  for (const o of items) {
    if (o === ac || o.spec.mode !== 'floor' || o.spec.h < 1.2) continue
    const vx = o.x - ac.x, vz = o.z - ac.z
    const ahead = vx * dir[0] + vz * dir[1]
    const sideways = Math.abs(vx * dir[1] - vz * dir[0])
    if (ahead > 0 && sideways < 0.45 && ahead < reach) reach = ahead
  }
  return reach
}

export function factors(room, others, a) {
  const kind = a.spec.kind, p = [a.x, a.z], f = {}
  if (!MOVABLE.includes(kind)) return f

  f.sun = (WEIGHTS.sun / 100) * sunAt(room, others, p)

  let heat = 0
  for (const o of others) if (HEAT_EMITTERS.includes(o.spec.kind)) heat += gauss(dist(a, o), 0.8)
  f.heat = (WEIGHTS.heat / 100) * Math.min(1, heat)

  if (kind === 'fridge') {
    const gap = Math.max(0, nearestWall(room, p).d - a.spec.d / 2)
    f.clear = (WEIGHTS.clear / 100) * Math.max(0, FRIDGE_REAR_GAP - gap) / FRIDGE_REAR_GAP
  }

  if (kind === 'ac') {
    const wanted = Math.min(MAX_THROW, 0.8 * Math.max(room.w, room.d))
    f.air = (WEIGHTS.air / 100) * (1 - Math.min(1, throwOf(room, others, a) / wanted))

    if (a.wall >= 0) {
      const sideSpace = Math.min(a.t, wallLength(room, a.wall) - a.t) - a.spec.w / 2
      f.side = (WEIGHTS.side / 100) * Math.max(0, AC_SIDE_GAP - sideSpace) / AC_SIDE_GAP
    }
  }
  return f
}

function candidates(room, a, others) {
  const out = []
  for (let wall = 0; wall < 4; wall++)
    for (let t = 0.3; t < wallLength(room, wall) - 0.3; t += 0.25) {
      const pos = onWall(room, a.spec, wall, t)
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

function findBestSpot(room, a, others) {
  const tried = []
  for (const pos of candidates(room, a, others)) {
    const test = { ...a, ...pos }
    if (isBlocked(test, others)) continue
    const f = factors(room, others, test)
    tried.push({ pos, f, penalty: sumOf(f) })
  }
  if (!tried.length) return null
  const lowest = Math.min(...tried.map((s) => s.penalty))
  const nearlyBest = tried.filter((s) => s.penalty <= lowest + SAME_SPOT_TOLERANCE)
  return nearlyBest.reduce((closest, s) => (dist(a, s.pos) < dist(a, closest.pos) ? s : closest))
}

const compass = (dx, dz) => (Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? 'east' : 'west') : dz > 0 ? 'south' : 'north')
const joinReasons = (list) => (list.length < 2 ? list.join('') : list.slice(0, -1).join(', ') + ' and ' + list[list.length - 1])

export function analyse(room, items, tariff) {
  const rows = []
  const recs = []

  for (const a of items) {
    if (a.kwh <= 0) continue
    const others = items.filter((o) => o !== a)
    const now = factors(room, others, a)
    const nowPenalty = sumOf(now)

    const avoidable = {}
    let bestPos = null
    if (nowPenalty > 0) {
      const best = findBestSpot(room, a, others)
      if (best && nowPenalty - best.penalty >= WORTH_MOVING) {
        bestPos = best.pos
        for (const key of Object.keys(now)) avoidable[key] = Math.max(0, now[key] - (best.f[key] ?? 0))
      }
    }
    const avoidFraction = sumOf(avoidable)
    const kwh = a.kwh * (1 + nowPenalty)
    const avoidKwh = a.kwh * avoidFraction

    rows.push({
      id: a.id, base: a.kwh, kwh, cost: kwh * tariff, avoidKwh,
      factors: Object.entries(avoidable).filter(([, v]) => v > 0.001).map(([key, v]) => ({ key, label: LABELS[key], pct: v * 100 })),
    })

    const moveX = bestPos ? bestPos.x - a.x : 0, moveZ = bestPos ? bestPos.z - a.z : 0
    const distance = Math.hypot(moveX, moveZ)
    if (bestPos && distance >= 0.1 && avoidFraction >= WORTH_MOVING) {
      const reasons = Object.entries(avoidable).filter(([, v]) => v > 0.002).sort((x, y) => y[1] - x[1]).map(([key]) => REASONS[key])
      recs.push({
        id: a.id, to: bestPos, savedKwh: avoidKwh,
        text: `Move the ${a.name} ${distance.toFixed(1)} m ${compass(moveX, moveZ)}, ${joinReasons(reasons)}. ` +
          `It should use about ${(avoidFraction * 100).toFixed(0)}% less (around S$${(avoidKwh * tariff).toFixed(0)} a year).`,
      })
    }
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