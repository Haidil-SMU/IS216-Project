// server/spatialRoutes.js  -  households, generated floor plan, and room placements
const express = require('express');
const { ObjectId } = require('mongodb');
const { getDb } = require('./db');
const { generateRooms, LAYOUTS } = require('./floorplan');

const router = express.Router();

const oid = (s) => (ObjectId.isValid(s) && String(new ObjectId(s)) === String(s) ? new ObjectId(s) : null);
const bad = (res, msg, code = 400) => res.status(code).json({ error: msg });
const finite = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);


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


function findClash(origin, dim, siblings) {
  const EPS = 0.02;
  return siblings.find((o) =>
    origin.x < o.origin.x + o.dimension.w - EPS && origin.x + dim.w > o.origin.x + EPS &&
    origin.z < o.origin.z + o.dimension.d - EPS && origin.z + dim.d > o.origin.z + EPS);
}

async function insertRooms(db, householdId, flatTypeId) {
  const { footprint, rooms } = generateRooms(flatTypeId);
  const docs = rooms.map((r) => ({ ...r, householdId }));
  await db.collection('rooms').insertMany(docs);
  return { footprint, rooms: docs };
}

// GET /api/flat-types
router.get('/flat-types', async (req, res) => {
  const db = await getDb();
  res.json(await db.collection('flat_types').find().sort({ bedrooms: 1, _id: 1 }).toArray());
});

// POST /api/households
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

// GET /api/households/:id/floorplan
router.get('/households/:id/floorplan', async (req, res) => {
  const id = oid(req.params.id);
  if (!id) return bad(res, 'Invalid household id');
  const db = await getDb();
  const household = await db.collection('households').findOne({ _id: id });
  if (!household) return bad(res, 'Household not found', 404);
  const rooms = await db.collection('rooms').find({ householdId: id }).sort({ order: 1 }).toArray();
  const t = LAYOUTS[household.flatTypeId];
  res.json({ household, footprint: t ? { w: t.width, d: t.depth } : null, rooms });
});

// PUT /api/households/:id/flat-type   { flatTypeId }
router.put('/households/:id/flat-type', async (req, res) => {
  const id = oid(req.params.id);
  const { flatTypeId } = req.body || {};
  if (!id) return bad(res, 'Invalid household id');
  if (!LAYOUTS[flatTypeId]) return bad(res, 'Unknown flatTypeId');
  const db = await getDb();
  const { matchedCount } = await db.collection('households').updateOne({ _id: id }, { $set: { flatTypeId, updatedAt: new Date() } });
  if (!matchedCount) return bad(res, 'Household not found', 404);
  await db.collection('rooms').deleteMany({ householdId: id });
  res.json(await insertRooms(db, id, flatTypeId));
});

// GET /api/rooms/:roomId
router.get('/rooms/:roomId', async (req, res) => {
  const id = oid(req.params.roomId);
  if (!id) return bad(res, 'Invalid room id');
  const room = await (await getDb()).collection('rooms').findOne({ _id: id });
  room ? res.json(room) : bad(res, 'Room not found', 404);
});

// PUT /api/rooms/:roomId
router.put('/rooms/:roomId', async (req, res) => {
  const id = oid(req.params.roomId);
  if (!id) return bad(res, 'Invalid room id');
  const rooms = (await getDb()).collection('rooms');
  const room = await rooms.findOne({ _id: id });
  if (!room) return bad(res, 'Room not found', 404);

  const set = {};
  const d = req.body?.dimension;
  if (d) {
    const dim = { w: finite(d.w), d: finite(d.d), h: finite(d.h) };
    if (dim.w < 1.5 || dim.w > 15 || dim.d < 1.5 || dim.d > 15 || dim.h < 2.2 || dim.h > 4) return bad(res, 'Room size out of range');
    const siblings = await rooms.find({ householdId: room.householdId, _id: { $ne: id } }).toArray();
    const clash = findClash(room.origin, dim, siblings);
    if (clash) return bad(res, `That size would overlap the ${clash.name}`, 409);
    set.dimension = dim;
  }
  if (Array.isArray(req.body?.placements)) set.placements = sanitizePlacements(req.body.placements);
  if (!Object.keys(set).length) return bad(res, 'Nothing to update');

  await rooms.updateOne({ _id: id }, { $set: set });
  res.json(set);
});

// PUT /api/rooms/:roomId/placements
router.put('/rooms/:roomId/placements', async (req, res) => {
  const id = oid(req.params.roomId);
  if (!id) return bad(res, 'Invalid room id');
  if (!Array.isArray(req.body?.placements)) return bad(res, 'placements must be an array');
  const placements = sanitizePlacements(req.body.placements);
  const { matchedCount } = await (await getDb()).collection('rooms').updateOne({ _id: id }, { $set: { placements } });
  matchedCount ? res.json({ placements }) : bad(res, 'Room not found', 404);
});

// POST /api/rooms/:roomId/placements
router.post('/rooms/:roomId/placements', async (req, res) => {
  const id = oid(req.params.roomId);
  if (!id) return bad(res, 'Invalid room id');
  const [placement] = sanitizePlacements([{ ...req.body, _id: null }]);
  placement.onPlacementId = oid(req.body.onPlacementId);
  const { matchedCount } = await (await getDb()).collection('rooms').updateOne({ _id: id }, { $push: { placements: placement } });
  matchedCount ? res.status(201).json(placement) : bad(res, 'Room not found', 404);
});

// PUT /api/rooms/:roomId/placements/:pid
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

// DELETE /api/rooms/:roomId/placements/:pid
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
module.exports.findClash = findClash;
