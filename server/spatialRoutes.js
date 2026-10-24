const express = require('express');
const { ObjectId } = require('mongodb');
const { getDb } = require('./db');
const { generateRooms, LAYOUTS } = require('./floorplan');
const L = require('./layout');

const router = express.Router();

const oid = (s) => (ObjectId.isValid(s) && String(new ObjectId(s)) === String(s) ? new ObjectId(s) : null);
const bad = (res, msg, code = 400) => res.status(code).json({ error: msg });
const finite = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);

const guard = (fn) => async (req, res, next) => {
  try { await fn(req, res); }
  catch (e) { if (e instanceof L.LayoutError) return bad(res, e.message, 409); next(e); }
};

function sanitizePlacements(list) {
  const idMap = new Map();
  const idFor = (raw) => {
    if (raw == null) return null;
    const key = String(raw);
    if (!idMap.has(key)) idMap.set(key, oid(key) || new ObjectId());
    return idMap.get(key);
  };
  const out = list.map((p) => ({
    _id: idFor(p._id ?? p.id) ?? new ObjectId(),
    applianceTypeKey: String(p.applianceTypeKey ?? p.type ?? ''),
    category: String(p.category ?? ''),
    tick: p.tick == null ? null : String(p.tick),
    x: finite(p.x), z: finite(p.z), rotY: finite(p.rotY),
    wall: Math.max(-1, Math.min(3, Math.trunc(finite(p.wall, -1)))),
    t: finite(p.t), cu: finite(p.cu),
    onPlacementId: p.onPlacementId ?? p.on ?? null,
    connectsTo: p.connectsTo ?? null,
  }));
  for (const p of out) {
    p.onPlacementId = p.onPlacementId == null ? null : idMap.get(String(p.onPlacementId)) || null;
    if (!p.applianceTypeKey || !p.category) throw Object.assign(new Error('Each placement needs applianceTypeKey and category'), { status: 400 });
  }
  return out;
}

async function loadRooms(db, householdId) {
  const rooms = await db.collection('rooms').find({ householdId }).sort({ order: 1 }).toArray();
  return rooms.map((r) => ({ ...r, openWalls: r.openWalls || [] }));
}

async function saveRooms(db, rooms) {
  const f = (v) => (Number.isFinite(v) ? v : 0);
  const ops = rooms.map((r) => ({
    updateOne: {
      filter: { _id: r._id },
      update: {
        $set: {
          origin: { x: f(r.origin.x), z: f(r.origin.z) },
          dimension: { w: f(r.dimension.w), d: f(r.dimension.d), h: f(r.dimension.h) },
          placements: r.placements.map((p) => ({ ...p, x: f(p.x), z: f(p.z), rotY: f(p.rotY), t: f(p.t), cu: f(p.cu) })),
          openWalls: r.openWalls.map((o) => ({ wall: o.wall, t0: f(o.t0), t1: f(o.t1), to: o.to })),
        },
      },
    },
  }));
  if (ops.length) await db.collection('rooms').bulkWrite(ops);
}

const answer = (rooms) => ({ rooms, footprint: L.footprintOf(rooms), warnings: L.warnings(rooms) });

async function insertRooms(db, householdId, flatTypeId) {
  const { rooms } = generateRooms(flatTypeId);
  const docs = rooms.map((r) => ({ ...r, householdId }));
  await db.collection('rooms').insertMany(docs);
  return answer(docs);
}

router.post('/households', async (req, res) => {
  const { userId, flatTypeId, name } = req.body || {};
  if (!userId || !name) return bad(res, 'userId and name are required');
  if (!LAYOUTS[flatTypeId]) return bad(res, `flatTypeId must be one of ${Object.keys(LAYOUTS).join(', ')}`);

  const db = await getDb();
  const household = {
    userId: String(userId), flatTypeId, name: String(name),
    occupants: req.body.occupants != null ? Math.trunc(finite(req.body.occupants)) : null,
    monthlyBudget: finite(req.body.monthlyBudget), tariff: finite(req.body.tariff),
    usagePattern: req.body.usagePattern ?? null, updatedAt: new Date(),
  };
  const { insertedId } = await db.collection('households').insertOne(household);
  try {
    const { footprint, rooms } = await insertRooms(db, insertedId, flatTypeId);
    res.status(201).json({ household: { ...household, _id: insertedId }, footprint, rooms });
  } catch (e) {
    await db.collection('households').deleteOne({ _id: insertedId });
    throw e;
  }
});

router.get('/households/:id/floorplan', async (req, res) => {
  const id = oid(req.params.id);
  if (!id) return bad(res, 'Invalid household id');
  const db = await getDb();
  const household = await db.collection('households').findOne({ _id: id });
  if (!household) return bad(res, 'Household not found', 404);
  res.json({ household, ...answer(await loadRooms(db, id)) });
});

router.put('/households/:id/openings/:pid', guard(async (req, res) => {
  const hid = oid(req.params.id), pid = oid(req.params.pid), roomId = oid(req.body?.roomId);
  if (!hid || !pid || !roomId) return bad(res, 'householdId, roomId and the door/window id are required');
  const db = await getDb();
  const rooms = L.moveOpening(await loadRooms(db, hid), roomId, pid, Number(req.body.wall), Number(req.body.t));
  await saveRooms(db, rooms);
  res.json(answer(rooms));
}));

router.delete('/households/:id/openings/:pid', guard(async (req, res) => {
  const hid = oid(req.params.id), pid = oid(req.params.pid), roomId = oid(req.query.roomId);
  if (!hid || !pid || !roomId) return bad(res, 'householdId, roomId and the door/window id are required');
  const db = await getDb();
  const rooms = L.removeOpening(await loadRooms(db, hid), roomId, pid);
  await saveRooms(db, rooms);
  res.json(answer(rooms));
}));

router.put('/households/:id/room-rect', guard(async (req, res) => {
  const hid = oid(req.params.id), roomId = oid(req.body?.roomId), r = req.body?.rect;
  if (!hid || !roomId || !r) return bad(res, 'householdId, roomId and rect are required');
  const db = await getDb();
  const rooms = L.setRoomRect(await loadRooms(db, hid), roomId, { x: finite(r.x), z: finite(r.z), w: finite(r.w), d: finite(r.d) });
  await saveRooms(db, rooms);
  res.json(answer(rooms));
}));

router.put('/households/:id/layout', guard(async (req, res) => {
  const hid = oid(req.params.id), incoming = req.body?.rooms;
  if (!hid || !Array.isArray(incoming) || incoming.length > 40) return bad(res, 'householdId and rooms are required');
  const rooms = incoming.map((r) => {
    const _id = oid(r?._id);
    if (!_id) throw new L.LayoutError('Bad room id in the layout');
    return {
      _id, householdId: hid,
      name: String(r.name ?? '').trim(), type: String(r.type ?? ''), order: Math.trunc(finite(r.order)),
      origin: { x: finite(r.origin?.x), z: finite(r.origin?.z) },
      dimension: { w: finite(r.dimension?.w), d: finite(r.dimension?.d), h: finite(r.dimension?.h) },
      placements: sanitizePlacements(Array.isArray(r.placements) ? r.placements : []),
      openWalls: (Array.isArray(r.openWalls) ? r.openWalls : []).map((o) => ({ wall: Math.trunc(finite(o.wall, -1)), t0: finite(o.t0), t1: finite(o.t1), to: String(o.to ?? '') })),
    };
  });
  L.validateLayout(rooms);
  const db = await getDb();
  const ids = rooms.map((r) => r._id);
  if (await db.collection('rooms').countDocuments({ _id: { $in: ids }, householdId: { $ne: hid } })) return bad(res, 'Those rooms belong to another flat', 403);
  await db.collection('rooms').bulkWrite([
    { deleteMany: { filter: { householdId: hid, _id: { $nin: ids } } } },
    ...rooms.map((r) => ({ replaceOne: { filter: { _id: r._id }, replacement: r, upsert: true } })),
  ]);
  res.json(answer(rooms));
}));

router.put('/rooms/:roomId/placements', async (req, res) => {
  const id = oid(req.params.roomId);
  if (!id) return bad(res, 'Invalid room id');
  if (!Array.isArray(req.body?.placements)) return bad(res, 'placements must be an array');
  const placements = sanitizePlacements(req.body.placements);
  const { matchedCount } = await (await getDb()).collection('rooms').updateOne({ _id: id }, { $set: { placements } });
  matchedCount ? res.json({ placements }) : bad(res, 'Room not found', 404);
});

router.post('/rooms/:roomId/placements', async (req, res) => {
  const id = oid(req.params.roomId);
  if (!id) return bad(res, 'Invalid room id');
  const [placement] = sanitizePlacements([{ ...req.body, _id: null }]);
  placement.onPlacementId = oid(req.body.onPlacementId);
  const { matchedCount } = await (await getDb()).collection('rooms').updateOne({ _id: id }, { $push: { placements: placement } });
  matchedCount ? res.status(201).json(placement) : bad(res, 'Room not found', 404);
});

router.put('/rooms/:roomId/placements/:pid', async (req, res) => {
  const roomId = oid(req.params.roomId), pid = oid(req.params.pid);
  if (!roomId || !pid) return bad(res, 'Invalid id');
  const b = req.body || {}, set = {};
  for (const k of ['x', 'z', 'rotY', 't', 'cu']) if (b[k] !== undefined) set[`placements.$[p].${k}`] = finite(b[k]);
  if (b.wall !== undefined) set['placements.$[p].wall'] = Math.max(-1, Math.min(3, Math.trunc(finite(b.wall, -1))));
  if (b.tick !== undefined) set['placements.$[p].tick'] = b.tick == null ? null : String(b.tick);
  if (!Object.keys(set).length) return bad(res, 'Nothing to update');
  const r = await (await getDb()).collection('rooms').updateOne({ _id: roomId }, { $set: set }, { arrayFilters: [{ 'p._id': pid }] });
  r.matchedCount ? res.json({ ok: true }) : bad(res, 'Room not found', 404);
});

router.delete('/rooms/:roomId/placements/:pid', async (req, res) => {
  const roomId = oid(req.params.roomId), pid = oid(req.params.pid);
  if (!roomId || !pid) return bad(res, 'Invalid id');
  const r = await (await getDb()).collection('rooms').updateOne(
    { _id: roomId },
    { $pull: { placements: { $or: [{ _id: pid }, { onPlacementId: pid }] } } },
  );
  r.matchedCount ? res.sendStatus(204) : bad(res, 'Room not found', 404);
});

module.exports = router;
module.exports.sanitizePlacements = sanitizePlacements;