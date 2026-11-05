import { sinkSpan, resolveSpec } from './applianceModels.js'

export const WALL_THICKNESS = 0.1
const GAP = 0.02   // small gap left between an item and the wall
const SNAP = 0.45  // a floor item this close (metres) to a wall snaps onto the wall

// For each wall: NORMAL points into the room, TANGENT points along the wall.
export const NORMAL = [[0, 1], [-1, 0], [0, -1], [1, 0]]
export const TANGENT = [[1, 0], [0, 1], [-1, 0], [0, -1]]

// ============================================================
// SMALL HELPERS
// ============================================================

// Keep a number between a low and a high limit.
function clamp(value, low, high) {
  return Math.max(low, Math.min(high, value))
}

function isMissing(value) {
  return value === undefined || value === null
}

// Length of wall number i (walls 0 and 2 are as long as the width, 1 and 3 as long as the depth).
export function wallLength(room, i) {
  if (i % 2 === 1) {
    return room.d
  }
  return room.w
}

// The [x, z] position of a point that is t metres along wall i.
export function wallPoint(room, i, t) {
  const starts = [[0, 0], [room.w, 0], [room.w, room.d], [0, room.d]]
  const start = starts[i]
  return [start[0] + TANGENT[i][0] * t, start[1] + TANGENT[i][1] * t]
}

// Which wall is closest to the point
export function nearestWall(room, p) {
  const x = p[0]
  const z = p[1]
  const distances = [z, room.w - x, room.d - z, x]
  const alongs = [x, z, room.w - x, room.d - z]

  const smallest = Math.min(distances[0], distances[1], distances[2], distances[3])
  const i = distances.indexOf(smallest)
  return { i: i, d: distances[i], t: alongs[i] }
}

// Half the width and half the depth of the space an item covers once it is turned by rotY.
function halfExtent(w, d, rotY) {
  const c = Math.abs(Math.cos(rotY))
  const s = Math.abs(Math.sin(rotY))
  return [c * w / 2 + s * d / 2, s * w / 2 + c * d / 2]
}

// Make a "candidate" object (the spec plus a position) so we can test it for clashes.
function candidateAt(spec, pos) {
  return { spec: spec, x: pos.x, z: pos.z, rotY: pos.rotY, wall: pos.wall, t: pos.t, on: pos.on, cu: pos.cu }
}

// ============================================================
// PLACING AN ITEM
// ============================================================

// Put an item flat against wall i, t metres along it.
export function onWall(room, spec, i, t) {
  const half = spec.w / 2 + 0.05
  const length = wallLength(room, i)
  if (length < spec.w + 0.1) {
    return null
  }

  const alongT = clamp(t, half, length - half)
  const n = NORMAL[i]

  // Doors and windows sit inside the wall. Everything else sits in front of it.
  let gap = GAP
  if (!isMissing(spec.gap)) {
    gap = spec.gap
  }
  let offset = spec.d / 2 + gap
  if (spec.mode === 'opening') {
    offset = -WALL_THICKNESS / 2
  }

  const point = wallPoint(room, i, alongT)
  return {
    x: point[0] + n[0] * offset,
    z: point[1] + n[1] * offset,
    rotY: Math.atan2(n[0], n[1]),
    wall: i,
    t: alongT,
  }
}

const COUNTER_EDGE = 0.03  // keep items this far from the edge of a counter
const SINK_MARGIN = 0.03   // keep items this far from a sink

// The position of an item that stands on a counter, "cu" metres from the counter's middle.
export function counterPose(counter, spec, cu) {
  const u = TANGENT[counter.wall]
  const n = NORMAL[counter.wall]
  const back = -(counter.spec.d / 2 - spec.d / 2 - COUNTER_EDGE)
  return {
    x: counter.x + u[0] * cu + n[0] * back,
    z: counter.z + u[1] * cu + n[1] * back,
    rotY: counter.rotY,
    wall: -1,
    t: 0,
    on: counter.id,
    cu: cu,
  }
}

// Put an item on a counter, but never on top of the counter's sink.
function onCounter(counter, spec, cu) {
  const limit = Math.max(0, counter.spec.w / 2 - spec.w / 2 - COUNTER_EDGE)
  let newCu = clamp(cu, -limit, limit)

  const sink = sinkSpan(counter.spec)
  if (sink) {
    const low = sink[0] - spec.w / 2 - SINK_MARGIN
    const high = sink[1] + spec.w / 2 + SINK_MARGIN

    // The item would sit on the sink, so try the spot just before or just after it.
    if (newCu > low && newCu < high) {
      const sides = []
      if (low >= -limit - 1e-9 && low <= limit + 1e-9) {
        sides.push(low)
      }
      if (high >= -limit - 1e-9 && high <= limit + 1e-9) {
        sides.push(high)
      }
      if (sides.length === 0) {
        return null
      }

      // choose the side that is closest to where we wanted to go
      let best = sides[0]
      for (const side of sides) {
        if (Math.abs(side - newCu) < Math.abs(best - newCu)) {
          best = side
        }
      }
      newCu = best
    }
  }

  return counterPose(counter, spec, newCu)
}

// Which counter is the point p = [x, z] over?
function counterAt(items, p) {
  let best = null
  for (const c of items) {
    if (c.spec.kind !== 'counter') {
      continue
    }

    const u = TANGENT[c.wall]
    const n = NORMAL[c.wall]
    const dx = (p[0] - c.x) * u[0] + (p[1] - c.z) * u[1]
    const dn = (p[0] - c.x) * n[0] + (p[1] - c.z) * n[1]

    // too far from this counter
    if (Math.abs(dx) > c.spec.w / 2 + 0.15 || Math.abs(dn) > c.spec.d / 2 + 0.3) {
      continue
    }

    if (!best || Math.abs(dn) < best.dn) {
      best = { c: c, dx: dx, dn: Math.abs(dn) }
    }
  }
  return best
}

// Work out where an item goes when the user points at p = [x, z].
// "current" is the item being moved (so we can keep its rotation), "items" are the others.
export function placeAt(room, spec, p, current, items = []) {
  // things that stand on a counter
  if (spec.mode === 'top') {
    const hit = counterAt(items, p)
    if (hit) {
      return onCounter(hit.c, spec, hit.dx)
    }
    return null
  }

  // things that hang from the ceiling
  if (spec.mode === 'ceiling') {
    return { x: clamp(p[0], 0.3, room.w - 0.3), z: clamp(p[1], 0.3, room.d - 0.3), rotY: 0, wall: -1, t: 0 }
  }

  // wall items, and floor items that are close to a wall, snap onto the wall
  const near = nearestWall(room, p)
  if (spec.mode !== 'floor' || near.d < spec.d / 2 + SNAP) {
    return onWall(room, spec, near.i, near.t)
  }

  // floor items in the middle of the room stay where they are pointed
  let rotY = 0
  if (current) {
    rotY = current.rotY
  }
  const half = halfExtent(spec.w, spec.d, rotY)
  return { x: clamp(p[0], half[0], room.w - half[0]), z: clamp(p[1], half[1], room.d - half[1]), rotY: rotY, wall: -1, t: 0 }
}

// ============================================================
// CHECKING FOR CLASHES
// ============================================================

// Check if item stand on the floor (not hanging from the ceiling)
function isGround(spec) {
  return spec.y === 0 && spec.mode !== 'ceiling'
}

// The floor area an item needs: a centre (x, z) and half sizes (hx, hz).
function footprint(item) {
  const spec = item.spec

  if (spec.kind === 'door') {
    const n = NORMAL[item.wall]
    const half = halfExtent(spec.w, 0.9, item.rotY)
    return { x: item.x + n[0] * 0.5, z: item.z + n[1] * 0.5, hx: half[0], hz: half[1] }
  }

  const half = halfExtent(spec.w, spec.d, item.rotY)
  return { x: item.x, z: item.z, hx: half[0], hz: half[1] }
}

// Check item overlap
function clash(a, b) {
  // a stretch of wall that has been knocked out: nothing can hang on it
  if (a.spec.kind === 'gap' || b.spec.kind === 'gap') {
    const gap = a.spec.kind === 'gap' ? a : b
    const other = gap === a ? b : a
    if (other.spec.kind === 'gap' || other.spec.mode !== 'wall' || other.wall !== gap.wall) {
      return false
    }
    return Math.abs(other.t - gap.t) < (other.spec.w + gap.spec.w) / 2
  }

  // ceiling items only clash with other ceiling items
  if (a.spec.mode === 'ceiling' || b.spec.mode === 'ceiling') {
    if (a.spec.mode !== b.spec.mode) {
      return false
    }
    return Math.abs(a.x - b.x) < (a.spec.w + b.spec.w) / 2 && Math.abs(a.z - b.z) < (a.spec.d + b.spec.d) / 2
  }

  // counter-top items only clash with items on the same counter
  if (a.spec.mode === 'top' || b.spec.mode === 'top') {
    return a.spec.mode === b.spec.mode && a.on === b.on && Math.abs(a.cu - b.cu) < (a.spec.w + b.spec.w) / 2 + 0.03
  }

  // two floor items clash if their floor areas overlap
  if (isGround(a.spec) && isGround(b.spec)) {
    const fa = footprint(a)
    const fb = footprint(b)
    return Math.abs(fa.x - fb.x) < fa.hx + fb.hx - 0.01 && Math.abs(fa.z - fb.z) < fa.hz + fb.hz - 0.01
  }

  // otherwise both must be on the same wall, side by side AND at the same height
  if (a.wall < 0 || a.wall !== b.wall) {
    return false
  }
  const along = Math.abs(a.t - b.t) < (a.spec.w + b.spec.w) / 2 + 0.05
  const sameHeight = a.spec.y < b.spec.y + b.spec.h && b.spec.y < a.spec.y + a.spec.h
  return along && sameHeight
}

// The knocked-out stretches of a room's walls, as pretend items that wall-mounted things
// (aircon, TV, counter, heater) may not overlap. Add them to the "others" list when checking a spot.
export function gapsOf(room) {
  const gaps = []
  const open = (room && room.openWalls) || []
  for (let i = 0; i < open.length; i++) {
    const o = open[i]
    gaps.push({
      id: 'gap:' + i,
      spec: { kind: 'gap', mode: 'opening', w: o.t1 - o.t0, h: 3, d: 0.1, y: 0 },
      x: 0,
      z: 0,
      rotY: 0,
      wall: o.wall,
      t: (o.t0 + o.t1) / 2,
    })
  }
  return gaps
}

// Check clash
export function isBlocked(candidate, others) {
  for (const other of others) {
    if (other !== candidate && clash(candidate, other)) {
      return true
    }
  }
  return false
}

// Find a free spot for a new item. Gives a position, or null if there is none.
export function findSpot(room, spec, others) {
  // Test one position: gives the position if it is free, otherwise null.
  function tryIt(pos) {
    if (pos && !isBlocked(candidateAt(spec, pos), others)) {
      return pos
    }
    return null
  }

  // counter-top items: slide along each counter in small steps
  if (spec.mode === 'top') {
    for (const c of others) {
      if (c.spec.kind !== 'counter') {
        continue
      }
      for (let cu = -c.spec.w / 2; cu <= c.spec.w / 2; cu += 0.05) {
        const hit = tryIt(onCounter(c, spec, cu))
        if (hit) {
          return hit
        }
      }
    }
    return null
  }

  // everything except ceiling items: try the walls, longest wall first,
  // and start from the middle of each wall
  if (spec.mode !== 'ceiling') {
    const walls = [0, 1, 2, 3]
    walls.sort(function (a, b) {
      return wallLength(room, b) - wallLength(room, a)
    })

    for (const i of walls) {
      const middle = wallLength(room, i) / 2
      const positions = []
      for (let t = 0; t <= wallLength(room, i); t += 0.15) {
        positions.push(t)
      }
      positions.sort(function (a, b) {
        return Math.abs(a - middle) - Math.abs(b - middle)
      })

      for (const t of positions) {
        const hit = tryIt(onWall(room, spec, i, t))
        if (hit) {
          return hit
        }
      }
    }
  }

  // wall items and doors/windows must be on a wall, so there is nothing more to try
  if (spec.mode === 'wall' || spec.mode === 'opening') {
    return null
  }

  // floor and ceiling items: try points of a grid across the room
  const spots = []
  for (let x = 0.4; x < room.w; x += 0.3) {
    for (let z = 0.4; z < room.d; z += 0.3) {
      spots.push([x, z])
    }
  }

  // ceiling items prefer the middle of the room
  if (spec.mode === 'ceiling') {
    spots.sort(function (a, b) {
      return Math.hypot(a[0] - room.w / 2, a[1] - room.d / 2) - Math.hypot(b[0] - room.w / 2, b[1] - room.d / 2)
    })
  }

  for (const p of spots) {
    const hit = tryIt(placeAt(room, spec, p, undefined, others))
    if (hit) {
      return hit
    }
  }
  return null
}

// ============================================================
// WALLS WITH HOLES FOR DOORS AND WINDOWS
// ============================================================

// Cut each wall into rectangular pieces, leaving holes where doors and windows are.
export function wallPieces(room, items, trimStart = []) {
  const pieces = []

  // only add a piece if it is big enough to see
  function addPiece(wall, t0, t1, y0, y1) {
    if (t1 - t0 > 0.01 && y1 - y0 > 0.01) {
      pieces.push({ wall: wall, t0: t0, t1: t1, y0: y0, y1: y1 })
    }
  }

  for (let i = 0; i < 4; i++) {
    // the doors and windows on this wall, from left to right
    const openings = items.filter(function (item) {
      return item.spec.mode === 'opening' && item.wall === i
    })
    openings.sort(function (a, b) {
      return a.t - b.t
    })

    let t = -WALL_THICKNESS
    if (trimStart[i]) {
      t = 0
    }

    for (const opening of openings) {
      const t0 = opening.t - opening.spec.w / 2
      const t1 = opening.t + opening.spec.w / 2
      addPiece(i, t, t0, 0, room.h)
      addPiece(i, t0, t1, 0, opening.spec.y)
      addPiece(i, t0, t1, opening.spec.y + opening.spec.h, room.h)
      t = t1
    }
    addPiece(i, t, wallLength(room, i), 0, room.h)
  }

  return pieces
}

// ============================================================
// NEIGHBOURING ROOMS (rooms are laid out on one shared flat floor plan)
// ============================================================

// Where a wall starts, and how long it is, on the shared floor plan.
function wallAxis(room, wall) {
  if (wall % 2 === 0) {
    return { start: room.origin.x, length: room.dimension.w }
  }
  return { start: room.origin.z, length: room.dimension.d }
}

// Position t on a wall -> position on the shared floor plan
function toFlat(room, wall, t) {
  const axis = wallAxis(room, wall)
  if (wall >= 2) {
    return axis.start + axis.length - t
  }
  return axis.start + t
}

// Position on the shared floor plan -> position t on a wall
function fromFlat(room, wall, g) {
  const axis = wallAxis(room, wall)
  if (wall >= 2) {
    return axis.start + axis.length - g
  }
  return g - axis.start
}

// The stretch of a wall that "other" room lies alongside. Gives { t0, t1 } or null.
export function sharedRange(room, other, wall) {
  const a = wallAxis(room, wall)
  const b = wallAxis(other, wall)
  const low = Math.max(a.start, b.start)
  const high = Math.min(a.start + a.length, b.start + b.length)
  if (high <= low) {
    return null
  }

  const t1 = fromFlat(room, wall, low)
  const t2 = fromFlat(room, wall, high)
  return { t0: Math.min(t1, t2), t1: Math.max(t1, t2) }
}

// The same physical spot, but measured along the wall of the other room.
export function sameSpotOn(room, wall, t, other, otherWall) {
  return fromFlat(other, otherWall, toFlat(room, wall, t))
}

// A room as a simple rectangle { x, z, w, d }
function rectOf(room) {
  return { x: room.origin.x, z: room.origin.z, w: room.dimension.w, d: room.dimension.d }
}

// Position along a wall (t) for a position g on the shared floor plan, and the other way round.
function tAlong(r, wall, g) {
  const values = [g - r.x, g - r.z, r.x + r.w - g, r.z + r.d - g]
  return values[wall]
}
function gAlong(r, wall, t) {
  const values = [r.x + t, r.z + t, r.x + r.w - t, r.z + r.d - t]
  return values[wall]
}

const NEAR = 0.02  // walls closer than this (metres) count as touching

// Check for shared walls
export function sharedWall(A, B) {
  const a = rectOf(A)
  const b = rectOf(B)

  const tests = [
    { wall: 0, touching: Math.abs(a.z - (b.z + b.d)) < NEAR, a0: a.x, a1: a.x + a.w, b0: b.x, b1: b.x + b.w },
    { wall: 1, touching: Math.abs(a.x + a.w - b.x) < NEAR, a0: a.z, a1: a.z + a.d, b0: b.z, b1: b.z + b.d },
    { wall: 2, touching: Math.abs(a.z + a.d - b.z) < NEAR, a0: a.x, a1: a.x + a.w, b0: b.x, b1: b.x + b.w },
    { wall: 3, touching: Math.abs(a.x - (b.x + b.w)) < NEAR, a0: a.z, a1: a.z + a.d, b0: b.z, b1: b.z + b.d },
  ]

  for (const test of tests) {
    if (!test.touching) {
      continue
    }
    const low = Math.max(test.a0, test.b0)
    const high = Math.min(test.a1, test.b1)
    if (high - low > 0.05) {
      return { wall: test.wall, length: high - low, t: tAlong(a, test.wall, (low + high) / 2) }
    }
  }
  return null
}

// Make a copy of a plain object
function copyOf(object) {
  const copy = {}
  for (const key in object) {
    copy[key] = object[key]
  }
  return copy
}

// When a room is resized or moved, move its items with it.
export function refitPlacements(oldR, newR, carry) {
  const od = oldR.dimension
  const nd = newR.dimension
  const oo = oldR.origin
  const no = newR.origin
  const margin = 0.3

  const out = []
  const oldPlacements = oldR.placements || []
  for (const placement of oldPlacements) {
    out.push(copyOf(placement))
  }

  // how far each item moved, so items standing on it can move with it
  const moved = {}

  // 1. Items that stand on their own (not on a counter)
  for (const p of out) {
    if (p.onPlacementId) {
      continue
    }

    let nx
    let nz
    if (p.wall >= 0) {
      // an item on a wall: keep it on that wall, at the same distance from the wall
      const n = NORMAL[p.wall]
      const wallSpot = wallPoint(od, p.wall, p.t)
      const offset = (p.x - wallSpot[0]) * n[0] + (p.z - wallSpot[1]) * n[1]
      const g = gAlong(rectOf(oldR), p.wall, p.t)

      let wantedT = tAlong(rectOf(newR), p.wall, g)
      if (carry) {
        wantedT = p.t
      }
      const nt = clamp(wantedT, margin, Math.max(margin, wallLength(nd, p.wall) - margin))

      const newSpot = wallPoint(nd, p.wall, nt)
      nx = newSpot[0] + n[0] * offset
      nz = newSpot[1] + n[1] * offset
      p.t = nt
    } else {
      // an item on the floor
      let localX = p.x + oo.x - no.x
      let localZ = p.z + oo.z - no.z
      if (carry) {
        localX = p.x
        localZ = p.z
      }
      nx = clamp(localX, margin, Math.max(margin, nd.w - margin))
      nz = clamp(localZ, margin, Math.max(margin, nd.d - margin))
    }

    moved[String(p._id)] = { dx: nx - p.x, dz: nz - p.z }
    p.x = nx
    p.z = nz
  }

  // 2. Items standing on a counter follow their counter
  for (const p of out) {
    if (!p.onPlacementId) {
      continue
    }

    let d = moved[String(p.onPlacementId)]
    if (!d) {
      d = { dx: 0, dz: 0 }
    }

    let shiftX = oo.x - no.x
    let shiftZ = oo.z - no.z
    if (carry) {
      shiftX = 0
      shiftZ = 0
    }

    p.x = clamp(p.x + shiftX + d.dx, margin, Math.max(margin, nd.w - margin))
    p.z = clamp(p.z + shiftZ + d.dz, margin, Math.max(margin, nd.d - margin))
  }

  return out
}

// Turn the placements saved in a room into the "items" the functions above work with.
export function itemsOfRoom(room) {
  const items = []
  const placements = room.placements || []

  for (const p of placements) {
    let cu = 0
    if (!isMissing(p.cu)) {
      cu = p.cu
    }

    let on = undefined
    if (p.onPlacementId) {
      on = String(p.onPlacementId)
    }

    let connectsTo = null
    if (!isMissing(p.connectsTo)) {
      connectsTo = p.connectsTo
    }

    items.push({
      id: String(p._id),
      spec: resolveSpec(p.applianceTypeKey, p.category),
      x: p.x,
      z: p.z,
      rotY: p.rotY,
      wall: p.wall,
      t: p.t,
      cu: cu,
      on: on,
      connectsTo: connectsTo,
    })
  }

  return items
}

// ============================================================
// DOORS AND WINDOWS BETWEEN ROOMS
// ============================================================

// Which room lies across wall "wall" of room r, at position t? (null = outdoors)
function neighbourAcross(rooms, r, wall, t) {
  const a = r.origin
  const d = r.dimension
  const line = [a.z, a.x + d.w, a.z + d.d, a.x][wall]
  const g = [a.x + t, a.z + t, a.x + d.w - t, a.z + d.d - t][wall]

  for (const o of rooms) {
    if (String(o._id) === String(r._id)) {
      continue
    }

    const oo = o.origin
    const od = o.dimension
    const facing = [oo.z + od.d, oo.x, oo.z, oo.x + od.w][wall]
    if (Math.abs(line - facing) > 0.02) {
      continue
    }

    let low = oo.x
    let size = od.w
    if (wall % 2 === 1) {
      low = oo.z
      size = od.d
    }
    if (g > low && g < low + size) {
      return o
    }
  }
  return null
}

// The id of a room as text, or null if there is no room.
function idOf(room) {
  if (!room) {
    return null
  }
  return String(room._id)
}

// A door in room r must also fit in the wall of the room behind it.
export function doorBlockedBeyond(rooms, r, spec, pos, options = {}) {
  if (spec.kind !== 'door' || pos.wall < 0) {
    return null
  }

  const ignoreId = options.ignoreId
  const cache = options.cache

  const other = neighbourAcross(rooms, r, pos.wall, pos.t)
  const half = spec.w / 2 - 0.02
  const a = neighbourAcross(rooms, r, pos.wall, pos.t - half)
  const b = neighbourAcross(rooms, r, pos.wall, pos.t + half)

  // the two edges of the door are not facing the same room
  if (idOf(a) !== idOf(b) || idOf(other) !== idOf(a)) {
    const named = other || a || b
    return { name: named.name, straddle: true }
  }

  // nothing behind the door (outdoors)
  if (!other) {
    return null
  }

  // where would the door be on the other room's wall?
  const there = (pos.wall + 2) % 4
  const at = onWall(other.dimension, spec, there, sameSpotOn(r, pos.wall, pos.t, other, there))
  if (!at) {
    return other
  }

  // the items already in the other room (reuse them from the cache if we can)
  const key = String(other._id)
  let items = null
  if (cache) {
    items = cache.get(key)
  }
  if (!items) {
    items = itemsOfRoom(other)
    if (cache) {
      cache.set(key, items)
    }
  }

  if (ignoreId) {
    items = items.filter(function (item) {
      return item.id !== String(ignoreId)
    })
  }

  if (isBlocked(candidateAt(spec, at), items)) {
    return other
  }
  return null
}

// Windows and glass balcony doors must face the outdoors.
export function needsOutsideWall(spec) {
  return spec.kind === 'window' || (spec.kind === 'door' && spec.variant === 'glass')
}

// The room behind an opening, checking the middle and both edges. null = outdoors.
export function roomBehindOpening(rooms, r, spec, pos) {
  if (pos.wall < 0) {
    return null
  }
  const half = spec.w / 2 - 0.02
  return neighbourAcross(rooms, r, pos.wall, pos.t) ||
    neighbourAcross(rooms, r, pos.wall, pos.t - half) ||
    neighbourAcross(rooms, r, pos.wall, pos.t + half)
}

// The message shown when a window or glass door is put on a wall that faces another room.
export function outsideOnlyMessage(spec, roomName) {
  let thing = 'Balcony sliding doors'
  if (spec.kind === 'window') {
    thing = 'Windows'
  }
  return thing + ' belong on an outside wall, and that part of the wall faces the ' + roomName + '. Try a wall with the outdoors behind it.'
}
