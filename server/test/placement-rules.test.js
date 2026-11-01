const { test } = require('node:test');
const assert = require('node:assert/strict');
const { ObjectId } = require('mongodb');
const { checkRoomPlacements, PlacementError } = require('../layout');
const { layoutOps, bulkWriteSafely } = require('../layoutWrite');

const id = () => new ObjectId();
const item = (o = {}) => ({ _id: id(), applianceTypeKey: 'led', category: 'lighting', x: 1, z: 1, rotY: 0, wall: -1, t: 0, cu: 0, onPlacementId: null, ...o });
const door = (o = {}) => item({ applianceTypeKey: 'timber_flush_door', category: 'build', wall: 2, t: 1, x: 1, z: 3.05, ...o });
const room = (placements) => ({ name: 'Bedroom', dimension: { w: 4, d: 3, h: 2.6 }, placements });
const rejects = (r, opts) => assert.throws(() => checkRoomPlacements(r, opts), PlacementError);

test('an item outside the room, or past the end of its wall, is refused', () => {
  rejects(room([item({ x: 4.5 })]));
  rejects(room([item({ z: -1 })]));
  rejects(room([item({ wall: 0, t: 5 })]));
  checkRoomPlacements(room([item({ x: 4, z: 3 })])); // on the boundary is fine
});

test('two floor items on the same spot are refused, but a countertop item may sit on its counter', () => {
  rejects(room([item({ x: 2, z: 2 }), item({ x: 2.05, z: 2 })]));
  const counter = item({ x: 2, z: 2, applianceTypeKey: 'counter' });
  checkRoomPlacements(room([counter, item({ x: 2, z: 2, onPlacementId: counter._id })]));
});

test('a countertop link must point at another item in the same room', () => {
  rejects(room([item({ onPlacementId: id() })]));
  const a = item(); a.onPlacementId = a._id;
  rejects(room([a]));
});

test('items that have not changed are not re-checked, so old data can still be cleared or saved', () => {
  const old = item({ x: 9 }); // outside, from before the rules existed
  const previous = room([old]);
  checkRoomPlacements(room([{ ...old }]), { previous });
  rejects(room([{ ...old, x: 9.5 }]), { previous }); // moving it to another bad spot is still refused
  checkRoomPlacements(room([{ ...old, x: 2 }]), { previous }); // moving it into the room is fine
});

test('doors and windows cannot be added, moved or dropped through the generic routes', () => {
  const d = door();
  const previous = room([d]);
  rejects(room([d, door()]), { previous });                       // new door
  rejects(room([{ ...d, t: 2 }]), { previous });                  // moved along its wall
  rejects(room([]), { previous });                                // dropped (would leave its partner door dangling)
  checkRoomPlacements(room([{ ...d }, item()]), { previous });    // unchanged: fine
});

test('whole-layout saves (undo/redo) may restore an older door position, but it must still be on a wall', () => {
  const d = door();
  const previous = room([d]);
  checkRoomPlacements(room([{ ...d, t: 2 }]), { previous, openings: 'any' });
  rejects(room([{ ...d, t: 20 }]), { previous, openings: 'any' });
  rejects(room([{ ...d, wall: 7, t: 1 }]), { previous, openings: 'any' });
});

test('a layout save writes only the rooms that changed, replaces before it deletes, and ignores key order', () => {
  const hid = id();
  const same = { _id: id(), householdId: hid, name: 'A', type: 'living', order: 0, origin: { x: 0, z: 0 }, dimension: { w: 4, d: 3, h: 2.6 }, placements: [], openWalls: [] };
  const edited = { _id: id(), householdId: hid, name: 'B', type: 'bedroom', order: 1, origin: { x: 4, z: 0 }, dimension: { w: 3, d: 3, h: 2.6 }, placements: [], openWalls: [] };
  const gone = { _id: id(), householdId: hid, name: 'C', type: 'kitchen', order: 2, origin: { x: 0, z: 3 }, dimension: { w: 2, d: 2, h: 2.6 }, placements: [], openWalls: [] };
  const fresh = { ...edited, _id: id(), name: 'D' };
  const reordered = { openWalls: [], placements: [], dimension: { h: 2.6, d: 3, w: 4 }, origin: { z: 0, x: 0 }, order: 0, type: 'living', name: 'A', householdId: hid, _id: same._id };
  const ops = layoutOps([same, edited, gone], [reordered, { ...edited, dimension: { w: 3.5, d: 3, h: 2.6 } }, fresh], hid);
  assert.equal(ops.length, 3);
  assert.deepEqual(ops.map((o) => Object.keys(o)[0]), ['replaceOne', 'replaceOne', 'deleteMany']);
  assert.equal(String(ops[0].replaceOne.filter._id), String(edited._id));
  assert.deepEqual(ops[2].deleteMany.filter._id.$in.map(String), [String(gone._id)]);
  assert.equal(layoutOps([same], [reordered], hid).length, 0); // nothing changed: no write at all
});

test('bulkWriteSafely uses a transaction when it can and falls back to an ordered write when it cannot', async () => {
  const calls = [];
  const collection = { bulkWrite: async (ops, o) => { calls.push(['bulk', !!o.session]); } };
  const withTxn = { startSession: () => ({ withTransaction: async (fn) => { calls.push(['txn']); await fn(); }, endSession: async () => {} }) };
  await bulkWriteSafely(collection, [{ x: 1 }], withTxn);
  assert.deepEqual(calls, [['txn'], ['bulk', true]]);

  calls.length = 0;
  const standalone = { startSession: () => ({ withTransaction: async () => { throw Object.assign(new Error('Transaction numbers are only allowed on a replica set member or mongos'), { code: 20 }); }, endSession: async () => {} }) };
  await bulkWriteSafely(collection, [{ x: 1 }], standalone);
  assert.deepEqual(calls, [['bulk', false]]);

  const broken = { startSession: () => ({ withTransaction: async () => { throw new Error('network down'); }, endSession: async () => {} }) };
  await assert.rejects(bulkWriteSafely(collection, [{ x: 1 }], broken), /network down/);
  await bulkWriteSafely(collection, [], broken); // nothing to write: never touches the database
});
