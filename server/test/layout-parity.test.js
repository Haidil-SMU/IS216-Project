// The client previews a drag with refitPlacements() and sharedWall() (client/src/stores/placement.js); the server
// applies the same rules with refit() and touching() (layout.js). If they drift the preview and the saved result
// disagree. This test runs both on the same random rooms and fails when they differ.
// It reads the client source straight from the repo (the client folder next to this server folder, or CLIENT_DIR).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { refit, touching } = require('../layout');

const candidates = [process.env.CLIENT_DIR, path.join(__dirname, '..', '..', 'client'), path.join(__dirname, '..', '..', '..', 'client')].filter(Boolean);
const file = candidates.map((d) => path.join(d, 'src', 'stores', 'placement.js')).find((f) => fs.existsSync(f));

function loadClient() {
  const source = fs.readFileSync(file, 'utf8')
    .replace(/^import .*$/gm, '')                 // placement.js only needs these two for functions we do not call here
    .replace(/^export (const|function|let) /gm, '$1 ');
  const context = { out: {}, sinkSpan: () => null, resolveSpec: () => ({}) };
  vm.createContext(context);
  vm.runInContext(`${source}\nout.refitPlacements = refitPlacements; out.sharedWall = sharedWall;`, context);
  return context.out;
}

const rnd = ((seed) => () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; })(11);
const snap = (v) => Math.round(v * 10) / 10;
const room = (x, z, w, d, placements = []) => ({ _id: String(Math.floor(rnd() * 1e9)), origin: { x, z }, dimension: { w, d, h: 2.6 }, placements, openWalls: [] });

function randomRoom() {
  const w = 2.5 + rnd() * 4, d = 2.5 + rnd() * 3;
  const placements = [];
  for (let i = 0; i < 1 + Math.floor(rnd() * 6); i++) {
    const wall = rnd() < 0.5 ? Math.floor(rnd() * 4) : -1;
    const base = { _id: `p${i}`, x: rnd() * w, z: rnd() * d, rotY: rnd() * 6, wall, t: wall >= 0 ? rnd() * (wall % 2 ? d : w) : 0, cu: 0, onPlacementId: null };
    if (placements.length && rnd() < 0.25) base.onPlacementId = placements[0]._id;
    placements.push(base);
  }
  return room(snap(rnd() * 4), snap(rnd() * 4), w, d, placements);
}

test('the client refit and the server refit give the same placements', { skip: !file && 'client folder not found (set CLIENT_DIR)' }, () => {
  const client = loadClient();
  for (let n = 0; n < 300; n++) {
    const old = randomRoom();
    const moved = { ...old, origin: { x: old.origin.x + (rnd() - 0.5), z: old.origin.z + (rnd() - 0.5) }, dimension: { ...old.dimension, w: Math.max(1.5, old.dimension.w + (rnd() - 0.5) * 2), d: Math.max(1.5, old.dimension.d + (rnd() - 0.5) * 2) } };
    for (const carry of [true, false]) {
      assert.deepEqual(JSON.parse(JSON.stringify(client.refitPlacements(old, moved, carry))), JSON.parse(JSON.stringify(refit(old, moved, carry))), `room ${n}, carry=${carry}`);
    }
  }
});

test('the client sharedWall and the server touching agree on which wall two rooms share', { skip: !file && 'client folder not found (set CLIENT_DIR)' }, () => {
  const client = loadClient();
  let shared = 0;
  for (let n = 0; n < 500; n++) {
    const a = room(0, 0, 3 + snap(rnd() * 3), 3 + snap(rnd() * 2));
    // a neighbour on a random side, sometimes just touching at a corner or not at all
    const side = Math.floor(rnd() * 4), w = 2 + snap(rnd() * 3), d = 2 + snap(rnd() * 3), slide = snap((rnd() - 0.5) * 6), gap = rnd() < 0.2 ? 0.5 : 0;
    const A = a.dimension;
    const b = [room(slide, -d - gap, w, d), room(A.w + gap, slide, w, d), room(slide, A.d + gap, w, d), room(-w - gap, slide, w, d)][side];
    const server = touching(a, b), mine = client.sharedWall(a, b);
    assert.equal(!!mine, !!server, `rooms ${n}`);
    if (!server) continue;
    shared++;
    assert.equal(mine.wall, server.wallA, `wall, rooms ${n}`);
    assert.ok(Math.abs(mine.length - (server.hi - server.lo)) < 1e-9, `length, rooms ${n}`);
  }
  assert.ok(shared > 100, 'the random rooms actually share walls');
});
