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

// ============================================================================
// Small helpers
// ============================================================================

// Turns text into an ObjectId. Returns null when the text is not a real id.
function oid(s) {
  if (ObjectId.isValid(s) && String(new ObjectId(s)) === String(s)) {
    return new ObjectId(s);
  }
  return null;
}

// Sends an error message as JSON.
function bad(res, msg, code) {
  if (code === undefined) {
    code = 400;
  }
  return res.status(code).json({ error: msg });
}

// Turns a value into a number. Uses d (default 0) when it is not a number.
function finite(v, d) {
  if (d === undefined) {
    d = 0;
  }
  if (Number.isFinite(Number(v))) {
    return Number(v);
  }
  return d;
}

// Used inside catch blocks: answers with the right status for the kind of error.
function sendError(e, res, next) {
  if (e instanceof L.LayoutError || e instanceof PlacementError) {
    return bad(res, e.message, 409);
  }
  if (e.status === 400 || e.status === 404) {
    return bad(res, e.message, e.status);
  }
  next(e);
}

// The request body, or an empty object when there is none.
function bodyOf(req) {
  if (req.body) {
    return req.body;
  }
  return {};
}

// ============================================================================
// Cleaning data that comes from the browser
// ============================================================================

const CATEGORIES = ['build', 'kitchen', 'cooling', 'entertainment', 'laundry', 'lighting', 'bathroom'];

// An Error that carries an HTTP status (400 or 404), handled by sendError.
function httpError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

// True when the value is null or undefined.
function isMissing(v) {
  return v === null || v === undefined;
}

// obj[name], or undefined when obj itself is null/undefined.
function fieldOf(obj, name) {
  if (isMissing(obj)) {
    return undefined;
  }
  return obj[name];
}

// A one-level copy of an object (same keys, same order).
function copyObject(obj) {
  const copy = {};
  for (const name of Object.keys(obj)) {
    copy[name] = obj[name];
  }
  return copy;
}

// A copy of a list of objects, copying each object.
function copyList(list) {
  const copy = [];
  for (const item of list) {
    copy.push(copyObject(item));
  }
  return copy;
}

// A copy of an object without one key.
function copyWithout(obj, skip) {
  const copy = {};
  for (const name of Object.keys(obj)) {
    if (name !== skip) {
      copy[name] = obj[name];
    }
  }
  return copy;
}

// A tick (energy rating) as text, or null when there is none. Doors/windows have no tick.
function cleanTick(category, tick) {
  if (category === 'build' || isMissing(tick) || tick === '' || tick === 'none') {
    return null;
  }
  return String(tick);
}

// Trimmed text of at most 120 characters, or null when empty.
function cleanText(v) {
  if (isMissing(v) || v === '') {
    return null;
  }
  const text = String(v).trim().slice(0, 120);
  if (text) {
    return text;
  }
  return null;
}

// While cleaning one list of placements, every incoming id is swapped for a real
// ObjectId. idTable remembers raw id text -> ObjectId, so that two placements
// using the same raw id (for example "sits on") get the same ObjectId.
function idFor(idTable, raw) {
  const key = String(raw);
  for (const entry of idTable) {
    if (entry.key === key) {
      return entry.id;
    }
  }
  let id = oid(key);
  if (!id) {
    id = new ObjectId();
  }
  idTable.push({ key: key, id: id });
  return id;
}

// Cleans a list of placements from the browser: checks the required fields,
// trims texts, turns numbers into real numbers and gives every placement a real ObjectId.
function sanitizePlacements(list) {
  const idTable = [];
  const out = [];

  for (const p of list) {
    let applianceTypeKey = '';
    if (!isMissing(p.applianceTypeKey)) {
      applianceTypeKey = String(p.applianceTypeKey).trim();
    }
    let category = '';
    if (!isMissing(p.category)) {
      category = String(p.category).trim();
    }
    if (!applianceTypeKey) {
      throw httpError('Each placement needs an applianceTypeKey (e.g. "refrigerator_freezer_400l")', 400);
    }
    if (!CATEGORIES.includes(category)) {
      throw httpError(`Unknown appliance category "${category}"`, 400);
    }

    const tick = cleanTick(category, p.tick);
    let brand = null;
    if (category !== 'build') {
      brand = cleanText(p.brand);
    }
    let model = null;
    if (brand) {
      model = cleanText(p.model);
    }

    let id = null;
    if (!isMissing(p._id)) {
      id = idFor(idTable, p._id);
    }
    if (id === null) {
      id = new ObjectId();
    }

    const item = {};
    item._id = id;
    item.applianceTypeKey = applianceTypeKey;
    item.category = category;
    if (typeof p.name === 'string') {
      item.name = p.name.trim().slice(0, 160);
    }
    if (typeof p.brand === 'string') {
      item.brand = p.brand.trim().slice(0, 100);
    }
    if (typeof p.model === 'string') {
      item.model = p.model.trim().slice(0, 160);
    }
    if (!isMissing(p.kwhYear) && Number.isFinite(Number(p.kwhYear)) && Number(p.kwhYear) >= 0) {
      item.kwhYear = Number(p.kwhYear);
    }
    if (tick) {
      item.tick = tick;
    }
    if (brand && model) {
      item.brand = brand;
      item.model = model;
    }
    item.x = finite(p.x);
    item.z = finite(p.z);
    item.rotY = finite(p.rotY);
    item.wall = Math.max(-1, Math.min(3, Math.trunc(finite(p.wall, -1))));
    item.t = finite(p.t);
    item.cu = finite(p.cu);
    item.onPlacementId = isMissing(p.onPlacementId) ? null : p.onPlacementId;
    item.connectsTo = isMissing(p.connectsTo) ? null : p.connectsTo;
    out.push(item);
  }

  // "Sits on" ids now point at the new ObjectIds (or null if that item is not in the list)
  for (const p of out) {
    if (isMissing(p.onPlacementId)) {
      p.onPlacementId = null;
      continue;
    }
    const key = String(p.onPlacementId);
    let found = null;
    for (const entry of idTable) {
      if (entry.key === key) {
        found = entry.id;
      }
    }
    p.onPlacementId = found;
  }
  return out;
}

// Makes sure every room has an openWalls list and a placements list.
function normaliseRooms(rooms) {
  const out = [];
  for (const r of rooms) {
    const copy = copyObject(r);
    copy.openWalls = r.openWalls || [];
    copy.placements = r.placements || [];
    out.push(copy);
  }
  return out;
}

// ============================================================================
// Reading and saving rooms
// ============================================================================

async function loadRooms(db, householdId) {
  const rooms = await db.collection('rooms').find({ householdId: householdId }).sort({ order: 1 }).toArray();
  return normaliseRooms(rooms);
}

// A number, or 0 when it is not a real number.
function finiteOr0(v) {
  if (Number.isFinite(v)) {
    return v;
  }
  return 0;
}

// The parts of a room that can change when it is edited, with bad numbers replaced by 0.
function geometryOf(r) {
  const placements = [];
  for (const old of r.placements) {
    const p = copyWithout(old, 'energyInfo');
    p.x = finiteOr0(p.x);
    p.z = finiteOr0(p.z);
    p.rotY = finiteOr0(p.rotY);
    p.t = finiteOr0(p.t);
    p.cu = finiteOr0(p.cu);
    placements.push(p);
  }
  const openWalls = [];
  for (const o of r.openWalls) {
    openWalls.push({ wall: o.wall, t0: finiteOr0(o.t0), t1: finiteOr0(o.t1), to: o.to });
  }
  return {
    origin: { x: finiteOr0(r.origin.x), z: finiteOr0(r.origin.z) },
    dimension: { w: finiteOr0(r.dimension.w), d: finiteOr0(r.dimension.d), h: finiteOr0(r.dimension.h) },
    placements: placements,
    openWalls: openWalls,
  };
}

// A copy of the room with its geometry cleaned up (see geometryOf).
function withGeometry(r) {
  const copy = copyObject(r);
  const g = geometryOf(r);
  copy.origin = g.origin;
  copy.dimension = g.dimension;
  copy.placements = g.placements;
  copy.openWalls = g.openWalls;
  return copy;
}

// Saves the changed geometry of the rooms (all in one safe write).
async function saveRooms(db, rooms) {
  const ops = [];
  for (const r of rooms) {
    ops.push({ updateOne: { filter: { _id: r._id }, update: { $set: geometryOf(r) } } });
  }
  await bulkWriteSafely(db.collection('rooms'), ops);
}

// Cleans the rooms the browser sends when it saves a whole layout.
function cleanIncomingRooms(incoming, householdId) {
  const out = [];
  for (const r of incoming) {
    const _id = oid(fieldOf(r, '_id'));
    if (!_id) {
      throw new L.LayoutError('Bad room id in the layout');
    }

    let name = '';
    if (!isMissing(r.name)) {
      name = String(r.name).trim();
    }
    let type = '';
    if (!isMissing(r.type)) {
      type = String(r.type);
    }

    let placementsIn = [];
    if (Array.isArray(r.placements)) {
      placementsIn = r.placements;
    }
    const placements = sanitizePlacements(placementsIn);

    let wallsIn = [];
    if (Array.isArray(r.openWalls)) {
      wallsIn = r.openWalls;
    }
    const openWalls = [];
    for (const o of wallsIn) {
      let to = '';
      if (!isMissing(o.to)) {
        to = String(o.to);
      }
      openWalls.push({ wall: Math.trunc(finite(o.wall, -1)), t0: finite(o.t0), t1: finite(o.t1), to: to });
    }

    out.push({
      _id: _id,
      householdId: householdId,
      name: name,
      type: type,
      order: Math.trunc(finite(r.order)),
      origin: { x: finite(fieldOf(r.origin, 'x')), z: finite(fieldOf(r.origin, 'z')) },
      dimension: {
        w: finite(fieldOf(r.dimension, 'w')),
        d: finite(fieldOf(r.dimension, 'd')),
        h: finite(fieldOf(r.dimension, 'h')),
      },
      placements: placements,
      openWalls: openWalls,
    });
  }
  return out;
}

// The standard answer for a layout.
function answer(rooms) {
  return { rooms: rooms, footprint: L.footprintOf(rooms), warnings: L.warnings(rooms) };
}

// The answer for a household's floor plan: the household plus the standard answer.
function floorplanAnswer(household, rooms) {
  const result = answer(rooms);
  return { household: publicHousehold(household), rooms: result.rooms, footprint: result.footprint, warnings: result.warnings };
}

// Finds a room in a list by its id. Returns null if there is none.
function findById(list, id) {
  for (const item of list) {
    if (String(item._id) === String(id)) {
      return item;
    }
  }
  return null;
}

// ============================================================================
// Moving placements around
// ============================================================================

// Reads the position fields (x, z, rotY, t, cu, wall) a request wants to change.
function poseFields(b) {
  const set = {};
  for (const k of ['x', 'z', 'rotY', 't', 'cu']) {
    if (b[k] !== undefined) {
      set[k] = finite(b[k]);
    }
  }
  if (b.wall !== undefined) {
    set.wall = Math.max(-1, Math.min(3, Math.trunc(finite(b.wall, -1))));
  }
  return set;
}

// Applies a list of moves ({ id, x, z, ... }) to a copy of the placements.
// Nothing is saved here, so a bad move cancels the whole batch.
function applyMoves(placements, moves) {
  if (!Array.isArray(moves) || !moves.length || moves.length > 200) {
    throw httpError('moves must be a list of 1-200 items', 400);
  }
  const next = copyList(placements);
  for (const m of moves) {
    const pid = oid(fieldOf(m, 'id'));
    let moveFields = {};
    if (m) {
      moveFields = m;
    }
    const set = poseFields(moveFields);
    if (!pid || !Object.keys(set).length) {
      throw httpError('Each move needs an id and a position', 400);
    }
    const p = findById(next, pid);
    if (!p) {
      throw httpError('Placement not found', 404);
    }
    for (const name of Object.keys(set)) {
      p[name] = set[name];
    }
  }
  return next;
}

// Checks placements against the room's rules (see layout.js). Throws if one is not allowed.
function assertPlacements(room, placements, openings) {
  if (openings === undefined) {
    openings = 'keep';
  }
  checkRoomPlacements({ name: room.name, dimension: room.dimension, placements: placements }, { previous: room, openings: openings });
}

// ============================================================================
// Creating rooms, and one-change-at-a-time locks
// ============================================================================

// Creates the starting rooms of a flat type for a household.
async function insertRooms(db, householdId, flatTypeId) {
  const rooms = generateRooms(flatTypeId).rooms;
  const docs = [];
  for (const r of rooms) {
    const doc = copyObject(r);
    doc.householdId = householdId;
    docs.push(doc);
  }
  await db.collection('rooms').insertMany(docs);
  return docs;
}

function ignoreError() {
  // does nothing: used so a failed earlier job does not stop the next one
}

// Two requests that change the same flat at the same time could overwrite each
// other. Each flat (the "key") has a queue: a new job starts only after the
// previous job for that key has finished.
const locks = {};
function withLock(key, job) {
  let previous = locks[key];
  if (!previous) {
    previous = Promise.resolve();
  }
  const run = previous.catch(ignoreError).then(job);
  const tail = run.catch(ignoreError);
  locks[key] = tail;
  tail.then(function () {
    if (locks[key] === tail) {
      delete locks[key];
    }
  });
  return run;
}

// Creates the household's rooms the first time the 3D page is opened.
function ensureRooms(db, household) {
  return withLock(String(household._id), async function () {
    const count = await db.collection('rooms').countDocuments({ householdId: household._id });
    if (count) {
      return;
    }
    if (!LAYOUTS[household.flatTypeId]) {
      throw new L.LayoutError(`No floor plan for flat type "${household.flatTypeId}". Choose a flat type in My Profile.`);
    }
    await insertRooms(db, household._id, household.flatTypeId);
  });
}

// When the user changes their flat type: rebuilds the rooms, keeping appliances
// where the room name matches. 
function syncRoomsToFlatType(db, householdId, flatTypeId) {
  return withLock(String(householdId), async function () {
    if (!LAYOUTS[flatTypeId]) {
      throw new L.LayoutError(`Unknown flat type "${flatTypeId}"`);
    }
    const old = await loadRooms(db, householdId);
    if (!old.length) {
      return { updated: false, added: [], removed: [], dropped: 0, adjusted: 0 };
    }
    const plan = reconcileRooms(old, flatTypeId, householdId);
    L.validateLayout(plan.keep.concat(plan.add));

    const removeIds = [];
    for (const r of plan.remove) {
      removeIds.push(r._id);
    }
    const ops = [];
    ops.push({ deleteMany: { filter: { householdId: householdId, _id: { $in: removeIds } } } });
    // First give the kept rooms temporary negative orders, so the rooms never clash while rewriting
    for (let i = 0; i < plan.keep.length; i++) {
      ops.push({ updateOne: { filter: { _id: plan.keep[i]._id }, update: { $set: { order: -(i + 1) } } } });
    }
    for (const r of plan.keep) {
      ops.push({ replaceOne: { filter: { _id: r._id }, replacement: r } });
    }
    for (const r of plan.add) {
      ops.push({ insertOne: { document: r } });
    }
    await bulkWriteSafely(db.collection('rooms'), ops);

    const added = [];
    for (const r of plan.add) {
      added.push(r.name);
    }
    const removed = [];
    for (const r of plan.remove) {
      removed.push(r.name);
    }
    return { updated: true, added: added, removed: removed, dropped: plan.dropped, adjusted: plan.adjusted };
  });
}

// ============================================================================
// Households
// ============================================================================

function userObjectId(req) {
  return new ObjectId(req.session.userId);
}

// Finds the household if it belongs to the logged-in user (otherwise null).
function ownHousehold(db, req, id) {
  return db.collection('households').findOne({ _id: id, userId: userObjectId(req) });
}

// Works out which household to show: the one asked for, then the one remembered
// in the session, then the user's newest one.
async function resolveHousehold(req, wanted) {
  if (wanted === undefined) {
    wanted = null;
  }
  const db = getDb();
  let household = null;
  const candidates = [wanted, oid(req.session.householdId)];
  for (const id of candidates) {
    if (id && !household) {
      household = await ownHousehold(db, req, id);
    }
  }
  if (!household) {
    household = await db.collection('households').findOne({ userId: userObjectId(req) }, { sort: { _id: -1 } });
  }
  if (household) {
    req.session.householdId = String(household._id);
  } else {
    req.session.householdId = undefined;
  }
  return household;
}

// The household without the owner's user id (safe to send to the browser).
function publicHousehold(household) {
  return copyWithout(household, 'userId');
}

// Runs a change on a household's rooms and saves it, one change at a time.
// change(rooms) must return the new list of rooms.
function changeHousehold(db, hid, change) {
  return withLock(String(hid), async function () {
    const rooms = await loadRooms(db, hid);
    const changed = change(rooms);
    await saveRooms(db, changed);
    return changed;
  });
}

// Checks :id in the URL is one of the user's households.
router.param('id', async function (req, res, next, value) {
  try {
    const id = oid(value);
    if (!id) {
      return bad(res, 'Invalid household id');
    }
    if (!(await ownHousehold(getDb(), req, id))) {
      return bad(res, 'Household not found', 404);
    }
    next();
  } catch (e) {
    next(e);
  }
});

// Checks :roomId in the URL is a room of one of the user's households.
router.param('roomId', async function (req, res, next, value) {
  try {
    const id = oid(value);
    if (!id) {
      return bad(res, 'Invalid room id');
    }
    const room = await getDb().collection('rooms').findOne({ _id: id }, { projection: { householdId: 1 } });
    if (!room || !(await ownHousehold(getDb(), req, room.householdId))) {
      return bad(res, 'Room not found', 404);
    }
    req.roomHouseholdId = room.householdId;
    next();
  } catch (e) {
    next(e);
  }
});

// ============================================================================
// Routes: catalogue and the household's floor plan
// ============================================================================

router.get('/catalogue', async function (req, res) {
  const items = await getDb().collection('catalogue_items').find({}, { projection: { _id: 0 } }).sort({ category: 1, order: 1 }).toArray();
  res.json(items);
});

router.get('/current', async function (req, res) {
  const db = getDb();
  const household = await resolveHousehold(req, oid(req.query.household));
  if (!household) {
    return res.status(404).json({ code: 'NO_HOUSEHOLD', error: 'Set up your household in My Profile first, then come back here.' });
  }
  try {
    await ensureRooms(db, household);
  } catch (e) {
    if (e instanceof L.LayoutError) {
      return bad(res, e.message, 409);
    }
    throw e;
  }
  res.json(floorplanAnswer(household, await loadRooms(db, household._id)));
});

router.get('/households/:id/floorplan', async function (req, res) {
  const id = oid(req.params.id);
  const db = getDb();
  const household = await ownHousehold(db, req, id);
  req.session.householdId = String(id);
  res.json(floorplanAnswer(household, await loadRooms(db, id)));
});

// ============================================================================
// Routes: doors, windows, wall openings and room sizes (household layout)
// ============================================================================

router.post('/households/:id/openings', async function (req, res, next) {
  try {
    const body = bodyOf(req);
    const hid = oid(req.params.id);
    const roomId = oid(body.roomId);
    const key = isMissing(body.applianceTypeKey) ? '' : String(body.applianceTypeKey);
    if (!hid || !roomId || !key) {
      return bad(res, 'householdId, roomId and applianceTypeKey are required');
    }
    const rooms = await changeHousehold(getDb(), hid, function (current) {
      return L.addOpening(current, roomId, key, null, null, body.spots);
    });
    res.status(201).json(answer(rooms));
  } catch (e) {
    sendError(e, res, next);
  }
});

router.put('/households/:id/openings/:pid', async function (req, res, next) {
  try {
    const body = bodyOf(req);
    const hid = oid(req.params.id);
    const pid = oid(req.params.pid);
    const roomId = oid(body.roomId);
    if (!hid || !pid || !roomId) {
      return bad(res, 'householdId, roomId and the door/window id are required');
    }
    const rooms = await changeHousehold(getDb(), hid, function (current) {
      return L.moveOpening(current, roomId, pid, Number(body.wall), Number(body.t));
    });
    res.json(answer(rooms));
  } catch (e) {
    sendError(e, res, next);
  }
});

router.delete('/households/:id/openings/:pid', async function (req, res, next) {
  try {
    const hid = oid(req.params.id);
    const pid = oid(req.params.pid);
    const roomId = oid(req.query.roomId);
    if (!hid || !pid || !roomId) {
      return bad(res, 'householdId, roomId and the door/window id are required');
    }
    const rooms = await changeHousehold(getDb(), hid, function (current) {
      return L.removeOpening(current, roomId, pid);
    });
    res.json(answer(rooms));
  } catch (e) {
    sendError(e, res, next);
  }
});

router.put('/households/:id/wall-opening', async function (req, res, next) {
  try {
    const body = bodyOf(req);
    const hid = oid(req.params.id);
    const roomId = oid(body.roomId);
    const otherId = oid(body.otherId);
    if (!hid || !roomId || !otherId || typeof body.open !== 'boolean') {
      return bad(res, 'householdId, roomId, otherId and open (true or false) are required');
    }
    const rooms = await changeHousehold(getDb(), hid, function (current) {
      return L.setWallOpen(current, roomId, otherId, body.open);
    });
    res.json(answer(rooms));
  } catch (e) {
    sendError(e, res, next);
  }
});

router.put('/households/:id/room-rect', async function (req, res, next) {
  try {
    const body = bodyOf(req);
    const hid = oid(req.params.id);
    const roomId = oid(body.roomId);
    const r = body.rect;
    if (!hid || !roomId || !r) {
      return bad(res, 'householdId, roomId and rect are required');
    }
    const rooms = await changeHousehold(getDb(), hid, function (current) {
      return L.setRoomRect(current, roomId, { x: finite(r.x), z: finite(r.z), w: finite(r.w), d: finite(r.d) });
    });
    res.json(answer(rooms));
  } catch (e) {
    sendError(e, res, next);
  }
});

// Saves a whole layout sent by the browser (also used by undo).
router.put('/households/:id/layout', async function (req, res, next) {
  try {
    const hid = oid(req.params.id);
    const incoming = bodyOf(req).rooms;
    if (!hid || !Array.isArray(incoming) || incoming.length > 40) {
      return bad(res, 'householdId and rooms are required');
    }
    const rooms = cleanIncomingRooms(incoming, hid);
    L.validateLayout(rooms);

    const db = getDb();
    const ids = [];
    for (const r of rooms) {
      ids.push(r._id);
    }
    const foreign = await db.collection('rooms').countDocuments({ _id: { $in: ids }, householdId: { $ne: hid } });
    if (foreign) {
      return bad(res, 'Those rooms belong to another flat', 403);
    }

    await withLock(String(hid), async function () {
      const stored = await db.collection('rooms').find({ householdId: hid }).toArray();
      for (const r of rooms) {
        // undo may restore an older door position, so doors/windows may change here
        checkRoomPlacements(r, { previous: findById(stored, r._id), openings: 'any' });
      }
      await bulkWriteSafely(db.collection('rooms'), layoutOps(stored, rooms, hid));
    });
    res.json(answer(rooms));
  } catch (e) {
    sendError(e, res, next);
  }
});

// ============================================================================
// Routes: placements inside one room (household layout)
// ============================================================================

// The lock key for a room request: its household.
function roomLock(req) {
  return String(req.roomHouseholdId);
}

function findRoom(id) {
  return getDb().collection('rooms').findOne({ _id: id });
}

// Replaces all placements of a room.
router.put('/rooms/:roomId/placements', async function (req, res, next) {
  try {
    const id = oid(req.params.roomId);
    if (!id) {
      return bad(res, 'Invalid room id');
    }
    if (!Array.isArray(bodyOf(req).placements)) {
      return bad(res, 'placements must be an array');
    }
    const placements = sanitizePlacements(req.body.placements);
    const done = await withLock(roomLock(req), async function () {
      const room = await findRoom(id);
      if (!room) {
        return false;
      }
      assertPlacements(room, placements);
      await getDb().collection('rooms').updateOne({ _id: id }, { $set: { placements: placements } });
      return true;
    });
    if (done) {
      res.json({ placements: placements });
    } else {
      bad(res, 'Room not found', 404);
    }
  } catch (e) {
    sendError(e, res, next);
  }
});

// Adds one placement to a room.
router.post('/rooms/:roomId/placements', async function (req, res, next) {
  try {
    const id = oid(req.params.roomId);
    if (!id) {
      return bad(res, 'Invalid room id');
    }
    const input = copyObject(bodyOf(req));
    input._id = null;
    const placement = sanitizePlacements([input])[0];
    placement.onPlacementId = oid(req.body.onPlacementId);
    const done = await withLock(roomLock(req), async function () {
      const room = await findRoom(id);
      if (!room) {
        return false;
      }
      const after = [];
      for (const p of room.placements || []) {
        after.push(p);
      }
      after.push(placement);
      assertPlacements(room, after);
      await getDb().collection('rooms').updateOne({ _id: id }, { $push: { placements: placement } });
      return true;
    });
    if (done) {
      res.status(201).json(placement);
    } else {
      bad(res, 'Room not found', 404);
    }
  } catch (e) {
    sendError(e, res, next);
  }
});

// Moves several placements at once: all of them move, or none.
router.post('/rooms/:roomId/placements/move', async function (req, res, next) {
  try {
    const id = oid(req.params.roomId);
    if (!id) {
      return bad(res, 'Invalid room id');
    }
    const done = await withLock(roomLock(req), async function () {
      const room = await findRoom(id);
      if (!room) {
        return false;
      }
      const moved = applyMoves(room.placements || [], bodyOf(req).moves);
      assertPlacements(room, moved);
      await getDb().collection('rooms').updateOne({ _id: id }, { $set: { placements: moved } });
      return true;
    });
    if (done) {
      res.json({ ok: true });
    } else {
      bad(res, 'Room not found', 404);
    }
  } catch (e) {
    sendError(e, res, next);
  }
});

// Changes one placement (its position, tick, brand and model).
router.put('/rooms/:roomId/placements/:pid', async function (req, res, next) {
  try {
    const roomId = oid(req.params.roomId);
    const pid = oid(req.params.pid);
    if (!roomId || !pid) {
      return bad(res, 'Invalid id');
    }
    const b = bodyOf(req);
    const set = poseFields(b);
    const extra = {};
    if (b.tick !== undefined) {
      extra.tick = cleanTick('', b.tick);
    }
    if (b.brand !== undefined && b.model !== undefined) {
      extra.brand = cleanText(b.brand);
      extra.model = cleanText(b.model);
    }
    if (!Object.keys(set).length && !Object.keys(extra).length) {
      return bad(res, 'Nothing to update');
    }

    const done = await withLock(roomLock(req), async function () {
      const room = await findRoom(roomId);
      if (!room) {
        return false;
      }
      if (!findById(room.placements || [], pid)) {
        throw httpError('Placement not found', 404);
      }
      // Check the placements as they would be after the change
      const after = [];
      for (const p of room.placements) {
        if (String(p._id) === String(pid)) {
          const changed = copyObject(p);
          for (const name of Object.keys(set)) {
            changed[name] = set[name];
          }
          after.push(changed);
        } else {
          after.push(p);
        }
      }
      assertPlacements(room, after);

      // $[p] means "the placement whose _id matches the arrayFilters entry below"
      const changes = {};
      for (const name of Object.keys(set)) {
        changes[`placements.$[p].${name}`] = set[name];
      }
      for (const name of Object.keys(extra)) {
        changes[`placements.$[p].${name}`] = extra[name];
      }
      await getDb().collection('rooms').updateOne({ _id: roomId }, { $set: changes }, { arrayFilters: [{ 'p._id': pid }] });
      return true;
    });
    if (done) {
      res.json({ ok: true });
    } else {
      bad(res, 'Room not found', 404);
    }
  } catch (e) {
    sendError(e, res, next);
  }
});

// Deletes a placement and anything sitting on it. Doors/windows have their own delete route.
router.delete('/rooms/:roomId/placements/:pid', async function (req, res, next) {
  try {
    const roomId = oid(req.params.roomId);
    const pid = oid(req.params.pid);
    if (!roomId || !pid) {
      return bad(res, 'Invalid id');
    }
    const done = await withLock(roomLock(req), async function () {
      const room = await findRoom(roomId);
      if (!room) {
        return false;
      }
      const target = findById(room.placements || [], pid);
      if (target && isOpening(target)) {
        throw new PlacementError('Remove a door or window with its own button, so the rooms it joins stay consistent.');
      }
      await getDb().collection('rooms').updateOne({ _id: roomId }, { $pull: { placements: { $or: [{ _id: pid }, { onPlacementId: pid }] } } });
      return true;
    });
    if (done) {
      res.sendStatus(204);
    } else {
      bad(res, 'Room not found', 404);
    }
  } catch (e) {
    sendError(e, res, next);
  }
});

// ============================================================================
// Plans: each saved plan keeps its own copy of the layout
// ============================================================================

function planHousehold(db, plan) {
  return db.collection('households').findOne({ _id: plan.householdId, userId: plan.userId });
}

// Lists the user's plans for a household (without the layout itself).
router.get('/households/:id/plans', async function (req, res) {
  const db = getDb();
  const household = await ownHousehold(db, req, oid(req.params.id));
  const plans = await db.collection('plans').find(
    { userId: userObjectId(req), householdId: household._id },
    { projection: { _id: 0, id: 1, name: 1, layoutCapturedAt: 1, layoutEditedAt: 1, layout: 1 } },
  ).sort({ name: 1 }).toArray();

  const list = [];
  for (const plan of plans) {
    const item = copyWithout(plan, 'layout');
    item.hasLayout = Array.isArray(plan.layout) && plan.layout.length > 0;
    list.push(item);
  }
  res.json(list);
});

// Checks :planId in the URL is the user's plan and that it has a saved layout.
router.param('planId', async function (req, res, next, value) {
  try {
    const plan = await getDb().collection('plans').findOne({ id: String(value), userId: userObjectId(req) });
    if (!plan) {
      return bad(res, 'Plan not found', 404);
    }
    if (!Array.isArray(plan.layout) || !plan.layout.length) {
      return bad(res, 'This plan has no saved 3D layout.', 409);
    }
    req.planId = plan.id;
    req.planHouseholdId = plan.householdId;
    next();
  } catch (e) {
    next(e);
  }
});

function notFound(what) {
  return httpError(`${what} not found`, 404);
}

// A room of a plan's layout without the computed energyInfo on its placements.
function withoutEnergyInfo(r) {
  const copy = copyObject(r);
  const placements = [];
  for (const p of r.placements) {
    placements.push(copyWithout(p, 'energyInfo'));
  }
  copy.placements = placements;
  return copy;
}

// The rooms of a plan's saved layout, cleaned and in order.
function planRooms(layout) {
  const rooms = [];
  for (const r of normaliseRooms(layout)) {
    rooms.push(withoutEnergyInfo(r));
  }
  rooms.sort(function (a, b) {
    return finite(a.order) - finite(b.order);
  });
  return rooms;
}

// Runs a change on a plan's layout and saves it, one change at a time.
// change(rooms) must return { rooms } (the new rooms) and may also return a result.
function editPlanLayout(db, req, change) {
  const filter = { id: req.planId, userId: userObjectId(req) };
  return withLock(`plan:${req.planId}`, async function () {
    const plan = await db.collection('plans').findOne(filter);
    if (!plan) {
      throw notFound('Plan');
    }
    const changed = await change(planRooms(plan.layout || []));
    const rooms = changed.rooms;

    const layout = [];
    for (const r of rooms) {
      layout.push(withGeometry(r));
    }
    await db.collection('plans').updateOne(filter, { $set: { layout: layout, layoutEditedAt: new Date().toISOString() } });
    return { rooms: rooms, result: changed.result };
  });
}

// Finds a room in the list or throws a 404.
function roomIn(rooms, id) {
  const room = findById(rooms, id);
  if (!room) {
    throw notFound('Room');
  }
  return room;
}

// The answer for a plan: household, plan details and its layout.
function planAnswer(plan, household) {
  const result = answer(planRooms(plan.layout));
  return {
    household: publicHousehold(household),
    plan: { id: plan.id, name: plan.name, layoutCapturedAt: plan.layoutCapturedAt, layoutEditedAt: plan.layoutEditedAt },
    rooms: result.rooms,
    footprint: result.footprint,
    warnings: result.warnings,
  };
}

// ============================================================================
// Routes: a plan's layout
// ============================================================================

router.get('/plans/:planId/floorplan', async function (req, res) {
  const db = getDb();
  const plan = await db.collection('plans').findOne({ id: req.planId, userId: userObjectId(req) });
  const household = await planHousehold(db, plan);
  if (!household) {
    return bad(res, 'Household not found', 404);
  }
  req.session.householdId = String(household._id);
  res.json(planAnswer(plan, household));
});

// Saves a whole layout into a plan.
router.put('/plans/:planId/layout', async function (req, res, next) {
  try {
    const incoming = bodyOf(req).rooms;
    if (!Array.isArray(incoming) || incoming.length > 40) {
      return bad(res, 'rooms are required');
    }
    let householdId = req.planHouseholdId;
    if (isMissing(householdId)) {
      householdId = null;
    }
    const rooms = cleanIncomingRooms(incoming, householdId);
    L.validateLayout(rooms);
    const done = await editPlanLayout(getDb(), req, async function (current) {
      for (const r of rooms) {
        checkRoomPlacements(r, { previous: findById(current, r._id), openings: 'any' });
      }
      return { rooms: rooms };
    });
    res.json(answer(done.rooms));
  } catch (e) {
    sendError(e, res, next);
  }
});

// Copies the household's current 3D layout into a plan.
router.post('/plans/:planRef/layout/from-home', async function (req, res, next) {
  try {
    const db = getDb();
    const userId = userObjectId(req);
    const planRef = String(req.params.planRef);
    const plan = await db.collection('plans').findOne({ id: planRef, userId: userId });
    if (!plan) {
      return bad(res, 'Plan not found', 404);
    }
    const household = await planHousehold(db, plan);
    if (!household) {
      return bad(res, 'Household not found', 404);
    }
    await ensureRooms(db, household);
    const home = await loadRooms(db, household._id);
    if (!home.length) {
      return bad(res, 'Your current home has no 3D layout to copy.', 409);
    }
    L.validateLayout(home);

    const layout = [];
    for (const r of home) {
      const room = withGeometry(r);
      room.householdId = household._id;
      layout.push(room);
    }
    const now = new Date().toISOString();
    const filter = { id: planRef, userId: userId };
    const saved = await withLock(`plan:${planRef}`, async function () {
      const result = await db.collection('plans').updateOne(filter, { $set: { layout: layout, layoutCapturedAt: now, layoutEditedAt: now } });
      return result.matchedCount !== 0;
    });
    if (!saved) {
      return bad(res, 'Plan not found', 404);
    }

    const updatedPlan = copyObject(plan);
    updatedPlan.layout = layout;
    updatedPlan.layoutCapturedAt = now;
    updatedPlan.layoutEditedAt = now;
    res.json(planAnswer(updatedPlan, household));
  } catch (e) {
    sendError(e, res, next);
  }
});

router.post('/plans/:planId/openings', async function (req, res, next) {
  try {
    const body = bodyOf(req);
    const roomId = oid(body.roomId);
    const key = isMissing(body.applianceTypeKey) ? '' : String(body.applianceTypeKey);
    if (!roomId || !key) {
      return bad(res, 'roomId and applianceTypeKey are required');
    }
    const edited = await editPlanLayout(getDb(), req, async function (current) {
      return { rooms: L.addOpening(current, roomId, key, null, null, body.spots) };
    });
    res.status(201).json(answer(edited.rooms));
  } catch (e) {
    sendError(e, res, next);
  }
});

router.put('/plans/:planId/openings/:pid', async function (req, res, next) {
  try {
    const body = bodyOf(req);
    const pid = oid(req.params.pid);
    const roomId = oid(body.roomId);
    if (!pid || !roomId) {
      return bad(res, 'roomId and the door/window id are required');
    }
    const edited = await editPlanLayout(getDb(), req, async function (current) {
      return { rooms: L.moveOpening(current, roomId, pid, Number(body.wall), Number(body.t)) };
    });
    res.json(answer(edited.rooms));
  } catch (e) {
    sendError(e, res, next);
  }
});

router.delete('/plans/:planId/openings/:pid', async function (req, res, next) {
  try {
    const pid = oid(req.params.pid);
    const roomId = oid(req.query.roomId);
    if (!pid || !roomId) {
      return bad(res, 'roomId and the door/window id are required');
    }
    const edited = await editPlanLayout(getDb(), req, async function (current) {
      return { rooms: L.removeOpening(current, roomId, pid) };
    });
    res.json(answer(edited.rooms));
  } catch (e) {
    sendError(e, res, next);
  }
});

router.put('/plans/:planId/wall-opening', async function (req, res, next) {
  try {
    const body = bodyOf(req);
    const roomId = oid(body.roomId);
    const otherId = oid(body.otherId);
    if (!roomId || !otherId || typeof body.open !== 'boolean') {
      return bad(res, 'roomId, otherId and open (true or false) are required');
    }
    const edited = await editPlanLayout(getDb(), req, async function (current) {
      return { rooms: L.setWallOpen(current, roomId, otherId, body.open) };
    });
    res.json(answer(edited.rooms));
  } catch (e) {
    sendError(e, res, next);
  }
});

router.put('/plans/:planId/room-rect', async function (req, res, next) {
  try {
    const body = bodyOf(req);
    const roomId = oid(body.roomId);
    const r = body.rect;
    if (!roomId || !r) {
      return bad(res, 'roomId and rect are required');
    }
    const edited = await editPlanLayout(getDb(), req, async function (current) {
      return { rooms: L.setRoomRect(current, roomId, { x: finite(r.x), z: finite(r.z), w: finite(r.w), d: finite(r.d) }) };
    });
    res.json(answer(edited.rooms));
  } catch (e) {
    sendError(e, res, next);
  }
});

// ============================================================================
// Routes: placements inside one room of a plan
// ============================================================================

// Replaces all placements of a room in the plan.
router.put('/plans/:planId/rooms/:rid/placements', async function (req, res, next) {
  try {
    if (!Array.isArray(bodyOf(req).placements)) {
      return bad(res, 'placements must be an array');
    }
    const placements = sanitizePlacements(req.body.placements);
    await editPlanLayout(getDb(), req, async function (current) {
      const room = roomIn(current, req.params.rid);
      assertPlacements(room, placements);
      room.placements = placements;
      return { rooms: current };
    });
    res.json({ placements: placements });
  } catch (e) {
    sendError(e, res, next);
  }
});

// Adds one placement to a room in the plan.
router.post('/plans/:planId/rooms/:rid/placements', async function (req, res, next) {
  try {
    const input = copyObject(bodyOf(req));
    input._id = null;
    const placement = sanitizePlacements([input])[0];
    placement.onPlacementId = oid(req.body.onPlacementId);
    await editPlanLayout(getDb(), req, async function (current) {
      const room = roomIn(current, req.params.rid);
      const after = [];
      for (const p of room.placements) {
        after.push(p);
      }
      after.push(placement);
      assertPlacements(room, after);
      room.placements.push(placement);
      return { rooms: current };
    });
    res.status(201).json(placement);
  } catch (e) {
    sendError(e, res, next);
  }
});

// Moves several placements at once in a plan: all of them move, or none.
router.post('/plans/:planId/rooms/:rid/placements/move', async function (req, res, next) {
  try {
    await editPlanLayout(getDb(), req, async function (current) {
      const room = roomIn(current, req.params.rid);
      const moved = applyMoves(room.placements, bodyOf(req).moves);
      assertPlacements(room, moved);
      room.placements = moved;
      return { rooms: current };
    });
    res.json({ ok: true });
  } catch (e) {
    sendError(e, res, next);
  }
});

// Changes one placement of a plan (position, tick, brand and model).
router.put('/plans/:planId/rooms/:rid/placements/:pid', async function (req, res, next) {
  try {
    const pid = oid(req.params.pid);
    if (!pid) {
      return bad(res, 'Invalid id');
    }
    const b = bodyOf(req);
    const set = poseFields(b);
    if (b.tick !== undefined) {
      set.tick = cleanTick('', b.tick);
    }
    if (b.brand !== undefined && b.model !== undefined) {
      set.brand = cleanText(b.brand);
      set.model = cleanText(b.model);
    }
    if (!Object.keys(set).length) {
      return bad(res, 'Nothing to update');
    }
    await editPlanLayout(getDb(), req, async function (current) {
      const room = roomIn(current, req.params.rid);
      const p = findById(room.placements, pid);
      if (!p) {
        throw notFound('Placement');
      }
      // Check the placements as they would be after the change
      const after = [];
      for (const x of room.placements) {
        if (x === p) {
          const changed = copyObject(x);
          for (const name of Object.keys(set)) {
            changed[name] = set[name];
          }
          after.push(changed);
        } else {
          after.push(x);
        }
      }
      assertPlacements(room, after);
      for (const name of Object.keys(set)) {
        p[name] = set[name];
      }
      return { rooms: current };
    });
    res.json({ ok: true });
  } catch (e) {
    sendError(e, res, next);
  }
});

// Deletes a placement of a plan, and anything sitting on it.
router.delete('/plans/:planId/rooms/:rid/placements/:pid', async function (req, res, next) {
  try {
    const pid = oid(req.params.pid);
    if (!pid) {
      return bad(res, 'Invalid id');
    }
    await editPlanLayout(getDb(), req, async function (current) {
      const room = roomIn(current, req.params.rid);
      const target = findById(room.placements, pid);
      if (target && isOpening(target)) {
        throw new PlacementError('Remove a door or window with its own button, so the rooms it joins stay consistent.');
      }
      const kept = [];
      for (const p of room.placements) {
        let sitsOn = '';
        if (!isMissing(p.onPlacementId)) {
          sitsOn = String(p.onPlacementId);
        }
        if (String(p._id) !== String(pid) && sitsOn !== String(pid)) {
          kept.push(p);
        }
      }
      room.placements = kept;
      return { rooms: current };
    });
    res.sendStatus(204);
  } catch (e) {
    sendError(e, res, next);
  }
});

// ============================================================================
// Functions used by other files (see the exports below)
// ============================================================================

// The floor plan of the household with this id (the home layout), or null.
async function floorplanOf(db, ref, userId) {
  let idText = '';
  if (!isMissing(ref)) {
    idText = String(ref);
  }
  const household = await db.collection('households').findOne({ userId: userId, id: idText });
  if (!household) {
    return null;
  }
  return floorplanAnswer(household, await loadRooms(db, household._id));
}

// The floor plan saved inside a plan, or null if there is none.
// householdRef (optional) must match the plan's household.
async function planFloorplanOf(db, planId, userId, householdRef) {
  if (householdRef === undefined) {
    householdRef = null;
  }
  let planIdText = '';
  if (!isMissing(planId)) {
    planIdText = String(planId);
  }
  const plan = await db.collection('plans').findOne({ id: planIdText, userId: userId });
  if (!plan || !Array.isArray(plan.layout) || !plan.layout.length) {
    return null;
  }
  const household = await planHousehold(db, plan);
  if (!household) {
    return null;
  }
  if (householdRef !== null && household.id !== String(householdRef)) {
    return null;
  }
  return planAnswer(plan, household);
}

module.exports = router;
module.exports.floorplanOf = floorplanOf;
module.exports.planFloorplanOf = planFloorplanOf;
module.exports.sanitizePlacements = sanitizePlacements;
module.exports.syncRoomsToFlatType = syncRoomsToFlatType;
