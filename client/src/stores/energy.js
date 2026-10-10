import { NORMAL, TANGENT, wallPoint, nearestWall, wallLength, onWall, placeAt, isBlocked } from './placement.js'

export const WEIGHTS = { sun: 12, clear: 10, heat: 8, air: 8 }
export const LABELS = {
  sun: 'Sunlight near window',
  clear: 'Too close to the wall',
  heat: 'Nearby heat source',
  air: 'Blocked airflow',
}

const IDEAL_CLEARANCE = 0.1 
const HEAT_EMITTERS = ['fridge', 'cook', 'dryer']

const HEAT_GLOW = { fridge: [0.5, 0.7], cook: [0.4, 0.6], dryer: [0.5, 0.8], ac: [0.15, 0.7] }

const gauss = (d, spread) => Math.exp(-((d / spread) ** 2))
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z)


export function sunAt(room, items, p) {
  let best = 0
  for (const w of items) {
    if (w.spec.kind !== 'window') continue
    const m = wallPoint(room, w.wall, w.t), u = TANGENT[w.wall], n = NORMAL[w.wall]
    const dn = (p[0] - m[0]) * n[0] + (p[1] - m[1]) * n[1] // how far into the room
    if (dn < -0.05) continue
    const lat = Math.abs((p[0] - m[0]) * u[0] + (p[1] - m[1]) * u[1]) // sideways from the window centre
    const spread = w.spec.w / 2 + 0.5 * Math.max(dn, 0) + 0.3 // the sun patch widens with distance
    const out = Math.max(0, lat - spread)
    best = Math.max(best, Math.exp(-Math.max(dn, 0) / 2) * Math.exp(-((out / 0.5) ** 2)))
  }
  return best
}


export function heatAt(room, items, p) {
  let h = sunAt(room, items, p) * 0.7
  for (const o of items) {
    const g = HEAT_GLOW[o.spec.kind]
    if (g) h += g[0] * gauss(Math.hypot(o.x - p[0], o.z - p[1]), g[1])
  }
  return Math.min(1, h)
}


function rayToWall(room, o, d) {
  let t = Infinity
  if (d[0] > 1e-9) t = Math.min(t, (room.w - o[0]) / d[0])
  if (d[0] < -1e-9) t = Math.min(t, -o[0] / d[0])
  if (d[1] > 1e-9) t = Math.min(t, (room.d - o[1]) / d[1])
  if (d[1] < -1e-9) t = Math.min(t, -o[1] / d[1])
  return t
}


export function throwOf(room, items, ac) {
  const dir = airDirection(ac)
  let t = rayToWall(room, [ac.x, ac.z], dir)
  for (const o of items) {
    if (o === ac || o.spec.mode !== 'floor' || o.spec.h < 1.2) continue
    const vx = o.x - ac.x, vz = o.z - ac.z
    const ahead = vx * dir[0] + vz * dir[1], side = Math.abs(vx * dir[1] - vz * dir[0])
    if (ahead > 0 && side < 0.45 && ahead < t) t = ahead
  }
  return t
}


export const airDirection = (it) => [Math.sin(it.rotY), Math.cos(it.rotY)]


export function factors(room, items, a) {
  const kind = a.spec.kind, p = [a.x, a.z], f = {}
  if (kind === 'ac' || kind === 'fridge') f.sun = (WEIGHTS.sun / 100) * sunAt(room, items, p)
  if (kind === 'fridge') {
    const gap = Math.max(0, nearestWall(room, p).d - a.spec.d / 2)
    f.clear = (WEIGHTS.clear / 100) * Math.max(0, IDEAL_CLEARANCE - gap) / IDEAL_CLEARANCE
  }
  if (kind === 'ac' || kind === 'fridge') {
    let heat = 0
    for (const o of items) if (o !== a && HEAT_EMITTERS.includes(o.spec.kind)) heat += gauss(dist(a, o), 0.8)
    f.heat = (WEIGHTS.heat / 100) * Math.min(1, heat)
  }
  if (kind === 'ac') f.air = (WEIGHTS.air / 100) * (1 - Math.min(1, throwOf(room, items, a) / 3.5))
  return f
}


export function analyse(room, items, tariff) {
  const rows = items.filter((a) => a.kwh > 0).map((a) => {
    const f = factors(room, items, a)
    const mult = 1 + Object.values(f).reduce((s, v) => s + v, 0)
    return {
      id: a.id, base: a.kwh, mult, kwh: a.kwh * mult, cost: a.kwh * mult * tariff,
      factors: Object.entries(f).map(([key, v]) => ({ key, label: LABELS[key], pct: v * 100 })),
    }
  })
  const base = rows.reduce((s, r) => s + r.base, 0), kwh = rows.reduce((s, r) => s + r.kwh, 0)
  return { rows, base, kwh, cost: kwh * tariff, impactPct: base ? ((kwh - base) / base) * 100 : 0 }
}


const MOVABLE = ['ac', 'fridge']

function candidates(room, a, rest) {
  const out = []
  for (let i = 0; i < 4; i++)
    for (let t = 0.3; t < wallLength(room, i) - 0.3; t += 0.25) { const c = onWall(room, a.spec, i, t); if (c) out.push(c) }
  if (a.spec.mode === 'floor')
    for (let x = 0.3; x < room.w; x += 0.25) for (let z = 0.3; z < room.d; z += 0.25) {
      const c = placeAt(room, a.spec, [x, z], a, rest)
      if (c && c.wall < 0) out.push(c)
    }
  return out
}

const compass = (dx, dz) => (Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? 'east' : 'west') : dz > 0 ? 'south' : 'north') 

export function suggest(room, items, tariff) {
  const here = items
  const now = analyse(room, here, tariff)
  const recs = []
  for (const a of here) {
    if (!MOVABLE.includes(a.spec.kind) || !a.kwh) continue
    const rest = here.filter((o) => o !== a)
    let best = null
    for (const c of candidates(room, a, rest)) {
      const test = { ...a, ...c }
      if (isBlocked(test, rest)) continue
      const r = analyse(room, [...rest, test], tariff)
      if (!best || r.kwh < best.kwh) best = { c, kwh: r.kwh, own: r.rows.find((x) => x.id === a.id).kwh }
    }
    const cur = now.rows.find((x) => x.id === a.id).kwh
    if (!best || best.kwh >= now.kwh - 1e-6 || (cur - best.own) / cur < 0.01) continue
    const dx = best.c.x - a.x, dz = best.c.z - a.z, d = Math.hypot(dx, dz)
    if (d < 0.1) continue
    const saved = now.kwh - best.kwh
    recs.push({
      id: a.id, to: best.c, savedKwh: saved,
      text: `Move the ${a.name} ${d.toFixed(1)} m ${compass(dx, dz)} to cut its estimated energy use by ${(((cur - best.own) / cur) * 100).toFixed(0)}% (about S$${(saved * tariff).toFixed(0)} a year saved overall).`,
    })
  }
  return recs.sort((x, y) => y.savedKwh - x.savedKwh)
}
