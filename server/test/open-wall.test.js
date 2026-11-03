// Opening and closing the wall between two rooms (an open-plan kitchen and living room).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { ObjectId } = require('mongodb');
const { generateRooms } = require('../floorplan');
const L = require('../layout');

const flat = (type = '3-room') => generateRooms(type).rooms.map((r) => ({ ...r, _id: new ObjectId(), openWalls: r.openWalls || [] }));
const named = (rooms, name) => rooms.find((r) => r.name === name);
const links = (r) => r.placements.filter((p) => p.applianceTypeKey === 'timber_flush_door' && p.connectsTo && p.connectsTo !== 'outside').map((p) => p.connectsTo);

test('opening a shared wall replaces the door with a gap on both sides', () => {
  const rooms = flat();
  const k = named(rooms, 'Kitchen'), l = named(rooms, 'Living Room');
  assert.deepEqual(links(k), ['Living Room']);

  const out = L.setWallOpen(rooms, k._id, l._id, true);
  const k2 = named(out, 'Kitchen'), l2 = named(out, 'Living Room');
  assert.deepEqual(links(k2), [], 'the door between them is gone');
  assert.equal(k2.openWalls.length, 1);
  assert.equal(k2.openWalls[0].to, 'Living Room');
  assert.equal(l2.openWalls.filter((o) => o.to === 'Kitchen').length, 1);
  assert.ok(!L.warnings(out).some((w) => /Kitchen/.test(w)), 'an opening counts as a connection');
  assert.equal(rooms.find((r) => r === k).openWalls.length, 0, 'the input rooms are not changed');
});

test('closing the wall again puts a door back so the rooms stay joined', () => {
  const rooms = flat();
  const k = named(rooms, 'Kitchen'), l = named(rooms, 'Living Room');
  const open = L.setWallOpen(rooms, k._id, l._id, true);
  const shut = L.setWallOpen(open, k._id, l._id, false);
  assert.equal(named(shut, 'Kitchen').openWalls.length, 0);
  assert.equal(named(shut, 'Living Room').openWalls.length, 0);
  assert.deepEqual(links(named(shut, 'Kitchen')), ['Living Room']);
  assert.deepEqual(links(named(shut, 'Living Room')).filter((n) => n === 'Kitchen'), ['Kitchen']);
});

test('opening twice or closing a closed wall changes nothing', () => {
  const rooms = flat();
  const k = named(rooms, 'Kitchen'), l = named(rooms, 'Living Room');
  const once = L.setWallOpen(rooms, k._id, l._id, true);
  assert.deepEqual(L.setWallOpen(once, k._id, l._id, true), once);
  const closed = L.setWallOpen(rooms, k._id, l._id, false);
  assert.deepEqual(links(named(closed, 'Kitchen')), ['Living Room']);
  assert.equal(named(closed, 'Kitchen').placements.length, named(rooms, 'Kitchen').placements.length);
});

test('rooms that do not touch cannot be opened up, and unknown rooms are refused', () => {
  const rooms = flat('4-room');
  const far = named(rooms, 'Bedroom 1'), kitchen = named(rooms, 'Kitchen');
  assert.throws(() => L.setWallOpen(rooms, far._id, kitchen._id, true), /don't share a wall/);
  assert.throws(() => L.setWallOpen(rooms, new ObjectId(), kitchen._id, true), /Room not found/);
  assert.throws(() => L.setWallOpen(rooms, kitchen._id, kitchen._id, true), /Room not found/);
});

test('an open wall survives resizing a room and is dropped when the rooms stop touching', () => {
  const rooms = flat();
  const k = named(rooms, 'Kitchen'), l = named(rooms, 'Living Room');
  const open = L.setWallOpen(rooms, k._id, l._id, true);
  const kitchen = named(open, 'Kitchen');

  const away = L.setRoomRect(open, kitchen._id, { x: kitchen.origin.x - 2.4, z: kitchen.origin.z, w: kitchen.dimension.w, d: kitchen.dimension.d });
  assert.equal(named(away, 'Kitchen').openWalls.length, 0, 'no longer touching, so no gap');
  assert.ok(named(away, 'Living Room').openWalls.every((o) => o.to !== 'Kitchen'));

  const shorter = L.setRoomRect(open, kitchen._id, { x: kitchen.origin.x, z: kitchen.origin.z, w: kitchen.dimension.w, d: kitchen.dimension.d - 0.4 });
  assert.equal(named(shorter, 'Kitchen').openWalls.filter((o) => o.to === 'Living Room').length, 1, 'still touching, so still open');
});

test('a door cannot be dropped onto a wall that has been opened up', () => {
  const rooms = flat();
  const k = named(rooms, 'Kitchen'), l = named(rooms, 'Living Room');
  const open = L.setWallOpen(rooms, k._id, l._id, true);
  const kitchen = named(open, 'Kitchen');
  const gap = kitchen.openWalls[0];
  assert.throws(() => L.addOpening(open, kitchen._id, 'timber_flush_door', gap.wall, (gap.t0 + gap.t1) / 2, [[gap.wall, (gap.t0 + gap.t1) / 2]]), /already a door or window|no clear spot|share/i);
});
