const { opening, wallPoint, NORMAL } = require('./floorplan');

const EPS = 0.02;
const MIN = { living: 3.0, kitchen: 1.8, bedroom: 2.4, bathroom: 1.2 };
const MAX = 15;
const DOOR_W = 0.9;
const DOOR = 'timber_flush_door';
const WINDOW = 'single_glazed_window';

class LayoutError extends Error {}

const near = (a, b) => Math.abs(a - b) < EPS;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const snap = (v) => Math.round(v * 10) / 10;
const key = (r) => String(r._id);
const rect = (r) => ({ x: r.origin.x, z: r.origin.z, w: r.dimension.w, d: r.dimension.d });
const span = (a0, a1, b0, b1) => Math.min(a1, b1) - Math.max(a0, b0);
const wallLen = (r, wall) => (wall % 2 ? r.d : r.w);

const tAlong = (r, wall, g) => [g - r.x, g - r.z, r.x + r.w - g, r.z + r.d - g][wall];
const gAlong = (r, wall, t) => [r.x + t, r.z + t, r.x + r.w - t, r.z + r.d - t][wall];

const cloneRoom = (r) => ({
  ...r,
  origin: { ...r.origin }, dimension: { ...r.dimension },
  placements: (r.placements || []).map((p) => ({ ...p })),
  openWalls: (r.openWalls || []).map((o) => ({ ...o })),
});

const isDoor = (p) => p.applianceTypeKey === DOOR;
const isLink = (p) => isDoor(p) && p.connectsTo && p.connectsTo !== 'outside';
const isOutside = (p) => p.applianceTypeKey === WINDOW || (isDoor(p) && p.connectsTo === 'outside');

function touching(A, B) {
  const a = rect(A), b = rect(B);
  const tests = [
    [0, near(a.z, b.z + b.d), a.x, a.x + a.w, b.x, b.x + b.w],
    [1, near(a.x + a.w, b.x), a.z, a.z + a.d, b.z, b.z + b.d],
    [2, near(a.z + a.d, b.z), a.x, a.x + a.w, b.x, b.x + b.w],
    [3, near(a.x, b.x + b.w), a.z, a.z + a.d, b.z, b.z + b.d],
  ];
  for (const [wall, ok, a0, a1, b0, b1] of tests) {
    if (!ok) continue;
    const lo = Math.max(a0, b0), hi = Math.min(a1, b1);
    if (hi - lo > 0.05) return { wallA: wall, wallB: (wall + 2) % 4, lo, hi };
  }
  return null;
}

const exteriorAt = (room, wall, g, rooms) =>
  !rooms.some((o) => { if (o === room) return false; const s = touching(room, o); return s && s.wallA === wall && g > s.lo - EPS && g < s.hi + EPS; });

function assertNoOverlap(rooms) {
  for (let i = 0; i < rooms.length; i++) for (let j = i + 1; j < rooms.length; j++) {
    const a = rect(rooms[i]), b = rect(rooms[j]);
    if (span(a.x, a.x + a.w, b.x, b.x + b.w) > EPS && span(a.z, a.z + a.d, b.z, b.z + b.d) > EPS)
      throw new LayoutError(`The ${rooms[i].name} would overlap the ${rooms[j].name}`);
  }
}

function addLink(a, b, kind, g) {
  const s = touching(a, b);
  if (!s) throw new LayoutError(`The ${a.name} and ${b.name} don't share a wall`);
  const len = s.hi - s.lo, A = rect(a), B = rect(b);
  if (kind === 'door') {
    if (len < DOOR_W + 0.2) throw new LayoutError('The shared wall is too short for a door');
    const c = clamp(g ?? (s.lo + s.hi) / 2, s.lo + DOOR_W / 2 + 0.1, s.hi - DOOR_W / 2 - 0.1);
    a.placements.push(opening(a.dimension, DOOR, '3_tick', s.wallA, tAlong(A, s.wallA, c), b.name));
    b.placements.push(opening(b.dimension, DOOR, '3_tick', s.wallB, tAlong(B, s.wallB, c), a.name));
  } else if (kind === 'open') {
    if (len < 0.6) throw new LayoutError('The shared wall is too short to open up');
    const g0 = s.lo + 0.1, g1 = s.hi - 0.1;
    for (const [r, R, o, wall] of [[a, A, b, s.wallA], [b, B, a, s.wallB]]) {
      const t0 = tAlong(R, wall, g0), t1 = tAlong(R, wall, g1);
      r.openWalls.push({ wall, t0: Math.min(t0, t1), t1: Math.max(t0, t1), to: o.name });
    }
  }
}

function refit(oldR, newR, carry) {
  const od = oldR.dimension, nd = newR.dimension, oo = oldR.origin, no = newR.origin;
  const out = oldR.placements.map((p) => ({ ...p }));
  const delta = new Map();
  const margin = 0.3;
  for (const p of out) {
    if (p.onPlacementId) continue;
    let nx, nz;
    if (p.wall >= 0) {
      const n = NORMAL[p.wall], [px, pz] = wallPoint(od, p.wall, p.t);
      const off = (p.x - px) * n[0] + (p.z - pz) * n[1];
      const g = gAlong({ x: oo.x, z: oo.z, w: od.w, d: od.d }, p.wall, p.t);
      const nt = clamp(carry ? p.t : tAlong({ x: no.x, z: no.z, w: nd.w, d: nd.d }, p.wall, g), margin, Math.max(margin, wallLen(nd, p.wall) - margin));
      const [qx, qz] = wallPoint(nd, p.wall, nt);
      nx = qx + n[0] * off; nz = qz + n[1] * off; p.t = nt;
    } else {
      const lx = carry ? p.x : p.x + oo.x - no.x, lz = carry ? p.z : p.z + oo.z - no.z;
      nx = clamp(lx, margin, Math.max(margin, nd.w - margin)); nz = clamp(lz, margin, Math.max(margin, nd.d - margin));
    }
    delta.set(String(p._id), { dx: nx - p.x, dz: nz - p.z });
    p.x = nx; p.z = nz;
  }
  for (const p of out) {
    if (!p.onPlacementId) continue;
    const d = delta.get(String(p.onPlacementId)) || { dx: 0, dz: 0 };
    const sx = carry ? 0 : oo.x - no.x, sz = carry ? 0 : oo.z - no.z;
    p.x = clamp(p.x + sx + d.dx, margin, Math.max(margin, nd.w - margin));
    p.z = clamp(p.z + sz + d.dz, margin, Math.max(margin, nd.d - margin));
  }
  return out;
}

function relink(rooms) {
  const byName = new Map(rooms.map((r) => [r.name, r]));
  const links = new Map();
  for (const a of rooms) {
    for (const p of a.placements) if (isLink(p)) {
      const b = byName.get(p.connectsTo); if (!b) continue;
      const k = [a.name, b.name].sort().join('|');
      if (!links.has(k)) links.set(k, { a, b, kind: 'door', g: gAlong(rect(a), p.wall, p.t) });
    }
    for (const o of a.openWalls) {
      const b = byName.get(o.to); if (!b) continue;
      links.set([a.name, b.name].sort().join('|'), { a, b, kind: 'open' });
    }
  }
  for (const r of rooms) { r.placements = r.placements.filter((p) => !isLink(p)); r.openWalls = []; }
  for (const { a, b, kind, g } of links.values()) { try { addLink(a, b, kind, g); } catch (e) { if (!(e instanceof LayoutError)) throw e; } }

  for (const r of rooms) {
    const R = rect(r);
    r.placements = r.placements
      .filter((p) => !isOutside(p) || exteriorAt(r, p.wall, gAlong(R, p.wall, p.t), rooms))
      .map((p) => {
        if (!isOutside(p)) return p;
        const t = clamp(p.t, 0.6, Math.max(0.6, wallLen(R, p.wall) - 0.6));
        return { ...opening(r.dimension, p.applianceTypeKey, p.tick, p.wall, t, p.connectsTo), _id: p._id };
      });
  }

  for (const r of rooms) {
    if (r.type !== 'living' || r.placements.some((p) => isDoor(p) && p.connectsTo === 'outside')) continue;
    const R = rect(r);
    for (const wall of [2, 1, 3, 0]) {
      if (wallLen(R, wall) < 1.6 || !rooms.every((o) => o === r || !touching(r, o) || touching(r, o).wallA !== wall)) continue;
      r.placements.push(opening(r.dimension, DOOR, '3_tick', wall, wallLen(R, wall) * 0.33, 'outside'));
      break;
    }
  }

  for (const r of rooms) {
    if (r.type === 'living' || r.placements.some(isLink) || r.openWalls.length) continue;
    let best = null;
    for (const o of rooms) {
      if (o === r) continue;
      const suitable = o.type === 'living' || (r.type === 'bathroom' && o.type === 'bedroom') || (r.type === 'bedroom' && o.type === 'bathroom');
      if (!suitable) continue;
      const s = touching(r, o);
      if (!s || s.hi - s.lo < DOOR_W + 0.2) continue;
      const score = (o.type === 'living' ? 100 : 0) + (s.hi - s.lo);
      if (!best || score > best.score) best = { o, score };
    }
    if (best) addLink(r, best.o, 'door');
  }
}

const footprintOf = (rooms) => {
  if (!rooms.length) return { x: 0, z: 0, w: 0, d: 0 };
  const x0 = Math.min(...rooms.map((r) => r.origin.x)), z0 = Math.min(...rooms.map((r) => r.origin.z));
  const x1 = Math.max(...rooms.map((r) => r.origin.x + r.dimension.w)), z1 = Math.max(...rooms.map((r) => r.origin.z + r.dimension.d));
  return { x: x0, z: z0, w: x1 - x0, d: z1 - z0 };
};

function warnings(rooms) {
  const out = [];
  for (const r of rooms) {
    if (rooms.length > 1 && !r.placements.some(isLink) && !(r.openWalls || []).length) out.push(`The ${r.name} has no door or opening to another room`);
    if (r.type === 'living' && !r.placements.some((p) => isDoor(p) && p.connectsTo === 'outside')) out.push(`The ${r.name} has no front door (it needs a free outside wall)`);
  }
  return out;
}

const BUILD_LIMIT = { min: -20, max: 40 };

function checkRect(rooms, rect, type, exceptId) {
  const min = MIN[type];
  if (rect.w < min - EPS || rect.d < min - EPS) throw new LayoutError(`A ${type} can't be smaller than ${min} m`);
  if (rect.w > MAX || rect.d > MAX) throw new LayoutError(`Rooms can be at most ${MAX} m across`);
  if (rect.x < BUILD_LIMIT.min || rect.z < BUILD_LIMIT.min || rect.x + rect.w > BUILD_LIMIT.max || rect.z + rect.d > BUILD_LIMIT.max)
    throw new LayoutError('That is outside the build area');
  const clash = rooms.find((o) => key(o) !== String(exceptId) &&
    span(rect.x, rect.x + rect.w, o.origin.x, o.origin.x + o.dimension.w) > EPS && span(rect.z, rect.z + rect.d, o.origin.z, o.origin.z + o.dimension.d) > EPS);
  if (clash) throw new LayoutError(`That would overlap the ${clash.name}`);
}
const snapRect = (r) => ({ x: snap(r.x), z: snap(r.z), w: snap(r.w), d: snap(r.d) });

function setRoomRect(rooms, id, rect) {
  const work = rooms.map(cloneRoom);
  const R = work.find((r) => key(r) === String(id));
  if (!R) throw new LayoutError('Room not found');
  const next = snapRect(rect);
  checkRect(work, next, R.type, id);
  const old = cloneRoom(R);
  const resized = !near(next.w, R.dimension.w) || !near(next.d, R.dimension.d);
  R.origin = { x: next.x, z: next.z };
  R.dimension.w = next.w; R.dimension.d = next.d;
  R.placements = refit(old, R, !resized);
  relink(work);
  return work;
}

const widthOfPlacement = (p) => (/window/.test(p.applianceTypeKey) ? 1.2 : /glass/.test(p.applianceTypeKey) ? 1.6 : DOOR_W);
const isOpeningPlacement = (p) => p.category === 'build' && p.wall >= 0 && /window|door/.test(p.applianceTypeKey);

const exteriorSpan = (room, wall, g0, g1, rooms) =>
  !rooms.some((o) => { if (o === room) return false; const s = touching(room, o); return s && s.wallA === wall && span(g0, g1, s.lo, s.hi) > EPS; });

function slotIsFree(room, wall, t, width, ignoreId) {
  const gap = 0.1;
  const hitsOpening = room.placements.some((p) =>
    isOpeningPlacement(p) && String(p._id) !== String(ignoreId) && p.wall === wall &&
    Math.abs(p.t - t) < (widthOfPlacement(p) + width) / 2 + gap);
  const hitsOpenWall = room.openWalls.some((o) => o.wall === wall && o.t0 < t + width / 2 + gap && o.t1 > t - width / 2 - gap);
  return !hitsOpening && !hitsOpenWall;
}

function repositionOpening(room, p, wall, t) {
  const moved = { ...opening(room.dimension, p.applianceTypeKey, p.tick, wall, t, p.connectsTo), _id: p._id };
  room.placements = room.placements.map((q) => (q === p ? moved : q));
}

function moveOpening(rooms, roomId, placementId, wall, t) {
  if (![0, 1, 2, 3].includes(wall)) throw new LayoutError('wall must be 0-3');
  if (!Number.isFinite(t)) throw new LayoutError('Say where along the wall it should go');

  const work = rooms.map(cloneRoom);
  const room = work.find((r) => key(r) === String(roomId));
  const p = room && room.placements.find((x) => String(x._id) === String(placementId));
  if (!p || !isOpeningPlacement(p)) throw new LayoutError('Only doors and windows can be moved this way');

  const R = rect(room), width = widthOfPlacement(p), half = width / 2;
  const margin = Math.max(0.6, half + 0.15);


  if (isLink(p)) {
    const neighbour = work.find((o) => o.name === p.connectsTo);
    const shared = neighbour && touching(room, neighbour);
    if (!shared) throw new LayoutError('That door no longer joins two rooms');
    const partner = neighbour.placements.find((q) => isLink(q) && q.connectsTo === room.name && q.wall === shared.wallB);

    const lo = shared.lo + half + 0.1, hi = shared.hi - half - 0.1;
    if (lo > hi) throw new LayoutError('The shared wall is too short to move this door');
    const g = clamp(gAlong(R, shared.wallA, t), lo, hi);          // position in flat coordinates
    const tHere = snap(tAlong(R, shared.wallA, g));
    const tThere = snap(tAlong(rect(neighbour), shared.wallB, gAlong(R, shared.wallA, tHere)));

    if (!slotIsFree(room, shared.wallA, tHere, width, p._id)) throw new LayoutError('There is already a door or window there');
    if (partner && !slotIsFree(neighbour, shared.wallB, tThere, width, partner._id)) throw new LayoutError('Something on the other side is in the way');

    repositionOpening(room, p, shared.wallA, tHere);
    if (partner) repositionOpening(neighbour, partner, shared.wallB, tThere);
    return work;
  }

  const len = wallLen(R, wall);
  if (len < 2 * margin) throw new LayoutError('That wall is too short');
  const tc = snap(clamp(t, margin, len - margin));
  const ga = gAlong(R, wall, tc - half), gb = gAlong(R, wall, tc + half);
  if (!exteriorSpan(room, wall, Math.min(ga, gb), Math.max(ga, gb), work))
    throw new LayoutError('That part of the wall faces another room - windows and front doors belong on an outside wall');
  if (!slotIsFree(room, wall, tc, width, p._id)) throw new LayoutError('There is already a door or window there');

  repositionOpening(room, p, wall, tc);
  return work;
}

function removeOpening(rooms, roomId, placementId) {
  const work = rooms.map(cloneRoom);
  const room = work.find((r) => key(r) === String(roomId));
  const p = room && room.placements.find((x) => String(x._id) === String(placementId));
  if (!p || !isOpeningPlacement(p)) throw new LayoutError('Only doors and windows can be removed this way');

  room.placements = room.placements.filter((q) => q !== p);
  if (isLink(p)) {
    const neighbour = work.find((o) => o.name === p.connectsTo);
    if (neighbour) neighbour.placements = neighbour.placements.filter((q) => !(isLink(q) && q.connectsTo === room.name));
  }
  return work;
}

function validateLayout(rooms) {
  if (!Array.isArray(rooms) || !rooms.length) throw new LayoutError('A flat needs at least one room');
  if (rooms.length > 40) throw new LayoutError('Too many rooms');
  const names = new Set(), ids = new Set(), accepted = [];
  for (const r of rooms) {
    if (!MIN[r.type]) throw new LayoutError(`Unknown room type ${r.type}`);
    if (!r.name || r.name.length > 40) throw new LayoutError('Every room needs a name of 1-40 characters');
    if (names.has(r.name)) throw new LayoutError(`There is already a room called ${r.name}`);
    if (ids.has(key(r))) throw new LayoutError('Duplicate room id');
    names.add(r.name); ids.add(key(r));
    if (!(r.dimension.h >= 2.2 && r.dimension.h <= 4)) throw new LayoutError('Ceiling height must be between 2.2 and 4 m');
    checkRect(accepted, { x: r.origin.x, z: r.origin.z, w: r.dimension.w, d: r.dimension.d }, r.type, null);
    accepted.push(r);
    for (const o of r.openWalls || []) if (![0, 1, 2, 3].includes(o.wall) || !(o.t1 > o.t0)) throw new LayoutError('Bad opening in a wall');
  }
  if (!rooms.some((r) => r.type === 'living')) throw new LayoutError('A flat needs a living room');
  return rooms;
}

module.exports = { LayoutError, footprintOf, warnings, setRoomRect, moveOpening, removeOpening, validateLayout };