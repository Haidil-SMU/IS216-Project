const { ObjectId } = require('mongodb');

const CEILING_H = 2.6;

const LAYOUTS = {
  '2-room': {
    width: 7.8, depth: 6.0,
    rooms: [
      { name: 'Bedroom 1', type: 'bedroom',  x: 0.0, z: 0.0, w: 3.0, d: 3.0 },
      { name: 'Bathroom',  type: 'bathroom', x: 3.0, z: 0.0, w: 1.6, d: 3.0 },
      { name: 'Kitchen',   type: 'kitchen',  x: 4.6, z: 0.0, w: 3.2, d: 3.0 },
      { name: 'Living Room', type: 'living', x: 0.0, z: 3.0, w: 7.8, d: 3.0 },
    ],
  },
  '3-room': {
    width: 9.6, depth: 6.8,
    rooms: [
      { name: 'Bedroom 2', type: 'bedroom',  x: 0.0, z: 0.0, w: 3.6, d: 3.4 },
      { name: 'Bathroom',  type: 'bathroom', x: 3.6, z: 0.0, w: 1.8, d: 3.4 },
      { name: 'Bedroom 1', type: 'bedroom',  x: 5.4, z: 0.0, w: 4.2, d: 3.4 },
      { name: 'Kitchen',   type: 'kitchen',  x: 0.0, z: 3.4, w: 2.4, d: 3.4 },
      { name: 'Living Room', type: 'living', x: 2.4, z: 3.4, w: 7.2, d: 3.4 },
    ],
  },
  '4-room': {
    width: 11.0, depth: 8.0,
    rooms: [
      { name: 'Bedroom 2', type: 'bedroom',  x: 0.0, z: 0.0, w: 3.7, d: 3.8 },
      { name: 'Bedroom 3', type: 'bedroom',  x: 3.7, z: 0.0, w: 3.5, d: 3.8 },
      { name: 'Bedroom 1', type: 'bedroom',  x: 7.2, z: 0.0, w: 3.8, d: 3.8 },
      { name: 'Kitchen',   type: 'kitchen',  x: 0.0, z: 3.8, w: 2.4, d: 2.6 },
      { name: 'Bathroom',  type: 'bathroom', x: 0.0, z: 6.4, w: 2.4, d: 1.6 },
      { name: 'Living Room', type: 'living', x: 2.4, z: 3.8, w: 8.6, d: 4.2 },
    ],
  },
  '5-room': {
    width: 12.0, depth: 9.0,
    rooms: [
      { name: 'Bedroom 2', type: 'bedroom',  x: 0.0, z: 0.0, w: 4.2, d: 4.0 },
      { name: 'Bedroom 3', type: 'bedroom',  x: 4.2, z: 0.0, w: 3.8, d: 4.0 },
      { name: 'Bedroom 1', type: 'bedroom',  x: 8.0, z: 0.0, w: 4.0, d: 4.0 },
      { name: 'Kitchen',   type: 'kitchen',  x: 0.0, z: 4.0, w: 2.8, d: 3.0 },
      { name: 'Bathroom',  type: 'bathroom', x: 0.0, z: 7.0, w: 2.8, d: 2.0 },
      { name: 'Living Room', type: 'living', x: 2.8, z: 4.0, w: 9.2, d: 5.0 },
    ],
  },
};

const DOOR_W = 0.9;
const MIN_SHARED = DOOR_W + 0.2;

function tFor(r, i, gx, gz) {
  return [gx - r.x, gz - r.z, r.x + r.w - gx, r.z + r.d - gz][i];
}

function sharedSegments(r, i, others) {
  const found = [];
  for (const o of others) {
    if (o === r) continue;
    let lo, hi, touches;
    if (i === 0) { touches = o.z + o.d === r.z; lo = Math.max(r.x, o.x); hi = Math.min(r.x + r.w, o.x + o.w); }
    if (i === 2) { touches = o.z === r.z + r.d; lo = Math.max(r.x, o.x); hi = Math.min(r.x + r.w, o.x + o.w); }
    if (i === 1) { touches = o.x === r.x + r.w; lo = Math.max(r.z, o.z); hi = Math.min(r.z + r.d, o.z + o.d); }
    if (i === 3) { touches = o.x + o.w === r.x;  lo = Math.max(r.z, o.z); hi = Math.min(r.z + r.d, o.z + o.d); }
    if (touches && hi - lo >= MIN_SHARED) found.push({ room: o, lo, hi });
  }
  return found;
}

function isExterior(r, i, W, D) {
  return [r.z === 0, r.x + r.w === W, r.z + r.d === D, r.x === 0][i];
}

const NORMAL  = [[0, 1], [-1, 0], [0, -1], [1, 0]];
const TANGENT = [[1, 0], [0, 1], [-1, 0], [0, -1]];
const WALL_THICKNESS = 0.1;

function wallPoint(r, i, t) {
  const start = [[0, 0], [r.w, 0], [r.w, r.d], [0, r.d]][i];
  return [start[0] + TANGENT[i][0] * t, start[1] + TANGENT[i][1] * t];
}

function opening(room, applianceTypeKey, tick, wall, t, connectsTo = null) {
  const n = NORMAL[wall];
  const [px, pz] = wallPoint(room, wall, t);
  const off = -WALL_THICKNESS / 2;
  return {
    _id: new ObjectId(),
    applianceTypeKey, category: 'build', tick,
    x: px + n[0] * off, z: pz + n[1] * off, rotY: Math.atan2(n[0], n[1]),
    wall, t, onPlacementId: null, cu: 0,
    connectsTo,
  };
}


function generateRooms(flatTypeId) {
  const layout = LAYOUTS[flatTypeId];
  if (!layout) throw new Error(`Unknown flat type: ${flatTypeId}`);
  const { width: W, depth: D } = layout;

  const rooms = layout.rooms.map((r, order) => ({
    name: r.name,
    type: r.type,
    order,
    dimension: { w: r.w, d: r.d, h: CEILING_H },
    origin: { x: r.x, z: r.z },
    placements: [],
    _rect: r,
  }));
  const rects = rooms.map((x) => x._rect);
  const byRect = new Map(rooms.map((x) => [x._rect, x]));

  for (const room of rooms) {
    const r = room._rect;
    let doorWall = -1;

    if (r.type === 'living') {
      doorWall = 2;
      room.placements.push(opening({ w: r.w, d: r.d }, 'timber_flush_door', '3_tick', 2, r.w * 0.33, 'outside'));
    } else {
      let pick = null;
      for (let i = 0; i < 4; i++) {
        for (const seg of sharedSegments(r, i, rects)) {
          const score = (seg.room.type === 'living' ? 100 : 0) + (seg.hi - seg.lo);
          if (!pick || score > pick.score) pick = { i, seg, score };
        }
      }
      if (pick) {
        const { i, seg } = pick, mid = (seg.lo + seg.hi) / 2, o = seg.room;
        doorWall = i;
        const gx = i % 2 ? (i === 1 ? r.x + r.w : r.x) : mid;
        const gz = i % 2 ? mid : (i === 0 ? r.z : r.z + r.d);
        room.placements.push(opening({ w: r.w, d: r.d }, 'timber_flush_door', '3_tick', i, tFor(r, i, gx, gz), o.name));
        const j = (i + 2) % 4;
        byRect.get(o).placements.push(opening({ w: o.w, d: o.d }, 'timber_flush_door', '3_tick', j, tFor(o, j, gx, gz), r.name));
      }
    }

    if (r.type !== 'bathroom') {
      const free = [0, 1, 2, 3].filter((i) => isExterior(r, i, W, D) && i !== doorWall);
      if (free.length) {
        const len = (i) => (i % 2 ? r.d : r.w);
        const i = free.sort((a, b) => len(b) - len(a))[0];
        room.placements.push(opening({ w: r.w, d: r.d }, 'single_glazed_window', '1_tick', i, len(i) / 2));
      }
    }
  }

  for (const room of rooms) delete room._rect;
  return { footprint: { w: W, d: D }, rooms };
}

module.exports = { generateRooms, LAYOUTS, CEILING_H };
