const mongoose = require('mongoose');
const { DB_NAME } = require('./db');

const householdSchema = new mongoose.Schema({
  id: { type: String, required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, required: true },
  name: { type: String, required: true },
  flatType: String,
  flatTypeId: String,
  occupants: Number,
  bedrooms: Number,
  budget: Number,
  pattern: String,
  address: String,
  myinfo: Object,
}, { versionKey: false });

const planSchema = new mongoose.Schema({
  id: { type: String, required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, required: true },
  householdId: { type: String, required: true },
  name: { type: String, required: true },
  nameKey: String,
  days: Number,
  tariff: Number,
  // These objects contain the snapshot and breakdown calculated by the Vue page.
  profile: { type: Object, required: true },
  items: { type: Array, default: [] },
  layout: { type: Array, default: [] },
  layoutCapturedAt: String,
  estimate: { type: Object, required: true },
}, { versionKey: false });

const Household = mongoose.model('PlannerHousehold', householdSchema, 'households');
const Plan = mongoose.model('EnergyPlan', planSchema, 'plans');
const Room = mongoose.model('PlannerRoom', new mongoose.Schema({ householdId: mongoose.Schema.Types.Mixed }, { strict: false }), 'rooms');
const CatalogueItem = mongoose.model('PlannerRoomCatalogue', new mongoose.Schema({ typeKey: String }, { strict: false }), 'catalogue_items');

exports.connectDB = async function () {
  // Use the same database as login. db.js already manages collection indexes.
  await mongoose.connect(process.env.DB, {
    dbName: DB_NAME,
    autoIndex: false,
    autoCreate: false,
  });
  // Only new/updated plans have nameKey; old saved records remain unchanged.
  await Plan.collection.createIndex(
    { userId: 1, householdId: 1, nameKey: 1 },
    { unique: true, partialFilterExpression: { nameKey: { $type: 'string' } } },
  );
};

// userId always comes from the server's login session, never from the form.
exports.retrieveHouseholds = async function (userId) {
  const households = await Household.find({ userId }, { userId: 0, appliances: 0 }).lean();
  for (const household of households) {
    household.id = household.id || String(household._id);
    household.flatType = household.flatType || household.flatTypeId;
    delete household._id;
  }
  return households;
};

exports.findHousehold = function (userId, id) {
  const filter = { userId, id };
  if (mongoose.isObjectIdOrHexString(id)) {
    delete filter.id;
    filter.$or = [{ id }, { _id: new mongoose.Types.ObjectId(id) }];
  }
  return Household.findOne(filter);
};

exports.retrieveRooms = async function (household) {
  const links = [{ householdId: household._id }, { householdId: String(household._id) }];
  if (household.id) links.push({ householdId: household.id });
  const rooms = await Room.find({ $or: links }).lean();
  const typeKeys = [];
  for (const room of rooms) {
    for (const placement of room.placements || []) {
      if (typeof placement.applianceTypeKey === 'string' && !typeKeys.includes(placement.applianceTypeKey)) typeKeys.push(placement.applianceTypeKey);
    }
  }
  const catalogue = await CatalogueItem.find({ typeKey: { $in: typeKeys } }, { _id: 0 }).lean();
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

exports.addHousehold = function (household) {
  return Household.create(household);
};

exports.editHousehold = function (userId, id, household) {
  return Household.updateOne({ userId: userId, id: id }, { $set: household }, { runValidators: true });
};

exports.retrievePlans = function (userId) {
  return Plan.find({ userId: userId }, { _id: 0, userId: 0 });
};

exports.addPlan = function (plan) {
  return Plan.create(plan);
};

exports.editPlan = function (userId, id, plan) {
  return Plan.updateOne({ userId: userId, id: id }, { $set: plan }, { runValidators: true });
};

exports.deletePlan = function (userId, id) {
  return Plan.deleteOne({ userId: userId, id: id });
};
