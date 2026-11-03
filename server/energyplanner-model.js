const { ObjectId } = require('mongodb');
const { getDb } = require('./db');

// userId always comes from the server's login session, never from the form.
exports.retrieveHouseholds = async function (userId) {
  const households = await getDb().collection('households').find(
    { userId: new ObjectId(userId) },
    { projection: { userId: 0, appliances: 0 } },
  ).toArray();
  for (const household of households) {
    household.id = household.id || String(household._id);
    household.flatType = household.flatType || household.flatTypeId;
    delete household._id;
  }
  return households;
};

// The browser only knows a household by its public `id`. Everything the server stores uses the
// household's `_id` (an ObjectId), so look it up here once and use `household._id` from then on.
exports.findHousehold = function (userId, id) {
  if (typeof id !== 'string' || !id) return Promise.resolve(null);
  return getDb().collection('households').findOne({ userId: new ObjectId(userId), id });
};

exports.retrieveRooms = async function (household) {
  const rooms = await getDb().collection('rooms').find({ householdId: household._id }).toArray();
  return withEnergyInfo(rooms);
};

// A saved plan's own layout, with the same energy details as the household's live rooms.
// Returns null when the account has no such plan (or it has no layout).
exports.retrievePlanRooms = async function (userId, planId) {
  const plan = await getDb().collection('plans').findOne({ id: String(planId), userId: new ObjectId(userId) });
  if (!plan || !Array.isArray(plan.layout) || !plan.layout.length) return null;
  return withEnergyInfo(plan.layout);
};

// Adds the catalogue's energy details to every placement of these rooms.
async function withEnergyInfo(rooms) {
  const typeKeys = [];
  for (const room of rooms) {
    for (const placement of room.placements || []) {
      if (typeof placement.applianceTypeKey === 'string' && !typeKeys.includes(placement.applianceTypeKey)) typeKeys.push(placement.applianceTypeKey);
    }
  }
  const catalogue = await getDb().collection('catalogue_items').find(
    { typeKey: { $in: typeKeys } }, { projection: { _id: 0 } },
  ).toArray();
  for (const room of rooms) {
    for (const placement of room.placements || []) {
      let details = null;
      for (const item of catalogue) {
        if (item.typeKey === placement.applianceTypeKey) {
          details = item;
          break;
        }
      }
      delete placement.energyInfo; // never trust a stored copy: it is only ever what the catalogue says right now
      if (details) {
        placement.energyInfo = {
          name: details.name, category: placement.category || details.category,
          ticks: details.ticks, kwhYear: details.kwhYear,
          brand: details.brand, model: details.model,
          products: Array.isArray(details.products) ? details.products : [],
          averagePrice: details.averagePriceSgd ?? details.averagePrice ?? details.avgPrice ?? details.priceSgd ?? details.price ?? null,
        };
      }
    }
  }
  return rooms;
};

// Plans are stored against the household's _id; the browser gets the household's public id back.
exports.retrievePlans = async function (userId) {
  const owner = new ObjectId(userId);
  const plans = await getDb().collection('plans').find(
    { userId: owner }, { projection: { _id: 0, userId: 0 } },
  ).toArray();
  const households = await getDb().collection('households').find({ userId: owner }).toArray();
  const publicId = new Map(households.map((household) => [String(household._id), household.id]));
  return plans.map((plan) => ({ ...plan, householdId: publicId.get(String(plan.householdId)) ?? String(plan.householdId) }));
};

// Plan names are unique within one household (older plans may have no nameKey, so compare the names).
exports.planNameTaken = async function (userId, householdId, name, exceptId = '') {
  const wanted = String(name).trim().toLowerCase();
  const plans = await getDb().collection('plans').find(
    { userId: new ObjectId(userId), householdId }, { projection: { layout: 0 } },
  ).toArray();
  return plans.some((plan) => plan.id !== exceptId && String(plan.name ?? '').trim().toLowerCase() === wanted);
};

// The layout snapshot keeps where things are, not the catalogue's energy details: those go stale and bloat the
// plan, and retrievePlanRooms adds fresh ones whenever the layout is read.
const withoutEnergyInfo = (layout) => (Array.isArray(layout)
  ? layout.map((room) => ({ ...room, placements: (room.placements || []).map(({ energyInfo, ...placement }) => placement) }))
  : layout);

exports.addPlan = function (plan) {
  const layout = withoutEnergyInfo(plan.layout);
  return getDb().collection('plans').insertOne({ ...plan, ...(layout === undefined ? {} : { layout }), userId: new ObjectId(plan.userId) });
};

exports.editPlan = function (userId, id, plan) {
  return getDb().collection('plans').updateOne(
    { userId: new ObjectId(userId), id }, { $set: plan },
  );
};

exports.deletePlan = function (userId, id) {
  return getDb().collection('plans').deleteOne({ userId: new ObjectId(userId), id });
};
