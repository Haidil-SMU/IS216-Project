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

export function onCounter(counter, spec, cu) {
  const lim = Math.max(0, counter.spec.w / 2 - spec.w / 2 - 0.03)
  cu = clamp(cu, -lim, lim)
  const u = TANGENT[counter.wall], n = NORMAL[counter.wall]
  const back = -(counter.spec.d / 2 - spec.d / 2 - 0.03)
  return { x: counter.x + u[0] * cu + n[0] * back, z: counter.z + u[1] * cu + n[1] * back, rotY: counter.rotY, wall: -1, t: 0, on: counter.id, cu }
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

export function wallPieces(room, items) {
  const out = []
  const add = (wall, t0, t1, y0, y1) => { if (t1 - t0 > 0.01 && y1 - y0 > 0.01) out.push({ wall, t0, t1, y0, y1 }) }
  for (let i = 0; i < 4; i++) {
    const ops = items.filter((o) => o.spec.mode === 'opening' && o.wall === i).sort((a, b) => a.t - b.t)
    let t = -WALL_THICKNESS
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