
const { ObjectId } = require('mongodb');
const { generateRooms, wallPoint, NORMAL, isOpeningKey } = require('./floorplan');

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const halfWidth = (p) => (p.category === 'build' ? 0.95 : 0.5);
const FLOOR_MARGIN = 0.3;

const isOpening = (p) => p.category === 'build' && isOpeningKey(p.applianceTypeKey);


function carryOver(oldRoom, newRoom) {
  const { w: W, d: D } = newRoom.dimension;
  const items = (oldRoom.placements || []).filter((p) => !isOpening(p));
  const shift = new Map();
  const out = [];
  let adjusted = 0;

  const place = (p, x, z, extra = {}) => {
    const dx = x - p.x, dz = z - p.z;
    if (Math.abs(dx) > 1e-6 || Math.abs(dz) > 1e-6) adjusted++;
    shift.set(String(p._id), [dx, dz]);
    out.push({ ...p, x, z, ...extra });
  };

  for (const p of items.filter((q) => !q.onPlacementId)) {
    if (p.wall >= 0) {
      const length = p.wall % 2 ? D : W;
      const margin = halfWidth(p);
      if (length < margin * 2 + 0.1) continue;
      const [ox, oz] = wallPoint(oldRoom.dimension, p.wall, p.t), n = NORMAL[p.wall];
      const offset = (p.x - ox) * n[0] + (p.z - oz) * n[1];
      const t = clamp(p.t, margin, length - margin);
      const [nx, nz] = wallPoint(newRoom.dimension, p.wall, t);
      place(p, nx + n[0] * offset, nz + n[1] * offset, { t });
    } else {
      place(p, clamp(p.x, FLOOR_MARGIN, W - FLOOR_MARGIN), clamp(p.z, FLOOR_MARGIN, D - FLOOR_MARGIN));
    }
  }
  for (const p of items.filter((q) => q.onPlacementId)) {
    const moved = shift.get(String(p.onPlacementId));
    if (!moved) continue;
    place(p, p.x + moved[0], p.z + moved[1]);
  }
  return { placements: out, adjusted, dropped: items.length - out.length };
}

function reconcileRooms(oldRooms, flatTypeId, householdId) {
  const { rooms: fresh } = generateRooms(flatTypeId);
  const unmatched = new Map(oldRooms.map((r) => [r.name, r]));
  const keep = [], add = [];
  let adjusted = 0, dropped = 0;

  for (const room of fresh) {
    const old = unmatched.get(room.name);
    unmatched.delete(room.name);
    if (!old) { add.push({ ...room, _id: new ObjectId(), householdId }); continue; }
    const carried = carryOver(old, room);
    adjusted += carried.adjusted; dropped += carried.dropped;
    keep.push({ ...room, _id: old._id, householdId, placements: [...room.placements, ...carried.placements] });
  }
  const remove = [...unmatched.values()];
  for (const r of remove) dropped += (r.placements || []).filter((p) => !isOpening(p)).length;

  return { keep, add, remove, adjusted, dropped };
}

module.exports = { reconcileRooms };
