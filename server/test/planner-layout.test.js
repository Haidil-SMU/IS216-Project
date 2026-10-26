const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { ObjectId } = require('mongodb');
function plannerWith(db) {
  const Planner = {};
  vm.runInNewContext(fs.readFileSync(require.resolve('../energyplanner-model'), 'utf8'), {
    exports: Planner,
    require: name => name === './db' ? { getDb: () => db } : require(name),
  });
  return Planner;
}

test('3D placement saves retain the brand, model, annual rating and location', () => {
  const source = fs.readFileSync(require.resolve('../spatialRoutes'), 'utf8');
  const context = { ObjectId, oid: value => ObjectId.isValid(value) ? new ObjectId(value) : null, finite: (value, fallback=0) => Number.isFinite(Number(value)) ? Number(value) : fallback };
  vm.createContext(context);
  vm.runInContext(source.slice(source.indexOf('const CATEGORIES'), source.indexOf('async function loadRooms')), context);
  const result = context.sanitizePlacements([{ applianceTypeKey: 'led', category: 'lighting', name:'Lamp', brand:'Recorded brand', model:'L1', kwhYear:365, x:1, z:2 }])[0];
  assert.equal(result.brand, 'Recorded brand');
  assert.equal(result.model, 'L1');
  assert.equal(result.kwhYear, 365);
  assert.equal(result.x, 1);
});
test('room information uses MongoDB metadata and preserves unmatched saved placements', async () => {
  const key = 'unlisted-aircon';
  const docs = [{ name:'Bedroom', origin:{x:0,z:0}, dimension:{w:4,d:3}, placements:[{ applianceTypeKey:'db-light', category:'lighting' },{ applianceTypeKey:key, category:'cooling', kwhYear:1400 }] }];
  const Planner = plannerWith({ collection: name => ({ find: () => ({ toArray: async () =>
    name === 'rooms' ? docs : [{typeKey:'db-light', name:'Light', brand:'DB brand', model:'L1', kwhYear:100, averagePrice:25, products:[{brand:'Brand A',model:'A1',priceSgd:100,kwhYear:730}]}]
  }) }) });
    const result = await Planner.retrieveRooms({_id:new ObjectId(),id:'home'});
    assert.equal(result[0].placements[0].energyInfo.brand, 'DB brand');
    assert.equal(result[0].placements[0].energyInfo.model, 'L1');
    assert.equal(result[0].placements[0].energyInfo.products[0].priceSgd, 100);
    assert.equal(result[0].placements[0].energyInfo.products[0].kwhYear, 730);
    assert.equal(result[0].placements[0].energyInfo.averagePrice, 25);
    assert.equal(result[0].placements[1].energyInfo, undefined);
    assert.equal(result[0].placements[1].kwhYear, 1400);
    assert.equal(result[0].dimension.w, 4);
});
test('driver insert keeps the complete layout snapshot and reviewed brand details', async () => {
  let saved;
  const Planner = plannerWith({ collection: () => ({ insertOne: async doc => { saved = doc; return { insertedId: new ObjectId() }; } }) });
  await Planner.addPlan({ id:'p',userId:new ObjectId(),householdId:'h',name:'Plan',profile:{},estimate:{kwh:30,cost:9.6},layoutCapturedAt:'2026-10-25T01:00:00.000Z',layout:[{name:'Bedroom',dimension:{w:4,d:3},placements:[{brand:'Recorded',x:1,z:2}]}],items:[{name:'Light',brand:'Reviewed',model:'L1',annualKwh:365}] });
  assert.equal(saved.layout[0].placements[0].brand,'Recorded');
  assert.equal(saved.items[0].brand,'Reviewed');
  assert.equal(saved.layoutCapturedAt,'2026-10-25T01:00:00.000Z');
});
