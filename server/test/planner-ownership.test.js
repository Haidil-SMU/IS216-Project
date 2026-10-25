// Exercise the actual planner handlers without connecting to or changing real accounts.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { randomUUID } = require('node:crypto');
const { ObjectId } = require('mongodb');
const auth = require('../auth');
const Planner = require('../energyplanner-model');
const mongoose = require('mongoose');

const alice = new ObjectId().toString();
const bob = new ObjectId().toString();
const profile = { name: 'Home', flatType: '4-room', bedrooms: 3, occupants: 4, budget: 150, pattern: 'Evenings', appliances: [{ type: 'Lights', room: 'Living Room', location: 'Desk', quantity: 1, hours: 6, daysPerWeek: 7, loadPercent: 100 }] };

function setup() {
  const records = { households: [], plans: [], rooms: [], catalogue_items: [] };
  const matches = (document, filter) => Object.entries(filter).every(([key, value]) => {
    if (key === '$or') return value.some(condition => matches(document, condition));
    if (value?.$in) return value.$in.includes(document[key]);
    if (value instanceof ObjectId) return document[key] instanceof ObjectId && document[key].equals(value);
    return document[key] === value;
  });
  const db = {
    collection(name) {
      const list = records[name];
      return {
        async countDocuments(filter) { return list.filter(record => matches(record, filter)).length; },
        async insertOne(document) { list.push(document); return { insertedId: new ObjectId() }; },
        async findOne(filter) { return list.find(record => matches(record, filter)) || null; },
        find(filter, options) {
          return { async toArray() {
            return list.filter(record => matches(record, filter)).map(record => {
              const copy = { ...record };
              for (const key of Object.keys(options.projection || {})) delete copy[key];
              return copy;
            });
          } };
        },
        async updateOne(filter, update) {
          const index = list.findIndex(record => matches(record, filter));
          if (index < 0) return { matchedCount: 0 };
          Object.assign(list[index], update.$set);
          return { matchedCount: 1 };
        },
        async deleteOne(filter) {
          const index = list.findIndex(record => matches(record, filter));
          if (index < 0) return { deletedCount: 0 };
          list.splice(index, 1);
          return { deletedCount: 1 };
        },
      };
    },
  };
  // Exercise the real Mongoose schemas and queries, replacing only database I/O.
  for (const [modelName, collectionName] of [['PlannerHousehold', 'households'], ['EnergyPlan', 'plans'], ['PlannerRoom', 'rooms'], ['PlannerRoomCatalogue', 'catalogue_items']]) {
    const collection = mongoose.model(modelName).collection;
    Object.assign(collection, db.collection(collectionName));
  }
  const handlers = {};
  const app = {};
  for (const method of ['get', 'post', 'put', 'delete']) {
    app[method] = (url, ...callbacks) => { handlers[method + ' ' + url] = callbacks; };
  }
  const source = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
  const start = source.indexOf('// Energy planner: households and plans');
  const end = source.indexOf('// One error handler', start);
  assert.ok(start >= 0 && end > start);
  vm.runInNewContext(source.slice(start, end), {
    app, auth, Planner, getDb: () => db, ObjectId, randomUUID, fs, path,
    __dirname: path.join(__dirname, '..'),
  });
  async function request(method, url, account, body = {}, id) {
    const req = { session: account ? { userId: account, role: 'client' } : {}, body, params: { id } };
    const response = { status: 200, data: null };
    const res = {
      status(code) { response.status = code; return res; },
      json(data) { response.data = data; return res; },
      sendStatus(code) { response.status = code; return res; },
    };
    const callbacks = handlers[method + ' ' + url];
    let authorised = false;
    callbacks[0](req, res, () => { authorised = true; });
    if (authorised) await callbacks[1](req, res);
    return response;
  }
  return { request, records };
}
function plan(householdId) {
  return { name: 'Daily plan', householdId, profile, days: 30, tariff: .32, items: [], estimate: { kwh: 0, cost: 0 } };
}

test('all planner routes require a login', async () => {
  const { request } = setup();
  for (const [method, url] of [['get','/api/planner'], ['post','/api/users'], ['put','/api/users/:id'], ['post','/api/plans'], ['put','/api/plans/:id'], ['delete','/api/plans/:id']]) {
    assert.equal((await request(method, url, null)).status, 401);
  }
});

test('households are linked to the session account, ignoring submitted ownership', async () => {
  const { request, records } = setup();
  const created = await request('post', '/api/users', alice, { ...profile, userId: bob, ownerId: bob, id: 'injected' });
  assert.equal(created.status, 201);
  assert.ok(records.households[0].userId.equals(new ObjectId(alice)));
  assert.notEqual(created.data.id, 'injected');
  assert.equal(created.data.userId, undefined);
  assert.equal(created.data.flatTypeId, '4-room');
  assert.equal((await request('get', '/api/planner', bob)).data.users.length, 0);
  assert.equal((await request('put', '/api/users/:id', bob, profile, created.data.id)).status, 404);
  assert.equal((await request('put', '/api/users/:id', alice, { ...profile, name: 'Updated' }, created.data.id)).status, 200);
});

test('plans require an existing household owned by the logged-in account', async () => {
  const { request, records } = setup();
  const household = (await request('post', '/api/users', alice, profile)).data;
  assert.equal((await request('post', '/api/plans', bob, plan(household.id))).status, 404);
  assert.equal((await request('post', '/api/plans', alice, plan('missing'))).status, 404);
  assert.equal((await request('post', '/api/plans', alice, plan({ $ne: null }))).status, 400);
  assert.equal(records.plans.length, 0);
  const saved = await request('post', '/api/plans', alice, { ...plan(household.id), userId: bob });
  assert.equal(saved.status, 201);
  assert.ok(records.plans[0].userId.equals(new ObjectId(alice)));
  assert.equal(records.plans[0].householdId, household.id);
  assert.equal((await request('get', '/api/planner', alice)).data.plans.length, 1);
  assert.equal((await request('get', '/api/planner', bob)).data.plans.length, 0);
});

test('another account cannot edit or delete a plan, or relink it to a foreign household', async () => {
  const { request, records } = setup();
  const aHome = (await request('post', '/api/users', alice, profile)).data;
  const bHome = (await request('post', '/api/users', bob, profile)).data;
  const saved = (await request('post', '/api/plans', alice, plan(aHome.id))).data;
  assert.equal((await request('put', '/api/plans/:id', bob, plan(bHome.id), saved.id)).status, 404);
  assert.equal((await request('delete', '/api/plans/:id', bob, {}, saved.id)).status, 404);
  assert.equal((await request('put', '/api/plans/:id', alice, plan(bHome.id), saved.id)).status, 404);
  assert.equal(records.plans[0].householdId, aHome.id);
  assert.equal((await request('put', '/api/plans/:id', alice, { ...plan(aHome.id), name: 'Saver' }, saved.id)).status, 200);
  assert.equal(records.plans[0].name, 'Saver');
  assert.equal((await request('delete', '/api/plans/:id', alice, {}, saved.id)).status, 204);
  assert.equal(records.plans.length, 0);
});

test('Mongoose updates preserve shared fields and Myinfo, and cannot change ownership through operators', async () => {
  const { request, records } = setup();
  const myinfo = { fields: ['address'], filledAt: '2026-10-22' };
  const created = await request('post', '/api/users', alice, { ...profile, address: 'Example address', myinfo });
  records.households[0].spatialLayout = { roomCount: 3 };
  await assert.rejects(request('put', '/api/users/:id', alice, {
    ...profile, $set: { userId: new ObjectId(bob) },
  }, created.data.id), /Invalid update/);
  const updated = await request('put', '/api/users/:id', alice, { ...profile, name: 'New name' }, created.data.id);
  assert.equal(updated.status, 200);
  assert.equal(records.households[0].name, 'New name');
  assert.equal(records.households[0].address, 'Example address');
  assert.deepEqual(records.households[0].myinfo, myinfo);
  assert.deepEqual(records.households[0].spatialLayout, { roomCount: 3 });
  assert.ok(records.households[0].userId.equals(new ObjectId(alice)));
});

test('Mongoose validates numeric household fields before writing', async () => {
  const { request, records } = setup();
  await assert.rejects(request('post', '/api/users', alice, { ...profile, occupants: 'invalid' }), { name: 'ValidationError' });
  assert.equal(records.households.length, 0);
});

test('plan names are unique per account and household, ignoring case and outer spaces', async () => {
  const { request } = setup();
  const home = (await request('post', '/api/users', alice, profile)).data;
  const other = (await request('post', '/api/users', bob, profile)).data;
  const first = (await request('post', '/api/plans', alice, plan(home.id))).data;
  assert.equal((await request('post', '/api/plans', alice, { ...plan(home.id), name: ' DAILY PLAN ' })).status, 409);
  assert.equal((await request('post', '/api/plans', alice, { ...plan(home.id), name: ' ' })).status, 400);
  assert.equal((await request('post', '/api/plans', bob, plan(other.id))).status, 201);
  assert.equal((await request('put', '/api/plans/:id', alice, plan(home.id), first.id)).status, 200);
  const second = (await request('post', '/api/plans', alice, { ...plan(home.id), name: 'Second' })).data;
  assert.equal((await request('put', '/api/plans/:id', alice, plan(home.id), second.id)).status, 409);
});


test('households do not need a manual appliance inventory to save plans', async () => {
  const { request } = setup();
  const home = (await request('post', '/api/users', alice, profile)).data;
  assert.equal((await request('post', '/api/plans', alice, plan(home.id))).status, 201);
  assert.equal((await request('post', '/api/users', alice, profile)).status, 409);
});
test('room energy references are returned only to the household owner', async () => {
  const { request, records } = setup();
  const home = (await request('post', '/api/users', alice, profile)).data;
  records.rooms.push({ householdId: records.households[0]._id, placements: [{ applianceTypeKey: 'led', tick: '3_tick' }] });
  records.rooms.push({ householdId: new ObjectId(), placements: [] });
  records.catalogue_items.push({ typeKey: 'led', name: 'LED', category: 'lights', ticks: { '3_tick': { kwhYear: 365 } } });
  const result = await request('get', '/api/planner/households/:id/rooms', alice, {}, home.id);
  assert.equal(result.data.rooms.length, 1);
  assert.equal(result.data.rooms[0].placements[0].energyInfo.ticks['3_tick'].kwhYear, 365);
  assert.equal((await request('get', '/api/planner/households/:id/rooms', bob, {}, home.id)).status, 404);
});
