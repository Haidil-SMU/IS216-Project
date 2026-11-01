// Drives the real spatialRoutes handlers (through a recording stand-in for the express router) against an in-memory database.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const { ObjectId } = require('mongodb');

const tick = () => new Promise((r) => setTimeout(r, 0));
const same = (a, b) => String(a) === String(b);
// clone drops class instances such as ObjectId, so clone by hand.
const clone = (v) => (v instanceof ObjectId ? v : Array.isArray(v) ? v.map(clone) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, clone(x)])) : v);

function matches(doc, filter) {
  return Object.entries(filter).every(([k, v]) => {
    if (v && typeof v === 'object' && !(v instanceof ObjectId) && !v.toHexString) {
      if ('$in' in v) return v.$in.some((x) => same(x, doc[k]));
      if ('$ne' in v) return !same(v.$ne, doc[k]);
    }
    return same(doc[k], v);
  });
}

function setup({ yieldReads = false } = {}) {
  const data = { rooms: [], households: [], plans: [] };
  const stats = { bulkOps: [] };
  const col = (name) => ({
    async findOne(f) { const d = data[name].find((x) => matches(x, f)); const snap = d ? clone(d) : null; if (yieldReads) await tick(); return snap; }, // reads a snapshot, then lets other requests run
    find(f = {}) { const out = data[name].filter((x) => matches(x, f)).map((x) => clone(x)); return { sort() { return this; }, toArray: async () => out }; },
    async countDocuments(f) { return data[name].filter((x) => matches(x, f)).length; },
    async updateOne(f, u, opts = {}) {
      const d = data[name].find((x) => matches(x, f));
      if (!d) return { matchedCount: 0 };
      for (const [k, v] of Object.entries(u.$set || {})) {
        const m = k.match(/^placements\.\$\[p\]\.(.+)$/);
        if (m) { const id = opts.arrayFilters[0]['p._id']; for (const p of d.placements) if (same(p._id, id)) p[m[1]] = v; } else d[k] = clone(v);
      }
      if (u.$push) for (const [k, v] of Object.entries(u.$push)) d[k].push(v);
      if (u.$pull?.placements) d.placements = d.placements.filter((p) => !u.$pull.placements.$or.some((c) => (c._id && same(c._id, p._id)) || (c.onPlacementId && same(c.onPlacementId, p.onPlacementId))));
      return { matchedCount: 1 };
    },
    async bulkWrite(ops) {
      stats.bulkOps.push(ops);
      for (const op of ops) {
        if (op.updateOne) { const d = data[name].find((x) => matches(x, op.updateOne.filter)); Object.assign(d, clone(op.updateOne.update.$set)); }
        if (op.replaceOne) { const i = data[name].findIndex((x) => matches(x, op.replaceOne.filter)); if (i >= 0) data[name][i] = clone(op.replaceOne.replacement); else data[name].push(clone(op.replaceOne.replacement)); }
        if (op.deleteMany) data[name] = data[name].filter((x) => !matches(x, op.deleteMany.filter));
      }
    },
  });
  const db = { collection: col };
  const noTxn = () => { throw Object.assign(new Error('Transaction numbers are only allowed on a replica set member or mongos'), { code: 20 }); };

  const handlers = {}, params = {};
  const router = { use() {}, param: (n, fn) => { params[n] = fn; } };
  for (const m of ['get', 'post', 'put', 'delete']) router[m] = (path, ...fns) => { handlers[`${m} ${path}`] = fns; };
  const realLoad = Module._load;
  Module._load = function (request, ...rest) {
    if (request === 'express') return { Router: () => router };
    if (request === './db') return { getDb: () => db, getClient: () => ({ startSession: noTxn }) };
    if (request === './auth') return { requireClient: () => {} };
    return realLoad.call(this, request, ...rest);
  };
  const path = require.resolve('../spatialRoutes');
  delete require.cache[path];
  require(path);
  Module._load = realLoad;

  async function call(method, route, { params: p = {}, body = {}, query = {}, userId } = {}) {
    const req = { params: p, body, query, session: { userId: String(userId ?? owner), role: 'client' } };
    const out = { status: 200, data: null };
    const res = { status(c) { out.status = c; return res; }, json(d) { out.data = d; return res; }, sendStatus(c) { out.status = c; return res; } };
    for (const name of route.match(/:(\w+)/g).map((s) => s.slice(1))) {
      if (!params[name]) continue;
      let ok = false;
      await params[name](req, res, () => { ok = true; }, p[name]);
      if (!ok) return out;
    }
    await new Promise((resolve, reject) => {
      const fn = handlers[`${method} ${route}`].at(-1);
      Promise.resolve(fn(req, res, (e) => (e ? reject(e) : resolve()))).then(resolve, reject);
    });
    return out;
  }
  return { data, stats, call };
}

const owner = new ObjectId();
const dim = { w: 4, d: 3, h: 2.6 };
const item = (o = {}) => ({ _id: new ObjectId(), applianceTypeKey: 'led', category: 'lighting', x: 1, z: 1, rotY: 0, wall: -1, t: 0, cu: 0, onPlacementId: null, connectsTo: null, ...o });
const door = (o = {}) => item({ applianceTypeKey: 'timber_flush_door', category: 'build', wall: 2, t: 1, x: 1, z: 3.05, connectsTo: 'outside', ...o });

function seed(t, placements) {
  const household = { _id: new ObjectId(), userId: owner, id: 'home' };
  const room = { _id: new ObjectId(), householdId: household._id, name: 'Living Room', type: 'living', order: 0, origin: { x: 0, z: 0 }, dimension: dim, placements, openWalls: [] };
  t.households.push(household); t.rooms.push(room);
  return { household, room };
}
const placementsOf = (t, room) => t.rooms.find((r) => same(r._id, room._id)).placements;

test('a batch move is all or nothing', async () => {
  const t = setup();
  const a = item({ x: 1, z: 1 }), b = item({ x: 2, z: 2 });
  const { room } = seed(t.data, [a, b]);
  const p = { roomId: String(room._id) };

  const bad = await t.call('post', '/rooms/:roomId/placements/move', { params: p, body: { moves: [{ id: String(a._id), x: 1.5, z: 1 }, { id: String(b._id), x: 9, z: 2 }] } });
  assert.equal(bad.status, 409);
  assert.equal(placementsOf(t.data, room)[0].x, 1, 'the valid first move was not applied either');

  const missing = await t.call('post', '/rooms/:roomId/placements/move', { params: p, body: { moves: [{ id: String(new ObjectId()), x: 1, z: 1 }] } });
  assert.equal(missing.status, 404);

  const ok = await t.call('post', '/rooms/:roomId/placements/move', { params: p, body: { moves: [{ id: String(a._id), x: 1.5, z: 1 }, { id: String(b._id), x: 2.5, z: 2 }] } });
  assert.equal(ok.status, 200);
  assert.deepEqual(placementsOf(t.data, room).map((x) => x.x), [1.5, 2.5]);
});

test('single moves, adds and deletes follow the placement rules', async () => {
  const t = setup();
  const a = item(), d = door();
  const { room } = seed(t.data, [a, d]);
  const p = { roomId: String(room._id) };

  assert.equal((await t.call('put', '/rooms/:roomId/placements/:pid', { params: { ...p, pid: String(a._id) }, body: { x: 50, z: 1 } })).status, 409);
  assert.equal((await t.call('put', '/rooms/:roomId/placements/:pid', { params: { ...p, pid: String(a._id) }, body: { x: 2, z: 1 } })).status, 200);
  assert.equal(placementsOf(t.data, room)[0].x, 2);
  assert.equal((await t.call('put', '/rooms/:roomId/placements/:pid', { params: { ...p, pid: String(d._id) }, body: { wall: 0, t: 1 } })).status, 409, 'doors move through their own route');
  assert.equal((await t.call('put', '/rooms/:roomId/placements/:pid', { params: { ...p, pid: String(new ObjectId()) }, body: { x: 1 } })).status, 404);

  assert.equal((await t.call('post', '/rooms/:roomId/placements', { params: p, body: { applianceTypeKey: 'led', category: 'lighting', x: 20, z: 1 } })).status, 409);
  assert.equal((await t.call('post', '/rooms/:roomId/placements', { params: p, body: { applianceTypeKey: 'timber_flush_door', category: 'build', wall: 2, t: 2 } })).status, 409);
  assert.equal((await t.call('post', '/rooms/:roomId/placements', { params: p, body: { applianceTypeKey: 'led', category: 'lighting', x: 3, z: 2 } })).status, 201);

  assert.equal((await t.call('delete', '/rooms/:roomId/placements/:pid', { params: { ...p, pid: String(d._id) } })).status, 409);
  assert.equal((await t.call('delete', '/rooms/:roomId/placements/:pid', { params: { ...p, pid: String(a._id) } })).status, 204);
  assert.equal(placementsOf(t.data, room).length, 2);
});

test('clearing a room keeps its doors; dropping one is refused', async () => {
  const t = setup();
  const a = item(), d = door();
  const { room } = seed(t.data, [a, d]);
  const p = { roomId: String(room._id) };
  assert.equal((await t.call('put', '/rooms/:roomId/placements', { params: p, body: { placements: [{ ...d }] } })).status, 200);
  assert.equal(placementsOf(t.data, room).length, 1);
  assert.equal((await t.call('put', '/rooms/:roomId/placements', { params: p, body: { placements: [] } })).status, 409);
});

test('two quick edits to the same home do not overwrite each other', async () => {
  const t = setup({ yieldReads: true }); // every read lets the other request run: without the lock the second write undoes the first
  const a = item({ x: 1, z: 1 }), b = item({ x: 3, z: 2 });
  const { room } = seed(t.data, [a, b]);
  const p = { roomId: String(room._id) };
  await Promise.all([
    t.call('post', '/rooms/:roomId/placements/move', { params: p, body: { moves: [{ id: String(a._id), x: 1.5, z: 1 }] } }),
    t.call('post', '/rooms/:roomId/placements/move', { params: p, body: { moves: [{ id: String(b._id), x: 3.5, z: 2 }] } }),
  ]);
  assert.deepEqual(placementsOf(t.data, room).map((x) => x.x), [1.5, 3.5]);
});

test('saving a whole layout (undo) writes only what changed', async () => {
  const t = setup();
  const a = item();
  const { household, room } = seed(t.data, [a]);
  const body = (placements) => ({ rooms: [{ _id: String(room._id), name: room.name, type: room.type, order: 0, origin: room.origin, dimension: dim, placements, openWalls: [] }] });
  const asSent = (p) => ({ ...p, _id: String(p._id) });

  const none = await t.call('put', '/households/:id/layout', { params: { id: String(household._id) }, body: body([asSent(a)]) });
  assert.equal(none.status, 200);
  assert.equal(t.stats.bulkOps.length, 0, 'nothing changed, so nothing was written');

  const moved = await t.call('put', '/households/:id/layout', { params: { id: String(household._id) }, body: body([{ ...asSent(a), x: 2 }]) });
  assert.equal(moved.status, 200);
  assert.equal(t.stats.bulkOps.length, 1);
  assert.deepEqual(t.stats.bulkOps[0].map((o) => Object.keys(o)[0]), ['replaceOne']);
  assert.equal(placementsOf(t.data, room)[0].x, 2);

  const outside = await t.call('put', '/households/:id/layout', { params: { id: String(household._id) }, body: body([{ ...asSent(a), x: 40 }]) });
  assert.equal(outside.status, 409);
  assert.equal(placementsOf(t.data, room)[0].x, 2, 'a refused layout changes nothing');
});

test('another account cannot touch a room', async () => {
  const t = setup();
  const { room } = seed(t.data, [item()]);
  const res = await t.call('post', '/rooms/:roomId/placements/move', { params: { roomId: String(room._id) }, userId: new ObjectId(), body: { moves: [{ id: String(new ObjectId()), x: 1 }] } });
  assert.equal(res.status, 404);
});

test('plan layouts get the same batch move and rules', async () => {
  const t = setup();
  const a = item(), b = item({ x: 2, z: 2 });
  const household = { _id: new ObjectId(), userId: owner, id: 'home' };
  const room = { _id: new ObjectId(), householdId: household._id, name: 'Living Room', type: 'living', order: 0, origin: { x: 0, z: 0 }, dimension: dim, placements: [a, b], openWalls: [] };
  t.data.households.push(household);
  t.data.plans.push({ _id: new ObjectId(), id: 'plan-1', userId: owner, householdId: household._id, layout: [room] });
  const p = { planId: 'plan-1', rid: String(room._id) };
  const route = '/plans/:planId/rooms/:rid/placements/move';
  const stored = () => t.data.plans[0].layout[0].placements;

  assert.equal((await t.call('post', route, { params: p, body: { moves: [{ id: String(a._id), x: 1.5, z: 1 }, { id: String(b._id), x: -5, z: 2 }] } })).status, 409);
  assert.equal(stored()[0].x, 1);
  assert.equal((await t.call('post', route, { params: p, body: { moves: [{ id: String(a._id), x: 1.5, z: 1 }, { id: String(b._id), x: 2.5, z: 2 }] } })).status, 200);
  assert.deepEqual(stored().map((x) => x.x), [1.5, 2.5]);
});

// ---- Part 6: copy the current home into a plan (reset / backfill), no stored energyInfo ----
function homeAndPlans(t) {
  const household = { _id: new ObjectId(), userId: owner, id: 'home' };
  const a = item({ x: 1, z: 1 });
  const room = { _id: new ObjectId(), householdId: household._id, name: 'Living Room', type: 'living', order: 0, origin: { x: 0, z: 0 }, dimension: dim, placements: [a], openWalls: [] };
  t.data.households.push(household); t.data.rooms.push(room);
  return { household, room, a };
}

test('"use my current home layout" resets a plan and backfills an old plan that has none', async () => {
  const t = setup();
  const { household, room, a } = homeAndPlans(t);
  const staleRoom = { ...room, _id: new ObjectId(), placements: [{ ...a, _id: new ObjectId(), x: 3, z: 2, energyInfo: { kwhYear: 1 } }] };
  t.data.plans.push(
    { _id: new ObjectId(), id: 'with-layout', userId: owner, householdId: household._id, layout: [staleRoom] },
    { _id: new ObjectId(), id: 'old-no-layout', userId: owner, householdId: household._id },
  );
  const route = '/plans/:planRef/layout/from-home';

  for (const id of ['with-layout', 'old-no-layout']) {
    const r = await t.call('post', route, { params: { planRef: id } });
    assert.equal(r.status, 200, id);
    const plan = t.data.plans.find((p) => p.id === id);
    assert.equal(plan.layout.length, 1);
    assert.ok(same(plan.layout[0]._id, room._id), 'same rooms as the home');
    assert.equal(plan.layout[0].placements[0].x, 1);
    assert.equal(plan.layout[0].placements[0].energyInfo, undefined);
    assert.ok(plan.layoutCapturedAt && plan.layoutEditedAt);
    assert.equal(r.data.plan.id, id);
    assert.equal(r.data.rooms.length, 1);
  }
  // the plan's own routes (which refuse a plan with no layout) now work on the backfilled plan
  const moved = await t.call('post', '/plans/:planId/rooms/:rid/placements/move', { params: { planId: 'old-no-layout', rid: String(room._id) }, body: { moves: [{ id: String(a._id), x: 2, z: 1 }] } });
  assert.equal(moved.status, 200);
  assert.equal(t.data.plans.find((p) => p.id === 'old-no-layout').layout[0].placements[0].x, 2);
  assert.equal(placementsOf(t.data, room)[0].x, 1, 'the current home was not touched');
});

test('copying the home into a plan is limited to the account\'s own plans', async () => {
  const t = setup();
  const { household } = homeAndPlans(t);
  t.data.plans.push({ _id: new ObjectId(), id: 'mine', userId: owner, householdId: household._id });
  const route = '/plans/:planRef/layout/from-home';
  assert.equal((await t.call('post', route, { params: { planRef: 'mine' }, userId: new ObjectId() })).status, 404, 'someone else cannot overwrite it');
  assert.equal(t.data.plans[0].layout, undefined);
  assert.equal((await t.call('post', route, { params: { planRef: 'nope' } })).status, 404);
});

test('another account cannot read or change a plan layout, or reach a plan through the household routes', async () => {
  const t = setup();
  const household = { _id: new ObjectId(), userId: owner, id: 'home' };
  const a = item();
  const room = { _id: new ObjectId(), householdId: household._id, name: 'Living Room', type: 'living', order: 0, origin: { x: 0, z: 0 }, dimension: dim, placements: [a], openWalls: [] };
  t.data.households.push(household);
  t.data.plans.push({ _id: new ObjectId(), id: 'plan-1', userId: owner, householdId: household._id, layout: [room] });
  const stranger = new ObjectId();
  const rid = String(room._id);
  const calls = [
    ['get', '/plans/:planId/floorplan', { planId: 'plan-1' }, {}],
    ['put', '/plans/:planId/layout', { planId: 'plan-1' }, { rooms: [] }],
    ['post', '/plans/:planId/rooms/:rid/placements/move', { planId: 'plan-1', rid }, { moves: [{ id: String(a._id), x: 2, z: 1 }] }],
    ['put', '/plans/:planId/rooms/:rid/placements/:pid', { planId: 'plan-1', rid, pid: String(a._id) }, { x: 2 }],
    ['delete', '/plans/:planId/rooms/:rid/placements/:pid', { planId: 'plan-1', rid, pid: String(a._id) }, {}],
    ['post', '/plans/:planRef/layout/from-home', { planRef: 'plan-1' }, {}],
  ];
  for (const [method, route, params, body] of calls) {
    assert.equal((await t.call(method, route, { params, body, userId: stranger })).status, 404, `${method} ${route}`);
  }
  assert.equal(t.data.plans[0].layout[0].placements[0].x, 1, 'the plan was not changed');
  assert.equal(t.data.plans[0].layout.length, 1);
  // the owner is not locked out
  assert.equal((await t.call('post', '/plans/:planId/rooms/:rid/placements/move', { params: { planId: 'plan-1', rid }, body: { moves: [{ id: String(a._id), x: 2, z: 1 }] } })).status, 200);
});

// Two touching rooms side by side, joined by a door, for the wall-opening routes.
function twoRooms(t, { withPlan = false } = {}) {
  const household = { _id: new ObjectId(), userId: owner, id: 'home' };
  const mk = (name, type, order, x, w, extra = []) => ({ _id: new ObjectId(), householdId: household._id, name, type, order, origin: { x, z: 0 }, dimension: { w, d: 3, h: 2.6 }, placements: extra, openWalls: [] });
  const living = mk('Living Room', 'living', 0, 0, 4, [door({ wall: 2, t: 1, x: 1, z: 3.05, connectsTo: 'outside' })]);
  const kitchen = mk('Kitchen', 'kitchen', 1, 4, 3);
  t.households.push(household); t.rooms.push(living, kitchen);
  if (withPlan) t.plans.push({ _id: new ObjectId(), id: 'plan-1', userId: owner, householdId: household._id, layout: JSON.parse(JSON.stringify([living, kitchen])) });
  return { household, living, kitchen };
}
const storedRoom = (t, room) => t.rooms.find((r) => same(r._id, room._id));

test('opening the wall between two rooms is saved, and closing it again joins them with a door', async () => {
  const t = setup();
  const { household, living, kitchen } = twoRooms(t.data);
  const params = { id: String(household._id) };
  const body = (open) => ({ roomId: String(kitchen._id), otherId: String(living._id), open });

  const opened = await t.call('put', '/households/:id/wall-opening', { params, body: body(true) });
  assert.equal(opened.status, 200);
  assert.equal(storedRoom(t.data, kitchen).openWalls.length, 1);
  assert.equal(storedRoom(t.data, living).openWalls.length, 1);
  assert.deepEqual(opened.data.warnings, [], 'an opening counts as a connection');

  const closed = await t.call('put', '/households/:id/wall-opening', { params, body: body(false) });
  assert.equal(closed.status, 200);
  assert.equal(storedRoom(t.data, kitchen).openWalls.length, 0);
  assert.ok(storedRoom(t.data, kitchen).placements.some((p) => p.connectsTo === 'Living Room'), 'a door is back');
});

test('the wall-opening routes refuse bad requests and other accounts', async () => {
  const t = setup();
  const { household, living, kitchen } = twoRooms(t.data, { withPlan: true });
  const hp = { id: String(household._id) };
  const ok = { roomId: String(kitchen._id), otherId: String(living._id), open: true };

  assert.equal((await t.call('put', '/households/:id/wall-opening', { params: hp, body: { ...ok, open: 'yes' } })).status, 400, 'open must be true or false');
  assert.equal((await t.call('put', '/households/:id/wall-opening', { params: hp, body: { roomId: ok.roomId, open: true } })).status, 400);
  assert.equal((await t.call('put', '/households/:id/wall-opening', { params: hp, body: { ...ok, otherId: String(new ObjectId()) } })).status, 409, 'unknown room');
  assert.equal((await t.call('put', '/households/:id/wall-opening', { params: hp, body: ok, userId: new ObjectId() })).status, 404, 'not their home');
  assert.equal((await t.call('put', '/plans/:planId/wall-opening', { params: { planId: 'plan-1' }, body: ok, userId: new ObjectId() })).status, 404, 'not their plan');
  assert.equal(storedRoom(t.data, kitchen).openWalls.length, 0, 'nothing was changed');
  assert.equal(t.data.plans[0].layout[1].openWalls.length, 0);
});

test('a plan keeps its own open walls and leaves the current home alone', async () => {
  const t = setup();
  const { living, kitchen } = twoRooms(t.data, { withPlan: true });
  const res = await t.call('put', '/plans/:planId/wall-opening', { params: { planId: 'plan-1' }, body: { roomId: String(kitchen._id), otherId: String(living._id), open: true } });
  assert.equal(res.status, 200);
  assert.equal(t.data.plans[0].layout.find((r) => r.name === 'Kitchen').openWalls.length, 1);
  assert.equal(storedRoom(t.data, kitchen).openWalls.length, 0, 'the current home was not touched');
});

test('reading a plan floor plan drops a leftover energyInfo from its placements', async () => {
  const t = setup();
  const { household, living } = twoRooms(t.data);
  const lamp = item({ energyInfo: { brand: 'Old', kwhYear: 99 } });
  const room = { ...JSON.parse(JSON.stringify(living)), placements: [lamp] };
  t.data.plans.push({ _id: new ObjectId(), id: 'plan-1', userId: owner, householdId: household._id, layout: [room] });
  const res = await t.call('get', '/plans/:planId/floorplan', { params: { planId: 'plan-1' } });
  assert.equal(res.status, 200);
  assert.equal(res.data.rooms[0].placements[0].energyInfo, undefined);
  assert.equal(res.data.rooms[0].placements[0].applianceTypeKey, 'led');
});
