const { ObjectId } = require('mongodb');
const { opening, wallPoint, NORMAL, isOpeningKey, generateRooms } = require('./floorplan');

// ============================================================================
// Constants and error types
// ============================================================================

const EPS = 0.02;
const MIN = { living: 3.0, kitchen: 1.8, bedroom: 2.4, bathroom: 1.2 };
const MAX = 15;
const DOOR_W = 0.9;
const DOOR = 'timber_flush_door';
const OUTSIDE_ONLY = ['single_glazed_window', 'double_glazed_window', 'glass_sliding_door'];
const BUILD_LIMIT = { min: -20, max: 40 };

class LayoutError extends Error {}
class PlacementError extends Error {}

// ============================================================================
// Small helpers
// ============================================================================

// True when two numbers are almost the same.
function near(a, b) {
  return Math.abs(a - b) < EPS;
}

// Keeps v between lo and hi.
function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

// Rounds to 1 decimal place (10 cm).
function snap(v) {
  return Math.round(v * 10) / 10;
}

// The room's id as text, so ids can be compared safely.
function roomKey(r) {
  return String(r._id);
}

// The room as a plain rectangle on the floor plan.
function rect(r) {
  return { x: r.origin.x, z: r.origin.z, w: r.dimension.w, d: r.dimension.d };
}

// How much two stretches (a0..a1 and b0..b1) overlap. Negative means a gap.
function span(a0, a1, b0, b1) {
  return Math.min(a1, b1) - Math.max(a0, b0);
}

// Length of a wall. r only needs w and d, so a room's dimension works too.
function wallLen(r, wall) {
  if (wall % 2) {
    return r.d;
  }
  return r.w;
}

// Floor-plan position g -> distance t along the wall.
function tAlong(r, wall, g) {
  const list = [g - r.x, g - r.z, r.x + r.w - g, r.z + r.d - g];
  return list[wall];
}

// Distance t along the wall -> floor-plan position g.
function gAlong(r, wall, t) {
  const list = [r.x + t, r.z + t, r.x + r.w - t, r.z + r.d - t];
  return list[wall];
}

// True when the value is null or undefined.
function isMissing(v) {
  return v === null || v === undefined;
}

// Makes a one-level copy of an object (same keys, same order).
function copyObject(obj) {
  const copy = {};
  for (const name of Object.keys(obj)) {
    copy[name] = obj[name];
  }
  return copy;
}

// Makes a copy of a list of objects, copying each object.
function copyList(list) {
  const copy = [];
  for (const item of list) {
    copy.push(copyObject(item));
  }
  return copy;
}

// A full copy of a room, so we can change the copy without touching the original.
function cloneRoom(r) {
  const copy = copyObject(r);
  copy.origin = copyObject(r.origin);
  copy.dimension = copyObject(r.dimension);
  copy.placements = copyList(r.placements || []);
  copy.openWalls = copyList(r.openWalls || []);
  return copy;
}

// Finds the room with this id. Returns null if there is none.
function roomById(rooms, id) {
  for (const room of rooms) {
    if (roomKey(room) === String(id)) {
      return room;
    }
  }
  return null;
}

// Finds the (first) room with this name. Returns null if there is none.
function roomNamed(rooms, name) {
  for (const room of rooms) {
    if (room.name === name) {
      return room;
    }
  }
  return null;
}

// Finds a placement in a room by its id. Returns null if there is none.
function placementById(room, id) {
  for (const p of room.placements) {
    if (String(p._id) === String(id)) {
      return p;
    }
  }
  return null;
}

// A copy of the room that does not have the given placement in its list.
function withoutPlacement(room, placement) {
  const copy = copyObject(room);
  const kept = [];
  for (const q of room.placements) {
    if (q !== placement) {
      kept.push(q);
    }
  }
  copy.placements = kept;
  return copy;
}

// A list of the placements without the given one.
function listWithout(placements, placement) {
  const kept = [];
  for (const q of placements) {
    if (q !== placement) {
      kept.push(q);
    }
  }
  return kept;
}

// ============================================================================
// What kind of placement is it?
// ============================================================================

function isDoor(p) {
  return p.applianceTypeKey === DOOR;
}

// A door that joins two rooms.
function isLink(p) {
  if (!isDoor(p)) {
    return false;
  }
  if (!p.connectsTo) {
    return false;
  }
  return p.connectsTo !== 'outside';
}

// A window, balcony door or front door: things that must face the outside.
function isOutside(p) {
  if (OUTSIDE_ONLY.includes(p.applianceTypeKey)) {
    return true;
  }
  return isDoor(p) && p.connectsTo === 'outside';
}

function outsideOnlyMessage(p) {
  let name = 'Windows';
  if (p.applianceTypeKey === 'glass_sliding_door') {
    name = 'Balcony sliding doors';
  }
  return `${name} belong on an outside wall, but that part of the wall faces another room`;
}

// A door or window that sits on a wall.
function isOpening(p) {
  return p.category === 'build' && isOpeningKey(p.applianceTypeKey);
}

// Same as isOpening, but the placement must also be on a wall (wall 0 or more).
function isOpeningPlacement(p) {
  return p.category === 'build' && p.wall >= 0 && isOpeningKey(p.applianceTypeKey);
}

// How wide a door or window is, in metres.
function widthOfPlacement(p) {
  const name = String(p.applianceTypeKey);
  if (name.includes('window')) {
    return 1.2;
  }
  if (name.includes('glass')) {
    return 1.6;
  }
  return DOOR_W;
}

// ============================================================================
// Which rooms touch each other?
// ============================================================================

// One wall test used by touching(): returns the shared stretch or null.
function sharedStretch(wall, ok, a0, a1, b0, b1) {
  if (!ok) {
    return null;
  }
  const lo = Math.max(a0, b0);
  const hi = Math.min(a1, b1);
  if (hi - lo > 0.05) {
    return { wallA: wall, wallB: (wall + 2) % 4, lo: lo, hi: hi };
  }
  return null;
}

// If rooms A and B share a wall, returns
//   { wallA, wallB, lo, hi }  (their wall numbers and the shared stretch lo..hi)
// otherwise null.
function touching(A, B) {
  const a = rect(A);
  const b = rect(B);

  const results = [
    sharedStretch(0, near(a.z, b.z + b.d), a.x, a.x + a.w, b.x, b.x + b.w),
    sharedStretch(1, near(a.x + a.w, b.x), a.z, a.z + a.d, b.z, b.z + b.d),
    sharedStretch(2, near(a.z + a.d, b.z), a.x, a.x + a.w, b.x, b.x + b.w),
    sharedStretch(3, near(a.x, b.x + b.w), a.z, a.z + a.d, b.z, b.z + b.d),
  ];
  for (const found of results) {
    if (found) {
      return found;
    }
  }
  return null;
}

// True when the spot g on this wall faces the outside (no other room there).
function exteriorAt(room, wall, g, rooms) {
  for (const o of rooms) {
    if (o === room) {
      continue;
    }
    const s = touching(room, o);
    if (s && s.wallA === wall && g > s.lo - EPS && g < s.hi + EPS) {
      return false;
    }
  }
  return true;
}

// True when the whole stretch g0..g1 on this wall faces the outside.
function exteriorSpan(room, wall, g0, g1, rooms) {
  for (const o of rooms) {
    if (o === room) {
      continue;
    }
    const s = touching(room, o);
    if (s && s.wallA === wall && span(g0, g1, s.lo, s.hi) > EPS) {
      return false;
    }
  }
  return true;
}

// True when another room shares this wall of room r.
function wallFacesRoom(r, wall, rooms) {
  for (const o of rooms) {
    if (o === r) {
      continue;
    }
    const s = touching(r, o);
    if (s && s.wallA === wall) {
      return true;
    }
  }
  return false;
}

// The room next to this spot on this wall. Returns { o, s } or null.
function neighbourAt(room, wall, g, rooms) {
  for (const o of rooms) {
    if (o === room) {
      continue;
    }
    const s = touching(room, o);
    if (s && s.wallA === wall && g > s.lo - EPS && g < s.hi + EPS) {
      return { o: o, s: s };
    }
  }
  return null;
}

// ============================================================================
// Joining two rooms (door or wide opening)
// ============================================================================

// Adds a wide opening to one room's wall, from floor-plan position g0 to g1.
function addOpenWall(room, R, other, wall, g0, g1) {
  const t0 = tAlong(R, wall, g0);
  const t1 = tAlong(R, wall, g1);
  room.openWalls.push({ wall: wall, t0: Math.min(t0, t1), t1: Math.max(t0, t1), to: other.name });
}

// Joins rooms a and b. kind is 'door' (a door at position g, or the middle if g
// is missing) or 'open' (the whole shared wall becomes one wide gap).
function addLink(a, b, kind, g) {
  const s = touching(a, b);
  if (!s) {
    throw new LayoutError(`The ${a.name} and ${b.name} don't share a wall`);
  }
  const len = s.hi - s.lo;
  const A = rect(a);
  const B = rect(b);

  if (kind === 'door') {
    if (len < DOOR_W + 0.2) {
      throw new LayoutError('The shared wall is too short for a door');
    }
    let wanted = g;
    if (isMissing(g)) {
      wanted = (s.lo + s.hi) / 2;
    }
    const c = clamp(wanted, s.lo + DOOR_W / 2 + 0.1, s.hi - DOOR_W / 2 - 0.1);
    a.placements.push(opening(a.dimension, DOOR, s.wallA, tAlong(A, s.wallA, c), b.name));
    b.placements.push(opening(b.dimension, DOOR, s.wallB, tAlong(B, s.wallB, c), a.name));
  } else if (kind === 'open') {
    if (len < 0.6) {
      throw new LayoutError('The shared wall is too short to open up');
    }
    const g0 = s.lo + 0.1;
    const g1 = s.hi - 0.1;
    addOpenWall(a, A, b, s.wallA, g0, g1);
    addOpenWall(b, B, a, s.wallB, g0, g1);
  }
}

// The same pair of rooms always gives the same text, whichever room is first.
function linkKey(nameA, nameB) {
  if (nameA < nameB) {
    return nameA + '|' + nameB;
  }
  return nameB + '|' + nameA;
}

// Finds a link in the list by its key. Returns its position, or -1.
function linkIndex(links, k) {
  for (let i = 0; i < links.length; i++) {
    if (links[i].key === k) {
      return i;
    }
  }
  return -1;
}

// ============================================================================
// Refitting placements after a room moves or changes size
// ============================================================================

// Finds how far an item was moved (used for things stacked on top of it).
function findShift(shifts, id) {
  for (const s of shifts) {
    if (s.id === id) {
      return s;
    }
  }
  return null;
}

// Moves the placements of oldR so they fit the changed room newR.
function refit(oldR, newR, carry) {
  const od = oldR.dimension;
  const nd = newR.dimension;
  const oo = oldR.origin;
  const no = newR.origin;
  const out = copyList(oldR.placements);
  const shifts = [];
  const margin = 0.3;

  // First the items that sit on the floor or on a wall
  for (const p of out) {
    if (p.onPlacementId) {
      continue;
    }
    let nx = 0;
    let nz = 0;
    if (p.wall >= 0) {
      const n = NORMAL[p.wall];
      const oldPoint = wallPoint(od, p.wall, p.t);
      const off = (p.x - oldPoint[0]) * n[0] + (p.z - oldPoint[1]) * n[1];
      const g = gAlong({ x: oo.x, z: oo.z, w: od.w, d: od.d }, p.wall, p.t);
      let nt = p.t;
      if (!carry) {
        nt = tAlong({ x: no.x, z: no.z, w: nd.w, d: nd.d }, p.wall, g);
      }
      nt = clamp(nt, margin, Math.max(margin, wallLen(nd, p.wall) - margin));
      const newPoint = wallPoint(nd, p.wall, nt);
      nx = newPoint[0] + n[0] * off;
      nz = newPoint[1] + n[1] * off;
      p.t = nt;
    } else {
      let lx = p.x + oo.x - no.x;
      let lz = p.z + oo.z - no.z;
      if (carry) {
        lx = p.x;
        lz = p.z;
      }
      nx = clamp(lx, margin, Math.max(margin, nd.w - margin));
      nz = clamp(lz, margin, Math.max(margin, nd.d - margin));
    }
    shifts.push({ id: String(p._id), dx: nx - p.x, dz: nz - p.z });
    p.x = nx;
    p.z = nz;
  }

  // Then the items stacked on top of other items: they follow the item below
  for (const p of out) {
    if (!p.onPlacementId) {
      continue;
    }
    let dx = 0;
    let dz = 0;
    const found = findShift(shifts, String(p.onPlacementId));
    if (found) {
      dx = found.dx;
      dz = found.dz;
    }
    let sx = oo.x - no.x;
    let sz = oo.z - no.z;
    if (carry) {
      sx = 0;
      sz = 0;
    }
    p.x = clamp(p.x + sx + dx, margin, Math.max(margin, nd.w - margin));
    p.z = clamp(p.z + sz + dz, margin, Math.max(margin, nd.d - margin));
  }
  return out;
}

// ============================================================================
// Re-joining rooms after a change
// ============================================================================

// After rooms moved, rebuild all the doors / wide openings between them, move
// windows that now face another room, and make sure every room is reachable.
function relink(rooms) {
  // 1. Remember which rooms were joined, and how
  const links = [];
  for (const a of rooms) {
    for (const p of a.placements) {
      if (!isLink(p)) {
        continue;
      }
      const b = roomNamed(rooms, p.connectsTo);
      if (!b) {
        continue;
      }
      const k = linkKey(a.name, b.name);
      if (linkIndex(links, k) === -1) {
        links.push({ key: k, a: a, b: b, kind: 'door', g: gAlong(rect(a), p.wall, p.t) });
      }
    }
    for (const o of a.openWalls) {
      const b = roomNamed(rooms, o.to);
      if (!b) {
        continue;
      }
      const k = linkKey(a.name, b.name);
      const entry = { key: k, a: a, b: b, kind: 'open', g: undefined };
      const at = linkIndex(links, k);
      if (at === -1) {
        links.push(entry);
      } else {
        links[at] = entry;
      }
    }
  }

  // 2. Take all the old links away, then add them back where the rooms still touch
  for (const r of rooms) {
    const kept = [];
    for (const p of r.placements) {
      if (!isLink(p)) {
        kept.push(p);
      }
    }
    r.placements = kept;
    r.openWalls = [];
  }
  for (const link of links) {
    try {
      addLink(link.a, link.b, link.kind, link.g);
    } catch (e) {
      if (!(e instanceof LayoutError)) {
        throw e;
      }
    }
  }

  // 3. Windows and outside doors must still face the outside
  for (const r of rooms) {
    const R = rect(r);
    const kept = [];
    for (const p of r.placements) {
      if (!isOutside(p)) {
        kept.push(p);
        continue;
      }
      if (!exteriorAt(r, p.wall, gAlong(R, p.wall, p.t), rooms)) {
        continue;
      }
      const t = clamp(p.t, 0.6, Math.max(0.6, wallLen(R, p.wall) - 0.6));
      const moved = opening(r.dimension, p.applianceTypeKey, p.wall, t, p.connectsTo);
      moved._id = p._id;
      kept.push(moved);
    }
    r.placements = kept;
  }

  // 4. A living room without a front door gets one on a free outside wall
  for (const r of rooms) {
    if (r.type !== 'living') {
      continue;
    }
    let hasFrontDoor = false;
    for (const p of r.placements) {
      if (isDoor(p) && p.connectsTo === 'outside') {
        hasFrontDoor = true;
      }
    }
    if (hasFrontDoor) {
      continue;
    }
    const R = rect(r);
    const wallsToTry = [2, 1, 3, 0];
    for (const wall of wallsToTry) {
      if (wallLen(R, wall) < 1.6 || wallFacesRoom(r, wall, rooms)) {
        continue;
      }
      r.placements.push(opening(r.dimension, DOOR, wall, wallLen(R, wall) * 0.33, 'outside'));
      break;
    }
  }

  // 5. Any other room with no way out gets a door to a sensible neighbour
  for (const r of rooms) {
    if (r.type === 'living' || r.openWalls.length) {
      continue;
    }
    let hasLink = false;
    for (const p of r.placements) {
      if (isLink(p)) {
        hasLink = true;
      }
    }
    if (hasLink) {
      continue;
    }

    let best = null;
    for (const o of rooms) {
      if (o === r) {
        continue;
      }
      const suitable = o.type === 'living' ||
        (r.type === 'bathroom' && o.type === 'bedroom') ||
        (r.type === 'bedroom' && o.type === 'bathroom');
      if (!suitable) {
        continue;
      }
      const s = touching(r, o);
      if (!s || s.hi - s.lo < DOOR_W + 0.2) {
        continue;
      }
      let score = s.hi - s.lo;
      if (o.type === 'living') {
        score = score + 100;
      }
      if (!best || score > best.score) {
        best = { o: o, score: score };
      }
    }
    if (best) {
      addLink(r, best.o, 'door');
    }
  }
}

// ============================================================================
// Whole-flat information
// ============================================================================

// The rectangle that contains every room.
function footprintOf(rooms) {
  if (!rooms.length) {
    return { x: 0, z: 0, w: 0, d: 0 };
  }
  let x0 = rooms[0].origin.x;
  let z0 = rooms[0].origin.z;
  let x1 = rooms[0].origin.x + rooms[0].dimension.w;
  let z1 = rooms[0].origin.z + rooms[0].dimension.d;
  for (const r of rooms) {
    x0 = Math.min(x0, r.origin.x);
    z0 = Math.min(z0, r.origin.z);
    x1 = Math.max(x1, r.origin.x + r.dimension.w);
    z1 = Math.max(z1, r.origin.z + r.dimension.d);
  }
  return { x: x0, z: z0, w: x1 - x0, d: z1 - z0 };
}

// A list of messages about things that look wrong (rooms with no door, no front door).
function warnings(rooms) {
  const out = [];
  for (const r of rooms) {
    let hasLink = false;
    let hasFrontDoor = false;
    for (const p of r.placements) {
      if (isLink(p)) {
        hasLink = true;
      }
      if (isDoor(p) && p.connectsTo === 'outside') {
        hasFrontDoor = true;
      }
    }
    const openCount = (r.openWalls || []).length;

    if (rooms.length > 1 && !hasLink && !openCount) {
      out.push(`The ${r.name} has no door or opening to another room`);
    }
    if (r.type === 'living' && !hasFrontDoor) {
      out.push(`The ${r.name} has no front door (it needs a free outside wall)`);
    }
  }
  return out;
}

// ============================================================================
// Moving and resizing rooms
// ============================================================================

// Throws a LayoutError if the box (x, z, w, d) is not allowed for a room of this
// type: too small, too big, outside the build area, or overlapping another room.
function checkRect(rooms, box, type, exceptId) {
  const min = MIN[type];
  if (box.w < min - EPS || box.d < min - EPS) {
    throw new LayoutError(`A ${type} can't be smaller than ${min} m`);
  }
  if (box.w > MAX || box.d > MAX) {
    throw new LayoutError(`Rooms can be at most ${MAX} m across`);
  }
  if (box.x < BUILD_LIMIT.min || box.z < BUILD_LIMIT.min ||
      box.x + box.w > BUILD_LIMIT.max || box.z + box.d > BUILD_LIMIT.max) {
    throw new LayoutError('That is outside the build area');
  }
  for (const o of rooms) {
    if (roomKey(o) === String(exceptId)) {
      continue;
    }
    const overlapX = span(box.x, box.x + box.w, o.origin.x, o.origin.x + o.dimension.w);
    const overlapZ = span(box.z, box.z + box.d, o.origin.z, o.origin.z + o.dimension.d);
    if (overlapX > EPS && overlapZ > EPS) {
      throw new LayoutError(`That would overlap the ${o.name}`);
    }
  }
}

// Rounds a box to 10 cm.
function snapRect(r) {
  return { x: snap(r.x), z: snap(r.z), w: snap(r.w), d: snap(r.d) };
}

// Moves/resizes one room. Returns the new list of rooms.
function setRoomRect(rooms, id, box) {
  const work = rooms.map(cloneRoom);
  const R = roomById(work, id);
  if (!R) {
    throw new LayoutError('Room not found');
  }
  const next = snapRect(box);
  checkRect(work, next, R.type, id);

  const old = cloneRoom(R);
  const resized = !near(next.w, R.dimension.w) || !near(next.d, R.dimension.d);
  R.origin = { x: next.x, z: next.z };
  R.dimension.w = next.w;
  R.dimension.d = next.d;
  R.placements = refit(old, R, !resized);
  relink(work);
  return work;
}

// ============================================================================
// Doors and windows
// ============================================================================

// True when a door/window of this width fits at t on this wall without hitting
// another door/window or a wide opening. ignoreId is the one being moved.
function slotIsFree(room, wall, t, width, ignoreId) {
  const gap = 0.1;
  let hitsOpening = false;
  for (const p of room.placements) {
    if (isOpeningPlacement(p) && String(p._id) !== String(ignoreId) && p.wall === wall &&
        Math.abs(p.t - t) < (widthOfPlacement(p) + width) / 2 + gap) {
      hitsOpening = true;
    }
  }
  let hitsOpenWall = false;
  for (const o of room.openWalls) {
    if (o.wall === wall && o.t0 < t + width / 2 + gap && o.t1 > t - width / 2 - gap) {
      hitsOpenWall = true;
    }
  }
  return !hitsOpening && !hitsOpenWall;
}

// Puts a door/window p of the room at a new wall and t (keeps its id).
function repositionOpening(room, p, wall, t) {
  const moved = opening(room.dimension, p.applianceTypeKey, wall, t, p.connectsTo);
  moved._id = p._id;
  const list = [];
  for (const q of room.placements) {
    if (q === p) {
      list.push(moved);
    } else {
      list.push(q);
    }
  }
  room.placements = list;
}

// A door dragged onto a wall shared with room o turns into a door between them.
function joinRooms(room, p, o, g) {
  const width = widthOfPlacement(p);
  room.placements = listWithout(room.placements, p);
  addLink(room, o, 'door', g);
  const mine = room.placements[room.placements.length - 1];
  const theirs = o.placements[o.placements.length - 1];
  mine._id = p._id;
  if (!slotIsFree(withoutPlacement(room, mine), mine.wall, mine.t, width, mine._id)) {
    throw new LayoutError('There is already a door or window there');
  }
  if (!slotIsFree(withoutPlacement(o, theirs), theirs.wall, theirs.t, width, theirs._id)) {
    throw new LayoutError('Something on the other side is in the way');
  }
}

// Moves a door or window to another wall / position. Returns the new rooms.
function moveOpening(rooms, roomId, placementId, wall, t) {
  if (![0, 1, 2, 3].includes(wall)) {
    throw new LayoutError('wall must be 0-3');
  }
  if (!Number.isFinite(t)) {
    throw new LayoutError('Say where along the wall it should go');
  }

  const work = rooms.map(cloneRoom);
  const room = roomById(work, roomId);
  let p = null;
  if (room) {
    p = placementById(room, placementId);
  }
  if (!p || !isOpeningPlacement(p)) {
    throw new LayoutError('Only doors and windows can be moved this way');
  }

  const R = rect(room);
  const width = widthOfPlacement(p);
  const half = width / 2;
  const margin = Math.max(0.6, half + 0.15);

  // A door between two rooms can slide along the shared wall (both sides move together)
  if (isLink(p)) {
    const neighbour = roomNamed(work, p.connectsTo);
    let shared = null;
    if (neighbour) {
      shared = touching(room, neighbour);
    }
    if (!shared) {
      throw new LayoutError('That door no longer joins two rooms');
    }
    let partner = null;
    for (const q of neighbour.placements) {
      if (isLink(q) && q.connectsTo === room.name && q.wall === shared.wallB) {
        partner = q;
        break;
      }
    }

    if (wall === shared.wallA) {
      const lo = shared.lo + half + 0.1;
      const hi = shared.hi - half - 0.1;
      if (lo > hi) {
        throw new LayoutError('The shared wall is too short to move this door');
      }
      const g = clamp(gAlong(R, shared.wallA, t), lo, hi); // position on the whole floor plan
      const tHere = snap(tAlong(R, shared.wallA, g));
      const tThere = snap(tAlong(rect(neighbour), shared.wallB, gAlong(R, shared.wallA, tHere)));

      if (!slotIsFree(room, shared.wallA, tHere, width, p._id)) {
        throw new LayoutError('There is already a door or window there');
      }
      if (partner && !slotIsFree(neighbour, shared.wallB, tThere, width, partner._id)) {
        throw new LayoutError('Something on the other side is in the way');
      }

      repositionOpening(room, p, shared.wallA, tHere);
      if (partner) {
        repositionOpening(neighbour, partner, shared.wallB, tThere);
      }
      return work;
    }

    // Dragged to a different wall: it stops being a door between the two rooms
    if (partner) {
      neighbour.placements = listWithout(neighbour.placements, partner);
    }
    p.connectsTo = null;
  }

  const len = wallLen(R, wall);
  if (len < 2 * margin) {
    throw new LayoutError('That wall is too short');
  }
  const tc = snap(clamp(t, margin, len - margin));
  const ga = gAlong(R, wall, tc - half);
  const gb = gAlong(R, wall, tc + half);

  if (!exteriorSpan(room, wall, Math.min(ga, gb), Math.max(ga, gb), work)) {
    // The spot faces another room. A door can still join the two rooms.
    let next = null;
    if (isDoor(p)) {
      next = neighbourAt(room, wall, gAlong(R, wall, tc), work);
    }
    if (!next) {
      if (isDoor(p)) {
        throw new LayoutError('That part of the wall faces another room, but the wall they share is too short for a door');
      }
      throw new LayoutError(outsideOnlyMessage(p));
    }
    joinRooms(room, p, next.o, gAlong(R, wall, tc));
    return work;
  }
  if (!slotIsFree(room, wall, tc, width, p._id)) {
    throw new LayoutError('There is already a door or window there');
  }

  if (isDoor(p) && p.connectsTo !== 'outside') {
    p.connectsTo = 'outside';
  }
  repositionOpening(room, p, wall, tc);
  return work;
}

// Reads one suggested spot [wall, t] from the client. Bad values become NaN.
function readSpot(c) {
  let first = undefined;
  let second = undefined;
  if (!isMissing(c)) {
    first = c[0];
    second = c[1];
  }
  return [Math.trunc(Number(first)), Number(second)];
}

// Adds a new door or window to a room. If wall and t are given (or the client
// sends a list of candidate spots) those are tried; otherwise we search along
// the walls from the middle outwards. Returns the new rooms.
function addOpening(rooms, roomId, applianceTypeKey, wall, t, candidates) {
  if (wall === undefined) {
    wall = null;
  }
  if (t === undefined) {
    t = null;
  }
  if (candidates === undefined) {
    candidates = null;
  }

  if (!isOpeningKey(applianceTypeKey)) {
    throw new LayoutError('Only doors and windows can be added this way');
  }
  const room = roomById(rooms, roomId);
  if (!room) {
    throw new LayoutError('Room not found');
  }
  const R = rect(room);

  // The client's own suggestions (at most 300), keeping only sensible ones
  const given = [];
  if (Array.isArray(candidates)) {
    const firstOnes = candidates.slice(0, 300);
    for (const c of firstOnes) {
      const spot = readSpot(c);
      if ([0, 1, 2, 3].includes(spot[0]) && Number.isFinite(spot[1])) {
        given.push(spot);
      }
    }
  }

  const spots = [];
  if (given.length) {
    for (const spot of given) {
      spots.push(spot);
    }
  } else {
    if ([0, 1, 2, 3].includes(wall) && Number.isFinite(t)) {
      spots.push([wall, t]);
    }
    // Longest walls first, each searched from its middle outwards
    const walls = [0, 1, 2, 3];
    walls.sort(function (a, b) {
      return wallLen(R, b) - wallLen(R, a);
    });
    for (const w of walls) {
      for (let i = 0; i <= wallLen(R, w) / 0.3; i++) {
        let direction = 1;
        if (i % 2) {
          direction = -1;
        }
        const pos = wallLen(R, w) / 2 + Math.ceil(i / 2) * 0.3 * direction;
        if (pos > 0 && pos < wallLen(R, w)) {
          spots.push([w, pos]);
        }
      }
    }
  }

  // Try each spot until one is accepted
  let lastError = null;
  for (const spot of spots) {
    const w = spot[0];
    const at = spot[1];
    const work = rooms.map(cloneRoom);
    const target = roomById(work, roomId);
    const made = opening(target.dimension, applianceTypeKey, w, at, null);
    target.placements.push(made);
    try {
      return moveOpening(work, roomId, made._id, w, at);
    } catch (e) {
      if (!(e instanceof LayoutError)) {
        throw e;
      }
      if (!lastError) {
        lastError = e;
      }
    }
  }
  if (given.length) {
    throw new LayoutError(`There is no clear spot for that on the ${room.name} walls. Move an appliance away from the wall or make the room bigger.`);
  }
  if (lastError) {
    throw lastError;
  }
  throw new LayoutError(`There is no room on the ${room.name} walls for that`);
}

// Removes a door or window (and the matching door on the other side).
function removeOpening(rooms, roomId, placementId) {
  const work = rooms.map(cloneRoom);
  const room = roomById(work, roomId);
  let p = null;
  if (room) {
    p = placementById(room, placementId);
  }
  if (!p || !isOpeningPlacement(p)) {
    throw new LayoutError('Only doors and windows can be removed this way');
  }

  room.placements = listWithout(room.placements, p);
  if (isLink(p)) {
    const neighbour = roomNamed(work, p.connectsTo);
    if (neighbour) {
      const kept = [];
      for (const q of neighbour.placements) {
        if (!(isLink(q) && q.connectsTo === room.name)) {
          kept.push(q);
        }
      }
      neighbour.placements = kept;
    }
  }
  return work;
}

// ============================================================================
// Opening up the wall between two rooms
// ============================================================================

// True when room has a wide opening into the room called name.
function hasOpenWallTo(room, name) {
  for (const o of room.openWalls) {
    if (o.to === name) {
      return true;
    }
  }
  return false;
}

// Takes away the doors that join room x to the room called name.
function removeDoorsTo(x, name) {
  const kept = [];
  for (const p of x.placements) {
    if (!(isLink(p) && p.connectsTo === name)) {
      kept.push(p);
    }
  }
  x.placements = kept;
}

// Takes away the wide openings from room x into the room called name.
function removeOpenWallsTo(x, name) {
  const kept = [];
  for (const o of x.openWalls) {
    if (o.to !== name) {
      kept.push(o);
    }
  }
  x.openWalls = kept;
}

// Open or close the wall between two rooms that share one (open-plan kitchen and living room, say).
// Opening replaces any door between them with one wide gap. Closing puts a door back so the rooms stay joined;
// the door can then be removed with its own button if a fully closed wall is wanted.
function setWallOpen(rooms, idA, idB, open) {
  const work = rooms.map(cloneRoom);
  const a = roomById(work, idA);
  const b = roomById(work, idB);
  if (!a || !b || a === b) {
    throw new LayoutError('Room not found');
  }
  if (!touching(a, b)) {
    throw new LayoutError(`The ${a.name} and ${b.name} don't share a wall`);
  }
  const isOpen = hasOpenWallTo(a, b.name) && hasOpenWallTo(b, a.name);

  if (open) {
    if (isOpen) {
      return work;
    }
    removeDoorsTo(a, b.name);
    removeDoorsTo(b, a.name);
    addLink(a, b, 'open');
  } else {
    if (!isOpen && !hasOpenWallTo(a, b.name) && !hasOpenWallTo(b, a.name)) {
      return work;
    }
    removeOpenWallsTo(a, b.name);
    removeOpenWallsTo(b, a.name);
    try {
      addLink(a, b, 'door');
    } catch (e) {
      if (!(e instanceof LayoutError)) {
        throw e;
      }
    }
  }
  return work;
}

// ============================================================================
// Checking a whole layout before it is saved
// ============================================================================

// Throws a LayoutError if the list of rooms is not a valid flat. Returns the rooms.
function validateLayout(rooms) {
  if (!Array.isArray(rooms) || !rooms.length) {
    throw new LayoutError('A flat needs at least one room');
  }
  if (rooms.length > 40) {
    throw new LayoutError('Too many rooms');
  }

  const names = [];
  const ids = [];
  const accepted = [];
  for (const r of rooms) {
    if (!MIN[r.type]) {
      throw new LayoutError(`Unknown room type ${r.type}`);
    }
    if (!r.name || r.name.length > 40) {
      throw new LayoutError('Every room needs a name of 1-40 characters');
    }
    if (names.includes(r.name)) {
      throw new LayoutError(`There is already a room called ${r.name}`);
    }
    if (ids.includes(roomKey(r))) {
      throw new LayoutError('Duplicate room id');
    }
    names.push(r.name);
    ids.push(roomKey(r));

    if (!(r.dimension.h >= 2.2 && r.dimension.h <= 4)) {
      throw new LayoutError('Ceiling height must be between 2.2 and 4 m');
    }
    checkRect(accepted, { x: r.origin.x, z: r.origin.z, w: r.dimension.w, d: r.dimension.d }, r.type, null);
    accepted.push(r);

    for (const o of r.openWalls || []) {
      if (![0, 1, 2, 3].includes(o.wall) || !(o.t1 > o.t0)) {
        throw new LayoutError('Bad opening in a wall');
      }
    }
  }

  let hasLiving = false;
  for (const r of rooms) {
    if (r.type === 'living') {
      hasLiving = true;
    }
  }
  if (!hasLiving) {
    throw new LayoutError('A flat needs a living room');
  }
  return rooms;
}

// ============================================================================
// Checking where appliances are placed in one room
// ============================================================================

const TOL = 0.1;
const SAME_SPOT = 0.1;
const POSE_EPS = 1e-6;

function sameId(a, b) {
  return String(a) === String(b);
}

// A number, or 0 when the value is not a real number.
function num(v) {
  if (Number.isFinite(v)) {
    return v;
  }
  return 0;
}

// The id, or an empty text when there is none.
function idOrBlank(v) {
  if (isMissing(v)) {
    return '';
  }
  return v;
}

// True when two placements are in the same spot (same pose) and are the same item.
function samePose(a, b) {
  const fields = ['x', 'z', 'rotY', 't', 'cu', 'wall'];
  for (const name of fields) {
    if (!(Math.abs(num(a[name]) - num(b[name])) < POSE_EPS)) {
      return false;
    }
  }
  if (!sameId(idOrBlank(a.onPlacementId), idOrBlank(b.onPlacementId))) {
    return false;
  }
  return a.applianceTypeKey === b.applianceTypeKey;
}

// Throws a PlacementError when something in the room's placements is not allowed.
function checkRoomPlacements(room, options) {
  let previous = null;
  let openings = 'keep';
  if (options) {
    if (options.previous !== undefined) {
      previous = options.previous;
    }
    if (options.openings !== undefined) {
      openings = options.openings;
    }
  }

  const dim = room.dimension;
  const list = room.placements || [];
  let before = [];
  if (previous && previous.placements) {
    before = previous.placements;
  }
  const ids = [];
  for (const p of list) {
    ids.push(String(p._id));
  }

  // The placement as it was before, or null if it is new
  function oldVersionOf(p) {
    return placementById({ placements: before }, p._id);
  }

  // True when the placement is new or has been moved
  function changed(p) {
    const old = oldVersionOf(p);
    return !old || !samePose(old, p);
  }

  function fail(message) {
    throw new PlacementError(message);
  }

  if (openings === 'keep') {
    for (const old of before) {
      if (isOpening(old) && !ids.includes(String(old._id))) {
        fail('Doors and windows are removed with their own button, so the rooms they join stay consistent.');
      }
    }
  }

  for (const p of list) {
    if (!isMissing(p.onPlacementId) && (sameId(p.onPlacementId, p._id) || !ids.includes(String(p.onPlacementId)))) {
      fail(`That ${p.applianceTypeKey} is meant to sit on an item that is not in the ${room.name}`);
    }

    if (isOpening(p)) {
      const old = oldVersionOf(p);
      if (openings === 'keep' &&
          !(old && isOpening(old) && old.wall === p.wall && Math.abs(num(old.t) - num(p.t)) < POSE_EPS)) {
        fail('Doors and windows are added and moved with their own tools so the rooms stay joined.');
      }
      if (changed(p) && (![0, 1, 2, 3].includes(p.wall) || p.t < 0 || p.t > wallLen(dim, p.wall) + TOL)) {
        fail(`That ${p.applianceTypeKey} would be off the wall of the ${room.name}`);
      }
      continue;
    }

    if (!changed(p)) {
      continue;
    }
    if (!(p.x >= -TOL && p.x <= dim.w + TOL && p.z >= -TOL && p.z <= dim.d + TOL)) {
      fail(`That would put the ${p.applianceTypeKey} outside the ${room.name}`);
    }
    if (p.wall >= 0 && !(p.t >= 0 && p.t <= wallLen(dim, p.wall))) {
      fail(`That would put the ${p.applianceTypeKey} past the end of its wall`);
    }
  }

  // Two things on the floor must not be on the very same spot
  const floor = [];
  for (const p of list) {
    if (!isOpening(p) && p.wall < 0 && isMissing(p.onPlacementId)) {
      floor.push(p);
    }
  }
  for (let i = 0; i < floor.length; i++) {
    for (let j = i + 1; j < floor.length; j++) {
      const a = floor[i];
      const b = floor[j];
      if (!changed(a) && !changed(b)) {
        continue;
      }
      if (Math.hypot(a.x - b.x, a.z - b.z) < SAME_SPOT) {
        fail(`The ${a.applianceTypeKey} and the ${b.applianceTypeKey} would be on the same spot`);
      }
    }
  }
}

// ============================================================================
// Changing the flat type: carry the old appliances over to the new rooms
// ============================================================================

const FLOOR_MARGIN = 0.3;

// Half the width an item needs next to a wall.
function halfWidth(p) {
  if (p.category === 'build') {
    return 0.95;
  }
  return 0.5;
}

// Puts a copy of p at x, z in the result. Remembers how far it moved so that
// items stacked on it can follow.
function placeItem(state, p, x, z) {
  const dx = x - p.x;
  const dz = z - p.z;
  if (Math.abs(dx) > 1e-6 || Math.abs(dz) > 1e-6) {
    state.adjusted = state.adjusted + 1;
  }
  state.shifts.push({ id: String(p._id), dx: dx, dz: dz });
  const copy = copyObject(p);
  copy.x = x;
  copy.z = z;
  state.out.push(copy);
  return copy;
}

// Moves the appliances (not doors/windows) of oldRoom into the new room newRoom.
function carryOver(oldRoom, newRoom) {
  const W = newRoom.dimension.w;
  const D = newRoom.dimension.d;

  const items = [];
  for (const p of oldRoom.placements || []) {
    if (!isOpening(p)) {
      items.push(p);
    }
  }
  const state = { shifts: [], out: [], adjusted: 0 };

  // First the items on the floor or on a wall
  for (const p of items) {
    if (p.onPlacementId) {
      continue;
    }
    if (p.wall >= 0) {
      let length = W;
      if (p.wall % 2) {
        length = D;
      }
      const margin = halfWidth(p);
      if (length < margin * 2 + 0.1) {
        continue; // the wall is too short for it: drop it
      }
      const oldPoint = wallPoint(oldRoom.dimension, p.wall, p.t);
      const n = NORMAL[p.wall];
      const offset = (p.x - oldPoint[0]) * n[0] + (p.z - oldPoint[1]) * n[1];
      const t = clamp(p.t, margin, length - margin);
      const newPoint = wallPoint(newRoom.dimension, p.wall, t);
      const copy = placeItem(state, p, newPoint[0] + n[0] * offset, newPoint[1] + n[1] * offset);
      copy.t = t;
    } else {
      placeItem(state, p, clamp(p.x, FLOOR_MARGIN, W - FLOOR_MARGIN), clamp(p.z, FLOOR_MARGIN, D - FLOOR_MARGIN));
    }
  }

  // Then items stacked on other items: they follow the item below (dropped if it was dropped)
  for (const p of items) {
    if (!p.onPlacementId) {
      continue;
    }
    const moved = findShift(state.shifts, String(p.onPlacementId));
    if (!moved) {
      continue;
    }
    placeItem(state, p, p.x + moved.dx, p.z + moved.dz);
  }

  return { placements: state.out, adjusted: state.adjusted, dropped: items.length - state.out.length };
}

// Builds the rooms of a new flat type. Rooms with the same name keep their id and
// their appliances; new rooms are added; old rooms that are not in the new flat
// are removed.
function reconcileRooms(oldRooms, flatTypeId, householdId) {
  const fresh = generateRooms(flatTypeId).rooms;
  const unmatched = [];
  for (const r of oldRooms) {
    unmatched.push(r);
  }
  const keep = [];
  const add = [];
  let adjusted = 0;
  let dropped = 0;

  for (const room of fresh) {
    // Find (and take out) the old room with the same name
    let old = null;
    for (let i = 0; i < unmatched.length; i++) {
      if (unmatched[i].name === room.name) {
        old = unmatched[i];
        unmatched.splice(i, 1);
        break;
      }
    }

    if (!old) {
      const newRoom = copyObject(room);
      newRoom._id = new ObjectId();
      newRoom.householdId = householdId;
      add.push(newRoom);
      continue;
    }

    const carried = carryOver(old, room);
    adjusted = adjusted + carried.adjusted;
    dropped = dropped + carried.dropped;

    const kept = copyObject(room);
    kept._id = old._id;
    kept.householdId = householdId;
    const placements = [];
    for (const p of room.placements) {
      placements.push(p);
    }
    for (const p of carried.placements) {
      placements.push(p);
    }
    kept.placements = placements;
    keep.push(kept);
  }

  // Old rooms that no longer exist: their appliances are lost
  const remove = unmatched;
  for (const r of remove) {
    for (const p of r.placements || []) {
      if (!isOpening(p)) {
        dropped = dropped + 1;
      }
    }
  }

  return { keep: keep, add: add, remove: remove, adjusted: adjusted, dropped: dropped };
}

module.exports = { LayoutError, footprintOf, warnings, setRoomRect, moveOpening, addOpening, removeOpening, setWallOpen, validateLayout, touching, refit, checkRoomPlacements, PlacementError, isOpening, reconcileRooms };
