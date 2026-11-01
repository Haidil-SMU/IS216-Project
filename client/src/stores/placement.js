import { sinkSpan, resolveSpec } from './applianceModels.js'

export const WALL_THICKNESS = 0.1
const GAP = 0.02
const SNAP = 0.45 

export const NORMAL = [[0, 1], [-1, 0], [0, -1], [1, 0]] 
export const TANGENT = [[1, 0], [0, 1], [-1, 0], [0, -1]] 

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))
export const wallLength = (room, i) => (i % 2 ? room.d : room.w)

export function wallPoint(room, i, t) {
  const start = [[0, 0], [room.w, 0], [room.w, room.d], [0, room.d]][i]
  return [start[0] + TANGENT[i][0] * t, start[1] + TANGENT[i][1] * t]
}

export function nearestWall(room, [x, z]) {
  const dist = [z, room.w - x, room.d - z, x]
  const along = [x, z, room.w - x, room.d - z]
  const i = dist.indexOf(Math.min(...dist))
  return { i, d: dist[i], t: along[i] }
}

const halfExtent = (w, d, rotY) => {
  const c = Math.abs(Math.cos(rotY)), s = Math.abs(Math.sin(rotY))
  return [c * w / 2 + s * d / 2, s * w / 2 + c * d / 2]
}

export function onWall(room, spec, i, t) {
  const half = spec.w / 2 + 0.05
  const length = wallLength(room, i)
  if (length < spec.w + 0.1) return null
  t = clamp(t, half, length - half)
  const n = NORMAL[i]
  const offset = spec.mode === 'opening' ? -WALL_THICKNESS / 2 : spec.d / 2 + (spec.gap ?? GAP)
  const [px, pz] = wallPoint(room, i, t)
  return { x: px + n[0] * offset, z: pz + n[1] * offset, rotY: Math.atan2(n[0], n[1]), wall: i, t }
}

const COUNTER_EDGE = 0.03
const SINK_MARGIN = 0.03

export function counterPose(counter, spec, cu) {
  const u = TANGENT[counter.wall], n = NORMAL[counter.wall]
  const back = -(counter.spec.d / 2 - spec.d / 2 - COUNTER_EDGE)
  return { x: counter.x + u[0] * cu + n[0] * back, z: counter.z + u[1] * cu + n[1] * back, rotY: counter.rotY, wall: -1, t: 0, on: counter.id, cu }
}

function onCounter(counter, spec, cu) {
  const lim = Math.max(0, counter.spec.w / 2 - spec.w / 2 - COUNTER_EDGE)
  cu = clamp(cu, -lim, lim)
  const sink = sinkSpan(counter.spec)
  if (sink) {
    const lo = sink[0] - spec.w / 2 - SINK_MARGIN, hi = sink[1] + spec.w / 2 + SINK_MARGIN
    if (cu > lo && cu < hi) {
      const beside = [lo, hi].filter((v) => v >= -lim - 1e-9 && v <= lim + 1e-9)
      if (!beside.length) return null
      cu = beside.reduce((best, v) => (Math.abs(v - cu) < Math.abs(best - cu) ? v : best))
    }
  }
  return counterPose(counter, spec, cu)
}

function counterAt(items, p) {
  let best = null
  for (const c of items) {
    if (c.spec.kind !== 'counter') continue
    const u = TANGENT[c.wall], n = NORMAL[c.wall]
    const dx = (p[0] - c.x) * u[0] + (p[1] - c.z) * u[1], dn = (p[0] - c.x) * n[0] + (p[1] - c.z) * n[1]
    if (Math.abs(dx) > c.spec.w / 2 + 0.15 || Math.abs(dn) > c.spec.d / 2 + 0.3) continue
    if (!best || Math.abs(dn) < best.dn) best = { c, dx, dn: Math.abs(dn) }
  }
  return best
}

export function placeAt(room, spec, p, current, items = []) {
  if (spec.mode === 'top') {
    const hit = counterAt(items, p)
    return hit ? onCounter(hit.c, spec, hit.dx) : null
  }
  if (spec.mode === 'ceiling') {
    return { x: clamp(p[0], 0.3, room.w - 0.3), z: clamp(p[1], 0.3, room.d - 0.3), rotY: 0, wall: -1, t: 0 }
  }
  const near = nearestWall(room, p)
  if (spec.mode !== 'floor' || near.d < spec.d / 2 + SNAP) return onWall(room, spec, near.i, near.t)
  const rotY = current ? current.rotY : 0
  const [hx, hz] = halfExtent(spec.w, spec.d, rotY)
  return { x: clamp(p[0], hx, room.w - hx), z: clamp(p[1], hz, room.d - hz), rotY, wall: -1, t: 0 }
}

const isGround = (s) => s.y === 0 && s.mode !== 'ceiling'

function footprint(it) {
  const { spec, x, z, rotY } = it
  if (spec.kind === 'door') {
    const n = NORMAL[it.wall], [hx, hz] = halfExtent(spec.w, 0.9, rotY)
    return { x: x + n[0] * 0.5, z: z + n[1] * 0.5, hx, hz }
  }
  const [hx, hz] = halfExtent(spec.w, spec.d, rotY)
  return { x, z, hx, hz }
}

function clash(a, b) {
  if (a.spec.mode === 'ceiling' || b.spec.mode === 'ceiling') {
    if (a.spec.mode !== b.spec.mode) return false
    return Math.abs(a.x - b.x) < (a.spec.w + b.spec.w) / 2 && Math.abs(a.z - b.z) < (a.spec.d + b.spec.d) / 2
  }
  if (a.spec.mode === 'top' || b.spec.mode === 'top') { 
    return a.spec.mode === b.spec.mode && a.on === b.on && Math.abs(a.cu - b.cu) < (a.spec.w + b.spec.w) / 2 + 0.03
  }
  if (isGround(a.spec) && isGround(b.spec)) {
    const fa = footprint(a), fb = footprint(b)
    return Math.abs(fa.x - fb.x) < fa.hx + fb.hx - 0.01 && Math.abs(fa.z - fb.z) < fa.hz + fb.hz - 0.01
  }

  if (a.wall < 0 || a.wall !== b.wall || a.spec.mode === 'ceiling' || b.spec.mode === 'ceiling') return false
  const along = Math.abs(a.t - b.t) < (a.spec.w + b.spec.w) / 2 + 0.05
  const high = a.spec.y < b.spec.y + b.spec.h && b.spec.y < a.spec.y + a.spec.h
  return along && high
}

export const isBlocked = (candidate, others) => others.some((o) => o !== candidate && clash(candidate, o))

export function findSpot(room, spec, others) {
  const tryIt = (pos) => (pos && !isBlocked({ spec, ...pos }, others) ? pos : null)
  if (spec.mode === 'top') {
    for (const c of others.filter((o) => o.spec.kind === 'counter'))
      for (let cu = -c.spec.w / 2; cu <= c.spec.w / 2; cu += 0.05) { const hit = tryIt(onCounter(c, spec, cu)); if (hit) return hit }
    return null
  }
  if (spec.mode !== 'ceiling') {
    const walls = [0, 1, 2, 3].sort((a, b) => wallLength(room, b) - wallLength(room, a))
    for (const i of walls) {
      const mid = wallLength(room, i) / 2
      const ts = []
      for (let t = 0; t <= wallLength(room, i); t += 0.15) ts.push(t)
      ts.sort((a, b) => Math.abs(a - mid) - Math.abs(b - mid))
      for (const t of ts) { const hit = tryIt(onWall(room, spec, i, t)); if (hit) return hit }
    }
  }
  if (spec.mode === 'wall' || spec.mode === 'opening') return null
  const spots = []
  for (let x = 0.4; x < room.w; x += 0.3) for (let z = 0.4; z < room.d; z += 0.3) spots.push([x, z])
  if (spec.mode === 'ceiling') spots.sort((a, b) => Math.hypot(a[0] - room.w / 2, a[1] - room.d / 2) - Math.hypot(b[0] - room.w / 2, b[1] - room.d / 2))
  for (const p of spots) {
    const hit = tryIt(placeAt(room, spec, p, undefined, others))
    if (hit) return hit
  }
  return null
}

export function wallPieces(room, items, trimStart = []) {
  const out = []
  const add = (wall, t0, t1, y0, y1) => { if (t1 - t0 > 0.01 && y1 - y0 > 0.01) out.push({ wall, t0, t1, y0, y1 }) }
  for (let i = 0; i < 4; i++) {
    const ops = items.filter((o) => o.spec.mode === 'opening' && o.wall === i).sort((a, b) => a.t - b.t)
    let t = trimStart[i] ? 0 : -WALL_THICKNESS
    for (const o of ops) {
      const t0 = o.t - o.spec.w / 2, t1 = o.t + o.spec.w / 2
      add(i, t, t0, 0, room.h)
      add(i, t0, t1, 0, o.spec.y) 
      add(i, t0, t1, o.spec.y + o.spec.h, room.h)
      t = t1
    }
    add(i, t, wallLength(room, i), 0, room.h)
  }
  return out
}

function wallAxis(room, wall) {
  return wall % 2 === 0
    ? { start: room.origin.x, length: room.dimension.w }
    : { start: room.origin.z, length: room.dimension.d }
}

const toFlat = (room, wall, t) => { const a = wallAxis(room, wall); return wall >= 2 ? a.start + a.length - t : a.start + t }
const fromFlat = (room, wall, g) => { const a = wallAxis(room, wall); return wall >= 2 ? a.start + a.length - g : g - a.start }

export function sharedRange(room, other, wall) {
  const a = wallAxis(room, wall), b = wallAxis(other, wall)
  const lo = Math.max(a.start, b.start), hi = Math.min(a.start + a.length, b.start + b.length)
  if (hi <= lo) return null
  const t1 = fromFlat(room, wall, lo), t2 = fromFlat(room, wall, hi)
  return { t0: Math.min(t1, t2), t1: Math.max(t1, t2) }
}

export const sameSpotOn = (room, wall, t, other, otherWall) => fromFlat(other, otherWall, toFlat(room, wall, t))

const rectOf = (r) => ({ x: r.origin.x, z: r.origin.z, w: r.dimension.w, d: r.dimension.d })
const tAlong = (r, wall, g) => [g - r.x, g - r.z, r.x + r.w - g, r.z + r.d - g][wall]
const gAlong = (r, wall, t) => [r.x + t, r.z + t, r.x + r.w - t, r.z + r.d - t][wall]


const NEAR = 0.02
export function sharedWall(A, B) {
  const a = rectOf(A), b = rectOf(B)
  const tests = [
    [0, Math.abs(a.z - (b.z + b.d)) < NEAR, a.x, a.x + a.w, b.x, b.x + b.w],
    [1, Math.abs(a.x + a.w - b.x) < NEAR, a.z, a.z + a.d, b.z, b.z + b.d],
    [2, Math.abs(a.z + a.d - b.z) < NEAR, a.x, a.x + a.w, b.x, b.x + b.w],
    [3, Math.abs(a.x - (b.x + b.w)) < NEAR, a.z, a.z + a.d, b.z, b.z + b.d],
  ]
  for (const [wall, ok, a0, a1, b0, b1] of tests) {
    if (!ok) continue
    const lo = Math.max(a0, b0), hi = Math.min(a1, b1)
    if (hi - lo > 0.05) return { wall, length: hi - lo, t: tAlong(a, wall, (lo + hi) / 2) }
  }
  return null
}

export function refitPlacements(oldR, newR, carry) {
  const od = oldR.dimension, nd = newR.dimension, oo = oldR.origin, no = newR.origin
  const out = (oldR.placements || []).map((p) => ({ ...p }))
  const delta = new Map()
  const margin = 0.3
  for (const p of out) {
    if (p.onPlacementId) continue
    let nx, nz
    if (p.wall >= 0) {
      const n = NORMAL[p.wall], [px, pz] = wallPoint(od, p.wall, p.t)
      const off = (p.x - px) * n[0] + (p.z - pz) * n[1]
      const g = gAlong(rectOf(oldR), p.wall, p.t)
      const nt = clamp(carry ? p.t : tAlong(rectOf(newR), p.wall, g), margin, Math.max(margin, wallLength(nd, p.wall) - margin))
      const [qx, qz] = wallPoint(nd, p.wall, nt)
      nx = qx + n[0] * off; nz = qz + n[1] * off; p.t = nt
    } else {
      const lx = carry ? p.x : p.x + oo.x - no.x, lz = carry ? p.z : p.z + oo.z - no.z
      nx = clamp(lx, margin, Math.max(margin, nd.w - margin)); nz = clamp(lz, margin, Math.max(margin, nd.d - margin))
    }
    delta.set(String(p._id), { dx: nx - p.x, dz: nz - p.z })
    p.x = nx; p.z = nz
  }
  for (const p of out) {
    if (!p.onPlacementId) continue
    const d = delta.get(String(p.onPlacementId)) || { dx: 0, dz: 0 }
    const sx = carry ? 0 : oo.x - no.x, sz = carry ? 0 : oo.z - no.z
    p.x = clamp(p.x + sx + d.dx, margin, Math.max(margin, nd.w - margin))
    p.z = clamp(p.z + sz + d.dz, margin, Math.max(margin, nd.d - margin))
  }
  return out
}

export const itemsOfRoom = (r) => (r.placements || []).map((p) => ({
  id: String(p._id), spec: resolveSpec(p.applianceTypeKey, p.category),
  x: p.x, z: p.z, rotY: p.rotY, wall: p.wall, t: p.t, cu: p.cu ?? 0,
  on: p.onPlacementId ? String(p.onPlacementId) : undefined,
  connectsTo: p.connectsTo ?? null,
}))

function neighbourAcross(rooms, r, wall, t) {
  const a = r.origin, d = r.dimension
  const line = [a.z, a.x + d.w, a.z + d.d, a.x][wall]
  const g = [a.x + t, a.z + t, a.x + d.w - t, a.z + d.d - t][wall]
  for (const o of rooms) {
    if (String(o._id) === String(r._id)) continue
    const oo = o.origin, od = o.dimension
    const facing = [oo.z + od.d, oo.x, oo.z, oo.x + od.w][wall]
    if (Math.abs(line - facing) > 0.02) continue
    const lo = wall % 2 ? oo.z : oo.x, hi = lo + (wall % 2 ? od.d : od.w)
    if (g > lo && g < hi) return o
  }
  return null
}

export function doorBlockedBeyond(rooms, r, spec, pos, { ignoreId = null, cache = null } = {}) {
  if (spec.kind !== 'door' || pos.wall < 0) return null
  const other = neighbourAcross(rooms, r, pos.wall, pos.t)
  const half = spec.w / 2 - 0.02
  const a = neighbourAcross(rooms, r, pos.wall, pos.t - half), b = neighbourAcross(rooms, r, pos.wall, pos.t + half)
  if ((a && String(a._id)) !== (b && String(b._id)) || (other && String(other._id)) !== (a && String(a._id)))
    return { name: (other || a || b).name, straddle: true }
  if (!other) return null
  const there = (pos.wall + 2) % 4
  const at = onWall(other.dimension, spec, there, sameSpotOn(r, pos.wall, pos.t, other, there))
  if (!at) return other
  const key = String(other._id)
  let items = cache?.get(key)
  if (!items) { items = itemsOfRoom(other); cache?.set(key, items) }
  if (ignoreId) items = items.filter((i) => i.id !== String(ignoreId))
  return isBlocked({ spec, ...at }, items) ? other : null
}

export const needsOutsideWall = (spec) => spec.kind === 'window' || (spec.kind === 'door' && spec.variant === 'glass')

export function roomBehindOpening(rooms, r, spec, pos) {
  if (pos.wall < 0) return null
  const half = spec.w / 2 - 0.02
  return neighbourAcross(rooms, r, pos.wall, pos.t) || neighbourAcross(rooms, r, pos.wall, pos.t - half) || neighbourAcross(rooms, r, pos.wall, pos.t + half)
}

export const outsideOnlyMessage = (spec, roomName) =>
  `${spec.kind === 'window' ? 'Windows' : 'Balcony sliding doors'} belong on an outside wall, and that part of the wall faces the ${roomName}. Try a wall with the outdoors behind it.`
