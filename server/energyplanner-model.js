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
  appliances: { type: Array, default: [] },
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
  estimate: { type: Object, required: true },
}, { versionKey: false });

const Household = mongoose.model('PlannerHousehold', householdSchema, 'households');
const Plan = mongoose.model('EnergyPlan', planSchema, 'plans');

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
exports.retrieveHouseholds = function (userId) {
  return Household.find({ userId: userId }, { _id: 0, userId: 0 });
};

exports.findHousehold = function (userId, id) {
  return Household.findOne({ userId: userId, id: id });
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
