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

exports.findHousehold = function (userId, id) {
  const filter = { userId: new ObjectId(userId), id };
  if (ObjectId.isValid(id)) {
    delete filter.id;
    filter.$or = [{ id }, { _id: new ObjectId(id) }];
  }
  return getDb().collection('households').findOne(filter);
};

exports.retrieveRooms = async function (household) {
  const links = [{ householdId: household._id }, { householdId: String(household._id) }];
  if (household.id) links.push({ householdId: household.id });
  const rooms = await getDb().collection('rooms').find({ $or: links }).toArray();
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

exports.retrievePlans = function (userId) {
  return getDb().collection('plans').find(
    { userId: new ObjectId(userId) }, { projection: { _id: 0, userId: 0 } },
  ).toArray();
};

exports.addPlan = function (plan) {
  return getDb().collection('plans').insertOne({ ...plan, userId: new ObjectId(plan.userId) });
};

exports.editPlan = function (userId, id, plan) {
  return getDb().collection('plans').updateOne(
    { userId: new ObjectId(userId), id }, { $set: plan },
  );
};

exports.deletePlan = function (userId, id) {
  return getDb().collection('plans').deleteOne({ userId: new ObjectId(userId), id });
};
