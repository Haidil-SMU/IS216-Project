const { ObjectId } = require('mongodb');

// ============================================================================
// Constants and the flat blueprints
// ============================================================================

const CEILING_H = 2.6;
const DOOR_W = 0.9;
const MIN_SHARED = DOOR_W + 0.2;
const WALL_THICKNESS = 0.1;

// Every room is a rectangle: x, z is its top-left corner, w is width, d is depth.
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
      { name: 'Bedroom 2', type: 'bedroom',  x: 0.0, z: 0.0, w: 3.4, d: 3.8 },
      { name: 'Bedroom 3', type: 'bedroom',  x: 3.4, z: 0.0, w: 3.2, d: 3.8 },
      { name: 'Bedroom 1', type: 'bedroom',  x: 6.6, z: 0.0, w: 2.8, d: 3.8 },
      { name: 'Master Bathroom', type: 'bathroom', x: 9.4, z: 0.0, w: 1.6, d: 3.8, ensuite: 'Bedroom 1' },
      { name: 'Kitchen',   type: 'kitchen',  x: 0.0, z: 3.8, w: 2.4, d: 2.6 },
      { name: 'Bathroom',  type: 'bathroom', x: 0.0, z: 6.4, w: 2.4, d: 1.6 },
      { name: 'Living Room', type: 'living', x: 2.4, z: 3.8, w: 8.6, d: 4.2 },
    ],
  },
  '5-room': {
    width: 12.0, depth: 9.0,
    rooms: [
      { name: 'Bedroom 2', type: 'bedroom',  x: 0.0, z: 0.0, w: 3.8, d: 4.0 },
      { name: 'Bedroom 3', type: 'bedroom',  x: 3.8, z: 0.0, w: 3.6, d: 4.0 },
      { name: 'Bedroom 1', type: 'bedroom',  x: 7.4, z: 0.0, w: 3.0, d: 4.0 },
      { name: 'Master Bathroom', type: 'bathroom', x: 10.4, z: 0.0, w: 1.6, d: 4.0, ensuite: 'Bedroom 1' },
      { name: 'Kitchen',   type: 'kitchen',  x: 0.0, z: 4.0, w: 2.8, d: 3.0 },
      { name: 'Bathroom',  type: 'bathroom', x: 0.0, z: 7.0, w: 2.8, d: 2.0 },
      { name: 'Living Room', type: 'living', x: 2.8, z: 4.0, w: 9.2, d: 5.0 },
    ],
  },
};

// The four walls of a room are numbered 0, 1, 2, 3:
// NORMAL[wall]  is the direction pointing INTO the room from that wall.
// TANGENT[wall] is the direction you walk along that wall (t grows this way).
const NORMAL  = [[0, 1], [-1, 0], [0, -1], [1, 0]];
const TANGENT = [[1, 0], [0, 1], [-1, 0], [0, -1]];

// The only things that can be cut into a wall.
const OPENING_KEYS = ['single_glazed_window', 'double_glazed_window', 'timber_flush_door', 'glass_sliding_door'];

// ============================================================================
// Small helpers
// ============================================================================

// True when two numbers are (almost) the same. Needed because of decimals.
function same(a, b) {
  return Math.abs(a - b) < 1e-6;
}

// True when the key is a door or window.
function isOpeningKey(applianceTypeKey) {
  return OPENING_KEYS.includes(applianceTypeKey);
}

// Distance along wall number i of room r, from the wall's start,
// to the point (gx, gz) on the floor plan.
function tFor(r, i, gx, gz) {
  if (i === 0) {
    return gx - r.x;
  }
  if (i === 1) {
    return gz - r.z;
  }
  if (i === 2) {
    return r.x + r.w - gx;
  }
  return r.z + r.d - gz;
}

// The point on a wall, measured from the room's own top-left corner.
// t is the distance along the wall. Returns [x, z].
function wallPoint(r, i, t) {
  let start = [0, r.d];
  if (i === 0) {
    start = [0, 0];
  } else if (i === 1) {
    start = [r.w, 0];
  } else if (i === 2) {
    start = [r.w, r.d];
  }
  return [start[0] + TANGENT[i][0] * t, start[1] + TANGENT[i][1] * t];
}

// True when wall i of room r is on the outside edge of the whole flat.
function isExterior(r, i, W, D) {
  if (i === 0) {
    return same(r.z, 0);
  }
  if (i === 1) {
    return same(r.x + r.w, W);
  }
  if (i === 2) {
    return same(r.z + r.d, D);
  }
  return same(r.x, 0);
}

// ============================================================================
// Finding where a door can go
// ============================================================================

// Looks at wall i of room rects[roomIndex] and finds every neighbouring room
// that shares a stretch of that wall long enough to fit a door.
function sharedSegments(rects, roomIndex, i) {
  const r = rects[roomIndex];
  const found = [];

  for (let n = 0; n < rects.length; n++) {
    if (n === roomIndex) {
      continue;
    }
    const o = rects[n];
    let lo = 0;
    let hi = 0;
    let touches = false;

    if (i === 0) {
      touches = same(o.z + o.d, r.z);
      lo = Math.max(r.x, o.x);
      hi = Math.min(r.x + r.w, o.x + o.w);
    }
    if (i === 2) {
      touches = same(o.z, r.z + r.d);
      lo = Math.max(r.x, o.x);
      hi = Math.min(r.x + r.w, o.x + o.w);
    }
    if (i === 1) {
      touches = same(o.x, r.x + r.w);
      lo = Math.max(r.z, o.z);
      hi = Math.min(r.z + r.d, o.z + o.d);
    }
    if (i === 3) {
      touches = same(o.x + o.w, r.x);
      lo = Math.max(r.z, o.z);
      hi = Math.min(r.z + r.d, o.z + o.d);
    }

    if (touches && hi - lo >= MIN_SHARED) {
      found.push({ roomIndex: n, lo: lo, hi: hi });
    }
  }
  return found;
}

// ============================================================================
// Making a door or window
// ============================================================================

// Builds one door/window placement on a wall of a room.
//   room            : { w, d } size of the room
//   applianceTypeKey: which door/window it is
//   wall            : wall number 0-3
//   t               : distance along the wall
//   connectsTo      : name of the room on the other side ('outside' for the front door)
function opening(room, applianceTypeKey, wall, t, connectsTo) {
  if (connectsTo === undefined) {
    connectsTo = null;
  }

  const n = NORMAL[wall];
  const point = wallPoint(room, wall, t);
  const px = point[0];
  const pz = point[1];
  const off = -WALL_THICKNESS / 2;

  return {
    _id: new ObjectId(),
    applianceTypeKey: applianceTypeKey,
    category: 'build',
    x: px + n[0] * off,
    z: pz + n[1] * off,
    rotY: Math.atan2(n[0], n[1]),
    wall: wall,
    t: t,
    onPlacementId: null,
    cu: 0,
    connectsTo: connectsTo,
  };
}

// ============================================================================
// Building the rooms of a flat
// ============================================================================

// Turns a flat type id into the list of rooms (with doors and windows).
function generateRooms(flatTypeId) {
  const layout = LAYOUTS[flatTypeId];
  if (!layout) {
    throw new Error(`Unknown flat type: ${flatTypeId}`);
  }
  const W = layout.width;
  const D = layout.depth;

  // rects[k] is the blueprint rectangle of rooms[k]
  const rects = layout.rooms;
  const rooms = [];
  for (let order = 0; order < rects.length; order++) {
    const r = rects[order];
    rooms.push({
      name: r.name,
      type: r.type,
      order: order,
      dimension: { w: r.w, d: r.d, h: CEILING_H },
      origin: { x: r.x, z: r.z },
      placements: [],
    });
  }

  for (let k = 0; k < rooms.length; k++) {
    const room = rooms[k];
    const r = rects[k];
    let doorWall = -1;

    if (r.type === 'living') {
      // The living room has the front door on its bottom wall.
      doorWall = 2;
      room.placements.push(opening({ w: r.w, d: r.d }, 'timber_flush_door', 2, r.w * 0.33, 'outside'));
    } else {
      // Every other room gets a door into a neighbour.
      let pick = null;
      for (let i = 0; i < 4; i++) {
        const segments = sharedSegments(rects, k, i);
        for (const seg of segments) {
          const neighbour = rects[seg.roomIndex];
          if (r.ensuite && neighbour.name !== r.ensuite) {
            continue;
          }
          let score = seg.hi - seg.lo;
          if (neighbour.type === 'living') {
            score = score + 100;
          }
          if (!pick || score > pick.score) {
            pick = { i: i, seg: seg, score: score };
          }
        }
      }

      if (pick) {
        const i = pick.i;
        const seg = pick.seg;
        const mid = (seg.lo + seg.hi) / 2;
        const otherIndex = seg.roomIndex;
        const o = rects[otherIndex];
        doorWall = i;

        // gx, gz = the middle of the door on the whole floor plan
        let gx = mid;
        let gz = mid;
        if (i % 2 === 1) {
          if (i === 1) {
            gx = r.x + r.w;
          } else {
            gx = r.x;
          }
          gz = mid;
        } else {
          gx = mid;
          if (i === 0) {
            gz = r.z;
          } else {
            gz = r.z + r.d;
          }
        }

        // The door on this room's side
        room.placements.push(opening({ w: r.w, d: r.d }, 'timber_flush_door', i, tFor(r, i, gx, gz), o.name));

        // and the matching door on the the opposite wall.
        const j = (i + 2) % 4;
        rooms[otherIndex].placements.push(opening({ w: o.w, d: o.d }, 'timber_flush_door', j, tFor(o, j, gx, gz), r.name));
      }
    }

    // Every room except bathrooms gets a window on its longest outside wall
    // that does not already have the door.
    if (r.type !== 'bathroom') {
      const free = [];
      for (let i = 0; i < 4; i++) {
        if (isExterior(r, i, W, D) && i !== doorWall) {
          free.push(i);
        }
      }
      if (free.length > 0) {
        free.sort(function (a, b) {
          return wallLength(r, b) - wallLength(r, a);
        });
        const i = free[0];
        room.placements.push(opening({ w: r.w, d: r.d }, 'single_glazed_window', i, wallLength(r, i) / 2));
      }
    }
  }

  return { footprint: { w: W, d: D }, rooms: rooms };
}

// Length of wall i of room r (walls 0 and 2 run along the width, 1 and 3 along the depth).
function wallLength(r, i) {
  if (i % 2 === 1) {
    return r.d;
  }
  return r.w;
}

// ============================================================================
// Loading extra blueprints from the database
// ============================================================================

// Reads each flat type's roomTemplate from the database and adds it to LAYOUTS.
async function loadLayouts(db) {
  const flats = await db.collection('flat_types').find().toArray();

  for (const flat of flats) {
    const template = flat.roomTemplate;
    if (template && template.rooms && template.rooms.length) {
      LAYOUTS[flat._id] = {
        width: template.width,
        depth: template.depth,
        rooms: template.rooms,
      };
    }
  }
}

module.exports = { generateRooms, LAYOUTS, loadLayouts, isOpeningKey, opening, wallPoint, NORMAL };
