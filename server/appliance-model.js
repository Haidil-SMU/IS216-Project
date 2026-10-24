const mongoose = require('mongoose');

// Shared catalogue stored in MongoDB's appliances collection.
const applianceSchema = new mongoose.Schema({
  id: Number,
  name: String,
  type: String,
  brand: String,
  model: String,
  room: String,
  location: String,
  power: Number,
  purchasePrice: Number,
  currency: String,
  efficiency: String,
  sourceUrl: String,
  priceCheckedOn: String,
  powerBasis: String,
  defaultHours: Number,
}, { versionKey: false, strict: false });
const Appliance = mongoose.model('PlannerAppliance', applianceSchema, 'appliances');

exports.retrieveAppliances = function () {
  return Appliance.find({}, { _id: 0 }).lean();
};

