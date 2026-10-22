// A contractor's business profile. It is the same record homeowners see as a
// "Website-Registered" card in Find Contractors, so every field on that card is required.
const express = require('express');
const { ObjectId } = require('mongodb');
const { getDb } = require('./db');
const { requireContractor } = require('./auth');

// The services homeowners can search for in Find Contractors (Contractors.vue),
// keyed by the BCA workhead code each one stands for.
const SERVICE_CODES = {
  CR06: 'Interior Design & Renovation',
  ME05: 'Electrical Works',
  ME12: 'Plumbing & Sanitary Works',
  ME01: 'Air-conditioning',
  TR07: 'Tiles & Marble Flooring',
  TR08: 'Timber & Vinyl Flooring',
  CR09: 'Painting & Redecoration',
  CR13: 'Waterproofing',
  CR17: 'Windows',
  CR18: 'Doors',
};
const SERVICES = Object.values(SERVICE_CODES);

// Corppass confirms the UEN but not the company name, so we look the UEN up in
// BCA's register of contractors on data.gov.sg (the dataset Find Contractors uses).
const DATA_GOV_URL = 'https://data.gov.sg/api/action/datastore_search';
const BCA_CONTRACTORS = 'd_dcda79be4aded5f9e769b8e23ff69b47';
const lookups = new Map(); // uen -> { at, result }

async function lookupUen(uen) {
  const cached = lookups.get(uen);
  if (cached && Date.now() - cached.at < 60 * 60 * 1000) return cached.result;

  const url = new URL(DATA_GOV_URL);
  url.searchParams.set('resource_id', BCA_CONTRACTORS);
  url.searchParams.set('filters', JSON.stringify({ uen_no: uen }));
  url.searchParams.set('limit', '100');
  const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error(`data.gov.sg returned ${response.status}`);
  const records = (await response.json()).result?.records || [];

  const result = records.length
    ? {
        companyName: String(records[0].company_name || '').trim(),
        services: [...new Set(records.map((record) => SERVICE_CODES[record.workhead]).filter(Boolean))],
      }
    : null;
  lookups.set(uen, { at: Date.now(), result });
  return result;
}

// Fields shown on the Find Contractors card; a profile missing any of them is hidden.
const CARD_FIELDS = ['companyName', 'location', 'services', 'description', 'contactNumber'];

function isComplete(profile) {
  return CARD_FIELDS.every((field) =>
    Array.isArray(profile[field]) ? profile[field].length > 0 : String(profile[field] || '').trim(),
  );
}

// Returns { profile } with clean values, or { error } with a message for the form.
function validateProfile(body = {}) {
  const companyName = String(body.companyName || '').trim();
  const location = String(body.location || '').trim();
  const description = String(body.description || '').trim();
  const contactNumber = String(body.contactNumber || '').replace(/\s+/g, '');
  const services = Array.isArray(body.services)
    ? [...new Set(body.services.filter((service) => SERVICES.includes(service)))]
    : [];

  if (companyName.length < 2 || companyName.length > 100) {
    return { error: 'Please enter your company name (2 to 100 characters).' };
  }
  if (!location || location.length > 60) {
    return { error: 'Please enter your location or service area (up to 60 characters).' };
  }
  if (services.length === 0) {
    return { error: 'Please choose at least one renovation service.' };
  }
  if (description.length < 20 || description.length > 500) {
    return { error: 'Please describe your company in 20 to 500 characters.' };
  }
  if (!/^[689]\d{7}$/.test(contactNumber)) {
    return { error: 'Please enter an 8-digit Singapore contact number.' };
  }
  return { profile: { companyName, location, services, description, contactNumber } };
}

// Profiles link to their account by userId (an ObjectId). Records written before
// the start-up migration in db.js may still hold it as text, so match either form.
function ownerFilter(userId) {
  return ObjectId.isValid(userId) ? { userId: { $in: [userId, new ObjectId(userId)] } } : { userId };
}

// The logged-in contractor's profile, or null if they have not set it up yet.
function findProfile(req) {
  return getDb().collection('contractors').findOne(ownerFilter(req.session.userId));
}

const router = express.Router();
router.use(requireContractor);

// GET: this contractor's profile (its _id links quotation requests to them).
router.get('/profile', async (req, res) => {
  const profile = await findProfile(req);
  if (!profile) return res.json({ profile: null, needsSetup: true, services: SERVICES });
  const { userId, ...rest } = profile;
  res.json({ profile: rest, services: SERVICES });
});

// GET: suggestions for the set-up form, from BCA's register for this account's UEN.
router.get('/uen-lookup', async (req, res) => {
  const user = await getDb()
    .collection('users')
    .findOne({ _id: new ObjectId(req.session.userId) }, { projection: { corppass: 1 } });
  const uen = user?.corppass?.uen;
  if (!uen) return res.status(403).json({ error: 'Please log in with Corppass first.' });

  try {
    const match = await lookupUen(uen);
    res.json(match ? { uen, found: true, ...match } : { uen, found: false });
  } catch (error) {
    console.error('UEN lookup error:', error.message);
    res.json({ uen, found: false, unavailable: true });
  }
});

// POST: first-time set-up after signing up with Corppass.
router.post('/profile', async (req, res) => {
  const { profile, error } = validateProfile(req.body);
  if (error) return res.status(400).json({ error });
  if (await findProfile(req)) {
    return res.status(409).json({ error: 'Your business profile is already set up.' });
  }

  const users = getDb().collection('users');
  const user = await users.findOne({ _id: new ObjectId(req.session.userId) });
  const uen = user?.corppass?.uen;
  if (!uen) return res.status(403).json({ error: 'Please log in with Corppass first.' });

  const now = new Date();
  const record = {
    ...profile,
    userId: new ObjectId(req.session.userId),
    uenNo: uen, // from Corppass, never from the form
    corppassVerifiedAt: user.corppass.linkedAt || now,
    createdAt: now,
    updatedAt: now,
  };
  const result = await getDb().collection('contractors').insertOne(record);
  await users.updateOne({ _id: user._id }, { $set: { name: profile.companyName } });

  const { userId, ...rest } = { ...record, _id: result.insertedId };
  res.status(201).json({ profile: rest });
});

// PUT: edit the profile (the UEN cannot be changed).
router.put('/profile', async (req, res) => {
  const { profile, error } = validateProfile(req.body);
  if (error) return res.status(400).json({ error });

  const result = await getDb()
    .collection('contractors')
    .findOneAndUpdate(
      ownerFilter(req.session.userId),
      { $set: { ...profile, updatedAt: new Date() } },
      { returnDocument: 'after', projection: { userId: 0 } },
    );
  if (!result) return res.status(404).json({ error: 'Please set up your business profile first.' });
  await getDb()
    .collection('users')
    .updateOne({ _id: new ObjectId(req.session.userId) }, { $set: { name: profile.companyName } });
  res.json({ profile: result });
});

module.exports = { router, findProfile, ownerFilter, isComplete, lookupUen, SERVICES };
