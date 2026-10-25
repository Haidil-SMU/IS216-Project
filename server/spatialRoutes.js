const express = require('express');
const { ObjectId } = require('mongodb');
const { getDb } = require('./db');
const { requireClient } = require('./auth');
const { generateRooms, LAYOUTS } = require('./floorplan');
const L = require('./layout');
const { reconcileRooms } = require('./roomSync');

const router = express.Router();

// Every spatial route is for a logged-in homeowner, and only for their own flat.
router.use(requireClient);

const oid = (s) => (ObjectId.isValid(s) && String(new ObjectId(s)) === String(s) ? new ObjectId(s) : null);
const bad = (res, msg, code = 400) => res.status(code).json({ error: msg });
const finite = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);

const guard = (fn) => async (req, res, next) => {
  try { await fn(req, res); }
  catch (e) { if (e instanceof L.LayoutError) return bad(res, e.message, 409); next(e); }
};

const CATEGORIES = new Set(['build', 'kitchen', 'cooling', 'entertainment', 'laundry', 'lighting', 'bathroom']);

const cleanTick = (category, tick) => (category === 'build' || tick == null || tick === '' || tick === 'none' ? null : String(tick));

const KEY_ALIAS = {
  aircon_multi_split_2_rooms: 'aircon_single_split', aircon_multi_split_3_rooms: 'aircon_single_split',
  aircon_multi_split_4_rooms: 'aircon_single_split', aircon_vrf_three_phase: 'aircon_single_split',
  tv_32_inch_wall_mounted: 'tv_43_inch_wall_mounted',
};
const currentKey = (k) => KEY_ALIAS[k] ?? k;
const cleanText = (v) => (v == null || v === '' ? null : String(v).trim().slice(0, 120) || null);

function sanitizePlacements(list) {
  const idMap = new Map();
  const idFor = (raw) => {
    if (raw == null) return null;
    const key = String(raw);
    if (!idMap.has(key)) idMap.set(key, oid(key) || new ObjectId());
    return idMap.get(key);
  };
  const out = list.map((p) => {
    const applianceTypeKey = currentKey(String(p.applianceTypeKey ?? '').trim());
    const category = String(p.category ?? '').trim();
    if (!applianceTypeKey) throw Object.assign(new Error('Each placement needs an applianceTypeKey (e.g. "refrigerator_freezer_400l")'), { status: 400 });
    if (!CATEGORIES.has(category)) throw Object.assign(new Error(`Unknown appliance category "${category}"`), { status: 400 });
    const tick = cleanTick(category, p.tick);
    const brand = category === 'build' ? null : cleanText(p.brand), model = brand ? cleanText(p.model) : null;
    return {
      _id: idFor(p._id) ?? new ObjectId(),
      applianceTypeKey, category,
      ...(tick ? { tick } : {}),
      ...(brand && model ? { brand, model } : {}),
      x: finite(p.x), z: finite(p.z), rotY: finite(p.rotY),
      wall: Math.max(-1, Math.min(3, Math.trunc(finite(p.wall, -1)))),
      t: finite(p.t), cu: finite(p.cu),
      onPlacementId: p.onPlacementId ?? null,
      connectsTo: p.connectsTo ?? null,
    };
  });
  for (const p of out) p.onPlacementId = p.onPlacementId == null ? null : idMap.get(String(p.onPlacementId)) || null;
  return out;
}

async function loadRooms(db, householdId) {
  const rooms = await db.collection('rooms').find({ householdId }).sort({ order: 1 }).toArray();
  return rooms.map((r) => ({
    ...r, openWalls: r.openWalls || [],
    placements: (r.placements || []).map((p) => (KEY_ALIAS[p.applianceTypeKey] ? { ...p, applianceTypeKey: currentKey(p.applianceTypeKey) } : p)),
  }));
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
  return docs;
}

const locks = new Map();
function withLock(key, job) {
  const run = (locks.get(key) || Promise.resolve()).catch(() => {}).then(job);
  const tail = run.catch(() => {});
  locks.set(key, tail);
  tail.then(() => { if (locks.get(key) === tail) locks.delete(key); });
  return run;
}

function ensureRooms(db, household) {
  return withLock(String(household._id), async () => {
    if (await db.collection('rooms').countDocuments({ householdId: household._id })) return;
    if (!LAYOUTS[household.flatTypeId]) {
      throw new L.LayoutError(`No floor plan for flat type "${household.flatTypeId}". Choose a flat type in My Profile.`);
    }
    await insertRooms(db, household._id, household.flatTypeId);
  });
}

function syncRoomsToFlatType(db, householdId, flatTypeId) {
  return withLock(String(householdId), async () => {
    if (!LAYOUTS[flatTypeId]) throw new L.LayoutError(`Unknown flat type "${flatTypeId}"`);
    const old = await loadRooms(db, householdId);
    if (!old.length) return { updated: false, added: [], removed: [], dropped: 0, adjusted: 0 };
    const plan = reconcileRooms(old, flatTypeId, householdId);
    L.validateLayout([...plan.keep, ...plan.add]);

    await db.collection('rooms').bulkWrite([
      { deleteMany: { filter: { householdId, _id: { $in: plan.remove.map((r) => r._id) } } } },
      ...plan.keep.map((r, i) => ({ updateOne: { filter: { _id: r._id }, update: { $set: { order: -(i + 1) } } } })),
      ...plan.keep.map((r) => ({ replaceOne: { filter: { _id: r._id }, replacement: r } })),
      ...plan.add.map((r) => ({ insertOne: { document: r } })),
    ], { ordered: true });
    return {
      updated: true,
      added: plan.add.map((r) => r.name), removed: plan.remove.map((r) => r.name),
      dropped: plan.dropped, adjusted: plan.adjusted,
    };
  });
}

const userObjectId = (req) => new ObjectId(req.session.userId);
const ownHousehold = (db, req, id) => db.collection('households').findOne({ _id: id, userId: userObjectId(req) });

async function resolveHousehold(req, wanted = null) {
  const db = getDb();
  let household = null;
  for (const id of [wanted, oid(req.session.householdId)]) {
    if (id && !household) household = await ownHousehold(db, req, id);
  }
  household ??= await db.collection('households').findOne({ userId: userObjectId(req) }, { sort: { _id: -1 } });
  req.session.householdId = household ? String(household._id) : undefined;
  return household;
}

const publicHousehold = ({ userId, ...rest }) => rest;

// Ownership checks for every route that has :id (household) or :roomId in its path.
router.param('id', async (req, res, next, value) => {
  try {
    const id = oid(value);
    if (!id) return bad(res, 'Invalid household id');
    if (!(await ownHousehold(getDb(), req, id))) return bad(res, 'Household not found', 404);
    next();
  } catch (e) { next(e); }
});
router.param('roomId', async (req, res, next, value) => {
  try {
    const id = oid(value);
    if (!id) return bad(res, 'Invalid room id');
    const room = await getDb().collection('rooms').findOne({ _id: id }, { projection: { householdId: 1 } });
    if (!room || !(await ownHousehold(getDb(), req, room.householdId))) return bad(res, 'Room not found', 404);
    next();
  } catch (e) { next(e); }
});

// GET: the logged-in user's household with its rooms (created on first visit if it has none).
router.get('/catalogue', async (req, res) => {
  const items = await getDb().collection('catalogue_items').find({}, { projection: { _id: 0 } }).sort({ category: 1, order: 1 }).toArray();
  res.json(items);
});

router.get('/current', async (req, res) => {
  const db = getDb();
  const household = await resolveHousehold(req, oid(req.query.household));
  if (!household) {
    return res.status(404).json({ code: 'NO_HOUSEHOLD', error: 'Set up your household in My Profile first, then come back here.' });
  }
  try {
    await ensureRooms(db, household);
  } catch (e) {
    if (e instanceof L.LayoutError) return bad(res, e.message, 409);
    throw e;
  }
  res.json({ household: publicHousehold(household), ...answer(await loadRooms(db, household._id)) });
});

router.get('/households/:id/floorplan', async (req, res) => {
  const id = oid(req.params.id);
  const db = getDb();
  const household = await ownHousehold(db, req, id);
  req.session.householdId = String(id);
  res.json({ household: publicHousehold(household), ...answer(await loadRooms(db, id)) });
});

// Adds a door or window. The server finds where it fits, and a door on a wall two rooms share
// joins them.
router.post('/households/:id/openings', guard(async (req, res) => {
  const hid = oid(req.params.id), roomId = oid(req.body?.roomId), key = String(req.body?.applianceTypeKey ?? '');
  if (!hid || !roomId || !key) return bad(res, 'householdId, roomId and applianceTypeKey are required');
  const db = await getDb();
  const rooms = L.addOpening(await loadRooms(db, hid), roomId, key, null, null, req.body?.spots);
  await saveRooms(db, rooms);
  res.status(201).json(answer(rooms));
}));

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
  let placements;
  try { placements = sanitizePlacements(req.body.placements); } catch (e) { if (e.status === 400) return bad(res, e.message); throw e; }
  const { matchedCount } = await (await getDb()).collection('rooms').updateOne({ _id: id }, { $set: { placements } });
  matchedCount ? res.json({ placements }) : bad(res, 'Room not found', 404);
});

router.post('/rooms/:roomId/placements', async (req, res) => {
  const id = oid(req.params.roomId);
  if (!id) return bad(res, 'Invalid room id');
  let placement;
  try { [placement] = sanitizePlacements([{ ...req.body, _id: null }]); } catch (e) { if (e.status === 400) return bad(res, e.message); throw e; }
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
  if (b.tick !== undefined) set['placements.$[p].tick'] = cleanTick('', b.tick);
  if (b.brand !== undefined && b.model !== undefined) {
    set['placements.$[p].brand'] = cleanText(b.brand);
    set['placements.$[p].model'] = cleanText(b.model);
  }
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
module.exports.resolveHousehold = resolveHousehold;
module.exports.syncRoomsToFlatType = syncRoomsToFlatType;