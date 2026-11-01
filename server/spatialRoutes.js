const express = require('express');
const { ObjectId } = require('mongodb');
const { getDb } = require('./db');
const { requireClient } = require('./auth');
const { generateRooms, LAYOUTS } = require('./floorplan');
const L = require('./layout');
const { reconcileRooms, checkRoomPlacements, PlacementError, isOpening } = L;
const { bulkWriteSafely, layoutOps } = require('./layoutWrite');

const router = express.Router();
router.use(requireClient);

const oid = (s) => (ObjectId.isValid(s) && String(new ObjectId(s)) === String(s) ? new ObjectId(s) : null);
const bad = (res, msg, code = 400) => res.status(code).json({ error: msg });
const finite = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);

const guard = (fn) => async (req, res, next) => {
  try { await fn(req, res); }
  catch (e) {
    if (e instanceof L.LayoutError || e instanceof PlacementError) return bad(res, e.message, 409);
    if (e.status === 400 || e.status === 404) return bad(res, e.message, e.status);
    next(e);
  }
};

const CATEGORIES = new Set(['build', 'kitchen', 'cooling', 'entertainment', 'laundry', 'lighting', 'bathroom']);

const cleanTick = (category, tick) => (category === 'build' || tick == null || tick === '' || tick === 'none' ? null : String(tick));

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
    const applianceTypeKey = String(p.applianceTypeKey ?? '').trim();
    const category = String(p.category ?? '').trim();
    if (!applianceTypeKey) throw Object.assign(new Error('Each placement needs an applianceTypeKey (e.g. "refrigerator_freezer_400l")'), { status: 400 });
    if (!CATEGORIES.has(category)) throw Object.assign(new Error(`Unknown appliance category "${category}"`), { status: 400 });
    const tick = cleanTick(category, p.tick);
    const brand = category === 'build' ? null : cleanText(p.brand), model = brand ? cleanText(p.model) : null;
    return {
      _id: idFor(p._id) ?? new ObjectId(),
      applianceTypeKey, category,
      ...(typeof p.name === 'string' ? { name: p.name.trim().slice(0, 160) } : {}),
      ...(typeof p.brand === 'string' ? { brand: p.brand.trim().slice(0, 100) } : {}),
      ...(typeof p.model === 'string' ? { model: p.model.trim().slice(0, 160) } : {}),
      ...(p.kwhYear != null && Number.isFinite(Number(p.kwhYear)) && Number(p.kwhYear) >= 0 ? { kwhYear: Number(p.kwhYear) } : {}),
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

const normaliseRooms = (rooms) => rooms.map((r) => ({ ...r, openWalls: r.openWalls || [], placements: r.placements || [] }));

async function loadRooms(db, householdId) {
  return normaliseRooms(await db.collection('rooms').find({ householdId }).sort({ order: 1 }).toArray());
}

const finiteOr0 = (v) => (Number.isFinite(v) ? v : 0);
const geometryOf = (r) => ({
  origin: { x: finiteOr0(r.origin.x), z: finiteOr0(r.origin.z) },
  dimension: { w: finiteOr0(r.dimension.w), d: finiteOr0(r.dimension.d), h: finiteOr0(r.dimension.h) },
  placements: r.placements.map(({ energyInfo, ...p }) => ({ ...p, x: finiteOr0(p.x), z: finiteOr0(p.z), rotY: finiteOr0(p.rotY), t: finiteOr0(p.t), cu: finiteOr0(p.cu) })),
  openWalls: r.openWalls.map((o) => ({ wall: o.wall, t0: finiteOr0(o.t0), t1: finiteOr0(o.t1), to: o.to })),
});

async function saveRooms(db, rooms) {
  const ops = rooms.map((r) => ({ updateOne: { filter: { _id: r._id }, update: { $set: geometryOf(r) } } }));
  await bulkWriteSafely(db.collection('rooms'), ops);
}

function cleanIncomingRooms(incoming, householdId) {
  return incoming.map((r) => {
    const _id = oid(r?._id);
    if (!_id) throw new L.LayoutError('Bad room id in the layout');
    return {
      _id, householdId,
      name: String(r.name ?? '').trim(), type: String(r.type ?? ''), order: Math.trunc(finite(r.order)),
      origin: { x: finite(r.origin?.x), z: finite(r.origin?.z) },
      dimension: { w: finite(r.dimension?.w), d: finite(r.dimension?.d), h: finite(r.dimension?.h) },
      placements: sanitizePlacements(Array.isArray(r.placements) ? r.placements : []),
      openWalls: (Array.isArray(r.openWalls) ? r.openWalls : []).map((o) => ({ wall: Math.trunc(finite(o.wall, -1)), t0: finite(o.t0), t1: finite(o.t1), to: String(o.to ?? '') })),
    };
  });
}

const answer = (rooms) => ({ rooms, footprint: L.footprintOf(rooms), warnings: L.warnings(rooms) });

function poseFields(b) {
  const set = {};
  for (const k of ['x', 'z', 'rotY', 't', 'cu']) if (b[k] !== undefined) set[k] = finite(b[k]);
  if (b.wall !== undefined) set.wall = Math.max(-1, Math.min(3, Math.trunc(finite(b.wall, -1))));
  return set;
}

function applyMoves(placements, moves) {
  if (!Array.isArray(moves) || !moves.length || moves.length > 200) throw Object.assign(new Error('moves must be a list of 1-200 items'), { status: 400 });
  const next = placements.map((p) => ({ ...p }));
  for (const m of moves) {
    const pid = oid(m?.id);
    const set = poseFields(m || {});
    if (!pid || !Object.keys(set).length) throw Object.assign(new Error('Each move needs an id and a position'), { status: 400 });
    const p = next.find((x) => String(x._id) === String(pid));
    if (!p) throw Object.assign(new Error('Placement not found'), { status: 404 });
    Object.assign(p, set);
  }
  return next;
}

const assertPlacements = (room, placements, openings = 'keep') =>
  checkRoomPlacements({ name: room.name, dimension: room.dimension, placements }, { previous: room, openings });

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

    await bulkWriteSafely(db.collection('rooms'), [
      { deleteMany: { filter: { householdId, _id: { $in: plan.remove.map((r) => r._id) } } } },
      ...plan.keep.map((r, i) => ({ updateOne: { filter: { _id: r._id }, update: { $set: { order: -(i + 1) } } } })),
      ...plan.keep.map((r) => ({ replaceOne: { filter: { _id: r._id }, replacement: r } })),
      ...plan.add.map((r) => ({ insertOne: { document: r } })),
    ]);
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
    req.roomHouseholdId = room.householdId;
    next();
  } catch (e) { next(e); }
});

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

router.post('/households/:id/openings', guard(async (req, res) => {
  const hid = oid(req.params.id), roomId = oid(req.body?.roomId), key = String(req.body?.applianceTypeKey ?? '');
  if (!hid || !roomId || !key) return bad(res, 'householdId, roomId and applianceTypeKey are required');
  const db = getDb();
  const rooms = await withLock(String(hid), async () => {
    const changed = L.addOpening(await loadRooms(db, hid), roomId, key, null, null, req.body?.spots);
    await saveRooms(db, changed);
    return changed;
  });
  res.status(201).json(answer(rooms));
}));

router.put('/households/:id/openings/:pid', guard(async (req, res) => {
  const hid = oid(req.params.id), pid = oid(req.params.pid), roomId = oid(req.body?.roomId);
  if (!hid || !pid || !roomId) return bad(res, 'householdId, roomId and the door/window id are required');
  const db = getDb();
  const rooms = await withLock(String(hid), async () => {
    const changed = L.moveOpening(await loadRooms(db, hid), roomId, pid, Number(req.body.wall), Number(req.body.t));
    await saveRooms(db, changed);
    return changed;
  });
  res.json(answer(rooms));
}));

router.delete('/households/:id/openings/:pid', guard(async (req, res) => {
  const hid = oid(req.params.id), pid = oid(req.params.pid), roomId = oid(req.query.roomId);
  if (!hid || !pid || !roomId) return bad(res, 'householdId, roomId and the door/window id are required');
  const db = getDb();
  const rooms = await withLock(String(hid), async () => {
    const changed = L.removeOpening(await loadRooms(db, hid), roomId, pid);
    await saveRooms(db, changed);
    return changed;
  });
  res.json(answer(rooms));
}));

router.put('/households/:id/wall-opening', guard(async (req, res) => {
  const hid = oid(req.params.id), roomId = oid(req.body?.roomId), otherId = oid(req.body?.otherId);
  if (!hid || !roomId || !otherId || typeof req.body?.open !== 'boolean') return bad(res, 'householdId, roomId, otherId and open (true or false) are required');
  const db = getDb();
  const rooms = await withLock(String(hid), async () => {
    const changed = L.setWallOpen(await loadRooms(db, hid), roomId, otherId, req.body.open);
    await saveRooms(db, changed);
    return changed;
  });
  res.json(answer(rooms));
}));

router.put('/households/:id/room-rect', guard(async (req, res) => {
  const hid = oid(req.params.id), roomId = oid(req.body?.roomId), r = req.body?.rect;
  if (!hid || !roomId || !r) return bad(res, 'householdId, roomId and rect are required');
  const db = getDb();
  const rooms = await withLock(String(hid), async () => {
    const changed = L.setRoomRect(await loadRooms(db, hid), roomId, { x: finite(r.x), z: finite(r.z), w: finite(r.w), d: finite(r.d) });
    await saveRooms(db, changed);
    return changed;
  });
  res.json(answer(rooms));
}));

router.put('/households/:id/layout', guard(async (req, res) => {
  const hid = oid(req.params.id), incoming = req.body?.rooms;
  if (!hid || !Array.isArray(incoming) || incoming.length > 40) return bad(res, 'householdId and rooms are required');
  const rooms = cleanIncomingRooms(incoming, hid);
  L.validateLayout(rooms);
  const db = getDb();
  const ids = rooms.map((r) => r._id);
  if (await db.collection('rooms').countDocuments({ _id: { $in: ids }, householdId: { $ne: hid } })) return bad(res, 'Those rooms belong to another flat', 403);
  await withLock(String(hid), async () => {
    const stored = await db.collection('rooms').find({ householdId: hid }).toArray();
    const was = new Map(stored.map((r) => [String(r._id), r]));
    for (const r of rooms) {
      const old = was.get(String(r._id));
      checkRoomPlacements(r, { previous: old ?? null, openings: 'any' }); // undo may restore an older door position
    }
    await bulkWriteSafely(db.collection('rooms'), layoutOps(stored, rooms, hid));
  });
  res.json(answer(rooms));
}));

const roomLock = (req) => String(req.roomHouseholdId);
const findRoom = (id) => getDb().collection('rooms').findOne({ _id: id });

router.put('/rooms/:roomId/placements', guard(async (req, res) => {
  const id = oid(req.params.roomId);
  if (!id) return bad(res, 'Invalid room id');
  if (!Array.isArray(req.body?.placements)) return bad(res, 'placements must be an array');
  const placements = sanitizePlacements(req.body.placements);
  const done = await withLock(roomLock(req), async () => {
    const room = await findRoom(id);
    if (!room) return false;
    assertPlacements(room, placements);
    await getDb().collection('rooms').updateOne({ _id: id }, { $set: { placements } });
    return true;
  });
  done ? res.json({ placements }) : bad(res, 'Room not found', 404);
}));

router.post('/rooms/:roomId/placements', guard(async (req, res) => {
  const id = oid(req.params.roomId);
  if (!id) return bad(res, 'Invalid room id');
  const [placement] = sanitizePlacements([{ ...req.body, _id: null }]);
  placement.onPlacementId = oid(req.body.onPlacementId);
  const done = await withLock(roomLock(req), async () => {
    const room = await findRoom(id);
    if (!room) return false;
    assertPlacements(room, [...(room.placements || []), placement]);
    await getDb().collection('rooms').updateOne({ _id: id }, { $push: { placements: placement } });
    return true;
  });
  done ? res.status(201).json(placement) : bad(res, 'Room not found', 404);
}));

router.post('/rooms/:roomId/placements/move', guard(async (req, res) => {
  const id = oid(req.params.roomId);
  if (!id) return bad(res, 'Invalid room id');
  const done = await withLock(roomLock(req), async () => {
    const room = await findRoom(id);
    if (!room) return false;
    const next = applyMoves(room.placements || [], req.body?.moves);
    assertPlacements(room, next);
    await getDb().collection('rooms').updateOne({ _id: id }, { $set: { placements: next } });
    return true;
  });
  done ? res.json({ ok: true }) : bad(res, 'Room not found', 404);
}));

router.put('/rooms/:roomId/placements/:pid', guard(async (req, res) => {
  const roomId = oid(req.params.roomId), pid = oid(req.params.pid);
  if (!roomId || !pid) return bad(res, 'Invalid id');
  const b = req.body || {}, set = poseFields(b);
  const extra = {};
  if (b.tick !== undefined) extra.tick = cleanTick('', b.tick);
  if (b.brand !== undefined && b.model !== undefined) { extra.brand = cleanText(b.brand); extra.model = cleanText(b.model); }
  if (!Object.keys(set).length && !Object.keys(extra).length) return bad(res, 'Nothing to update');
  const done = await withLock(roomLock(req), async () => {
    const room = await findRoom(roomId);
    if (!room) return false;
    if (!(room.placements || []).some((p) => String(p._id) === String(pid))) throw Object.assign(new Error('Placement not found'), { status: 404 });
    assertPlacements(room, room.placements.map((p) => (String(p._id) === String(pid) ? { ...p, ...set } : p)));
    const $set = Object.fromEntries(Object.entries({ ...set, ...extra }).map(([k, v]) => [`placements.$[p].${k}`, v]));
    await getDb().collection('rooms').updateOne({ _id: roomId }, { $set }, { arrayFilters: [{ 'p._id': pid }] });
    return true;
  });
  done ? res.json({ ok: true }) : bad(res, 'Room not found', 404);
}));

router.delete('/rooms/:roomId/placements/:pid', guard(async (req, res) => {
  const roomId = oid(req.params.roomId), pid = oid(req.params.pid);
  if (!roomId || !pid) return bad(res, 'Invalid id');
  const done = await withLock(roomLock(req), async () => {
    const room = await findRoom(roomId);
    if (!room) return false;
    const target = (room.placements || []).find((p) => String(p._id) === String(pid));
    if (target && isOpening(target)) throw new PlacementError('Remove a door or window with its own button, so the rooms it joins stay consistent.');
    await getDb().collection('rooms').updateOne({ _id: roomId }, { $pull: { placements: { $or: [{ _id: pid }, { onPlacementId: pid }] } } });
    return true;
  });
  done ? res.sendStatus(204) : bad(res, 'Room not found', 404);
}));


const planHousehold = (db, plan) => db.collection('households').findOne({ _id: plan.householdId, userId: plan.userId });

router.get('/households/:id/plans', async (req, res) => {
  const db = getDb();
  const household = await ownHousehold(db, req, oid(req.params.id));
  const plans = await db.collection('plans').find(
    { userId: userObjectId(req), householdId: household._id },
    { projection: { _id: 0, id: 1, name: 1, layoutCapturedAt: 1, layoutEditedAt: 1, layout: 1 } },
  ).sort({ name: 1 }).toArray();
  res.json(plans.map(({ layout, ...p }) => ({ ...p, hasLayout: Array.isArray(layout) && layout.length > 0 })));
});

router.param('planId', async (req, res, next, value) => {
  try {
    const plan = await getDb().collection('plans').findOne({ id: String(value), userId: userObjectId(req) });
    if (!plan) return bad(res, 'Plan not found', 404);
    if (!Array.isArray(plan.layout) || !plan.layout.length) return bad(res, 'This plan has no saved 3D layout.', 409);
    req.planId = plan.id;
    req.planHouseholdId = plan.householdId;
    next();
  } catch (e) { next(e); }
});

const notFound = (what) => Object.assign(new Error(`${what} not found`), { status: 404 });
const withoutEnergyInfo = (r) => ({ ...r, placements: r.placements.map(({ energyInfo, ...p }) => p) });
const planRooms = (layout) => normaliseRooms(layout).map(withoutEnergyInfo).sort((a, b) => finite(a.order) - finite(b.order));

function editPlanLayout(db, req, change) {
  const filter = { id: req.planId, userId: userObjectId(req) };
  return withLock(`plan:${req.planId}`, async () => {
    const plan = await db.collection('plans').findOne(filter);
    if (!plan) throw notFound('Plan');
    const { rooms, result } = await change(planRooms(plan.layout || []));
    await db.collection('plans').updateOne(filter, {
      $set: { layout: rooms.map((r) => ({ ...r, ...geometryOf(r) })), layoutEditedAt: new Date().toISOString() },
    });
    return { rooms, result };
  });
}
const roomIn = (rooms, id) => rooms.find((r) => String(r._id) === String(id)) || (() => { throw notFound('Room'); })();

const planAnswer = (plan, household) => ({
  household: publicHousehold(household),
  plan: { id: plan.id, name: plan.name, layoutCapturedAt: plan.layoutCapturedAt, layoutEditedAt: plan.layoutEditedAt },
  ...answer(planRooms(plan.layout)),
});

router.get('/plans/:planId/floorplan', async (req, res) => {
  const db = getDb();
  const plan = await db.collection('plans').findOne({ id: req.planId, userId: userObjectId(req) });
  const household = await planHousehold(db, plan);
  if (!household) return bad(res, 'Household not found', 404);
  req.session.householdId = String(household._id);
  res.json(planAnswer(plan, household));
});

router.put('/plans/:planId/layout', guard(async (req, res) => {
  const incoming = req.body?.rooms;
  if (!Array.isArray(incoming) || incoming.length > 40) return bad(res, 'rooms are required');
  const rooms = cleanIncomingRooms(incoming, req.planHouseholdId ?? null);
  L.validateLayout(rooms);
  const done = await editPlanLayout(getDb(), req, async (cur) => {
    for (const r of rooms) checkRoomPlacements(r, { previous: cur.find((o) => String(o._id) === String(r._id)) ?? null, openings: 'any' });
    return { rooms };
  });
  res.json(answer(done.rooms));
}));

router.post('/plans/:planRef/layout/from-home', guard(async (req, res) => {
  const db = getDb(), userId = userObjectId(req), planRef = String(req.params.planRef);
  const plan = await db.collection('plans').findOne({ id: planRef, userId });
  if (!plan) return bad(res, 'Plan not found', 404);
  const household = await planHousehold(db, plan);
  if (!household) return bad(res, 'Household not found', 404);
  await ensureRooms(db, household);
  const home = await loadRooms(db, household._id);
  if (!home.length) return bad(res, 'Your current home has no 3D layout to copy.', 409);
  L.validateLayout(home);
  const layout = home.map((r) => ({ ...r, ...geometryOf(r), householdId: household._id }));
  const now = new Date().toISOString();
  const filter = { id: planRef, userId };
  const saved = await withLock(`plan:${planRef}`, async () => {
    const res1 = await db.collection('plans').updateOne(filter, { $set: { layout, layoutCapturedAt: now, layoutEditedAt: now } });
    return res1.matchedCount !== 0;
  });
  if (!saved) return bad(res, 'Plan not found', 404);
  res.json(planAnswer({ ...plan, layout, layoutCapturedAt: now, layoutEditedAt: now }, household));
}));

router.post('/plans/:planId/openings', guard(async (req, res) => {
  const roomId = oid(req.body?.roomId), key = String(req.body?.applianceTypeKey ?? '');
  if (!roomId || !key) return bad(res, 'roomId and applianceTypeKey are required');
  const { rooms } = await editPlanLayout(getDb(), req, async (cur) => ({ rooms: L.addOpening(cur, roomId, key, null, null, req.body?.spots) }));
  res.status(201).json(answer(rooms));
}));

router.put('/plans/:planId/openings/:pid', guard(async (req, res) => {
  const pid = oid(req.params.pid), roomId = oid(req.body?.roomId);
  if (!pid || !roomId) return bad(res, 'roomId and the door/window id are required');
  const { rooms } = await editPlanLayout(getDb(), req, async (cur) => ({ rooms: L.moveOpening(cur, roomId, pid, Number(req.body.wall), Number(req.body.t)) }));
  res.json(answer(rooms));
}));

router.delete('/plans/:planId/openings/:pid', guard(async (req, res) => {
  const pid = oid(req.params.pid), roomId = oid(req.query.roomId);
  if (!pid || !roomId) return bad(res, 'roomId and the door/window id are required');
  const { rooms } = await editPlanLayout(getDb(), req, async (cur) => ({ rooms: L.removeOpening(cur, roomId, pid) }));
  res.json(answer(rooms));
}));

router.put('/plans/:planId/wall-opening', guard(async (req, res) => {
  const roomId = oid(req.body?.roomId), otherId = oid(req.body?.otherId);
  if (!roomId || !otherId || typeof req.body?.open !== 'boolean') return bad(res, 'roomId, otherId and open (true or false) are required');
  const { rooms } = await editPlanLayout(getDb(), req, async (cur) => ({ rooms: L.setWallOpen(cur, roomId, otherId, req.body.open) }));
  res.json(answer(rooms));
}));

router.put('/plans/:planId/room-rect', guard(async (req, res) => {
  const roomId = oid(req.body?.roomId), r = req.body?.rect;
  if (!roomId || !r) return bad(res, 'roomId and rect are required');
  const { rooms } = await editPlanLayout(getDb(), req, async (cur) => ({
    rooms: L.setRoomRect(cur, roomId, { x: finite(r.x), z: finite(r.z), w: finite(r.w), d: finite(r.d) }),
  }));
  res.json(answer(rooms));
}));

const placementsOf = (fn) => async (req, res2, next) => {
  try { await fn(req, res2); }
  catch (e) {
    if (e instanceof L.LayoutError || e instanceof PlacementError) return bad(res2, e.message, 409);
    if (e.status === 400 || e.status === 404) return bad(res2, e.message, e.status);
    next(e);
  }
};

router.put('/plans/:planId/rooms/:rid/placements', placementsOf(async (req, res) => {
  if (!Array.isArray(req.body?.placements)) return bad(res, 'placements must be an array');
  const placements = sanitizePlacements(req.body.placements);
  await editPlanLayout(getDb(), req, async (cur) => {
    const room = roomIn(cur, req.params.rid);
    assertPlacements(room, placements);
    room.placements = placements;
    return { rooms: cur };
  });
  res.json({ placements });
}));

router.post('/plans/:planId/rooms/:rid/placements', placementsOf(async (req, res) => {
  const [placement] = sanitizePlacements([{ ...req.body, _id: null }]);
  placement.onPlacementId = oid(req.body.onPlacementId);
  await editPlanLayout(getDb(), req, async (cur) => {
    const room = roomIn(cur, req.params.rid);
    assertPlacements(room, [...room.placements, placement]);
    room.placements.push(placement);
    return { rooms: cur };
  });
  res.status(201).json(placement);
}));

router.post('/plans/:planId/rooms/:rid/placements/move', placementsOf(async (req, res) => {
  await editPlanLayout(getDb(), req, async (cur) => {
    const room = roomIn(cur, req.params.rid);
    const next = applyMoves(room.placements, req.body?.moves);
    assertPlacements(room, next);
    room.placements = next;
    return { rooms: cur };
  });
  res.json({ ok: true });
}));

router.put('/plans/:planId/rooms/:rid/placements/:pid', placementsOf(async (req, res) => {
  const pid = oid(req.params.pid);
  if (!pid) return bad(res, 'Invalid id');
  const b = req.body || {}, set = poseFields(b);
  if (b.tick !== undefined) set.tick = cleanTick('', b.tick);
  if (b.brand !== undefined && b.model !== undefined) { set.brand = cleanText(b.brand); set.model = cleanText(b.model); }
  if (!Object.keys(set).length) return bad(res, 'Nothing to update');
  await editPlanLayout(getDb(), req, async (cur) => {
    const p = roomIn(cur, req.params.rid).placements.find((x) => String(x._id) === String(pid));
    if (!p) throw notFound('Placement');
    const room = roomIn(cur, req.params.rid);
    assertPlacements(room, room.placements.map((x) => (x === p ? { ...x, ...set } : x)));
    Object.assign(p, set);
    return { rooms: cur };
  });
  res.json({ ok: true });
}));

router.delete('/plans/:planId/rooms/:rid/placements/:pid', placementsOf(async (req, res) => {
  const pid = oid(req.params.pid);
  if (!pid) return bad(res, 'Invalid id');
  await editPlanLayout(getDb(), req, async (cur) => {
    const room = roomIn(cur, req.params.rid);
    const target = room.placements.find((p) => String(p._id) === String(pid));
    if (target && isOpening(target)) throw new PlacementError('Remove a door or window with its own button, so the rooms it joins stay consistent.');
    room.placements = room.placements.filter((p) => String(p._id) !== String(pid) && String(p.onPlacementId ?? '') !== String(pid));
    return { rooms: cur };
  });
  res.sendStatus(204);
}));

async function floorplanOf(db, ref, userId) {
  const household = await db.collection('households').findOne({ userId, id: String(ref ?? '') });
  if (!household) return null;
  return { household: publicHousehold(household), ...answer(await loadRooms(db, household._id)) };
}

async function planFloorplanOf(db, planId, userId, householdRef = null) {
  const plan = await db.collection('plans').findOne({ id: String(planId ?? ''), userId });
  if (!plan || !Array.isArray(plan.layout) || !plan.layout.length) return null;
  const household = await planHousehold(db, plan);
  if (!household) return null;
  if (householdRef != null && household.id !== String(householdRef)) return null;
  return planAnswer(plan, household);
}

module.exports = router;
module.exports.floorplanOf = floorplanOf;
module.exports.planFloorplanOf = planFloorplanOf;
module.exports.sanitizePlacements = sanitizePlacements;
module.exports.syncRoomsToFlatType = syncRoomsToFlatType;
