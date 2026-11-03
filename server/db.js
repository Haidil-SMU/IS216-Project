// One shared MongoDB connection for the whole server.
const { MongoClient, ObjectId } = require('mongodb');

const DB_NAME = 'ecohome';
let client;
let db;

// Older records linked to their owner with an "ownerId" field and/or held userId as
// text. Bring them to the current shape: userId = the owner's users._id as an ObjectId.
// Only records still in the old shape match, so this is safe to run on every start.
async function migrateUserIds(db) {
  const toObjectId = (field) => ({
    $convert: { input: field, to: 'objectId', onError: field, onNull: field },
  });
  const changed = {};

  // Plans: the old "userId" held the household's id, which moves to householdId.
  changed.plans = (
    await db
      .collection('plans')
      .updateMany({ ownerId: { $exists: true } }, [
        { $set: { householdId: '$userId', userId: toObjectId('$ownerId') } },
        { $unset: 'ownerId' },
      ])
  ).modifiedCount;
  changed.households = (
    await db
      .collection('households')
      .updateMany({ ownerId: { $exists: true } }, [
        { $set: { userId: toObjectId('$ownerId') } },
        { $unset: 'ownerId' },
      ])
  ).modifiedCount;
  for (const name of ['quotationRequests', 'contractors']) {
    changed[name] = (
      await db
        .collection(name)
        .updateMany({ userId: { $type: 'string' } }, [{ $set: { userId: toObjectId('$userId') } }])
    ).modifiedCount;
  }

  // The old ownerId indexes are no longer used.
  for (const name of ['households', 'plans']) {
    const indexes = await db
      .collection(name)
      .indexes()
      .catch(() => []);
    if (indexes.some((index) => index.name === 'ownerId_1_id_1')) {
      await db.collection(name).dropIndex('ownerId_1_id_1');
    }
  }

  const total = Object.values(changed).reduce((sum, count) => sum + count, 0);
  if (total) console.log('Migrated records to userId (ObjectId):', changed);
}

async function migrateHouseholdIds(db, { dryRun = false } = {}) {
  const done = { householdsGivenId: 0, plans: 0, planLayouts: 0, rooms: 0, planNameClashes: 0, unmatchedPlans: 0 };

  // 1. Every household needs a public id. Keep what the browser already sees (the _id as text).
  const households = await db.collection('households').find({}).toArray();
  for (const household of households) {
    if (typeof household.id === 'string' && household.id) continue;
    done.householdsGivenId++;
    household.id = String(household._id);
    if (!dryRun) await db.collection('households').updateOne({ _id: household._id }, { $set: { id: household.id } });
  }
  // Plans find their household inside one account; rooms have no owner, so their ids must be unique anyway.
  const byOwner = new Map();
  const byRef = new Map();
  for (const household of households) {
    for (const ref of [household.id, String(household._id)]) {
      byOwner.set(`${household.userId}:${ref}`, household);
      byRef.set(ref, household);
    }
  }

  // 2. Plans: householdId and every room of the saved layout.
  const plans = await db.collection('plans').find({}, { projection: { userId: 1, householdId: 1, name: 1, nameKey: 1, 'layout.householdId': 1 } }).toArray();
  for (const plan of plans) {
    const household = byOwner.get(`${plan.userId}:${plan.householdId}`);
    if (!household) {
      if (!(plan.householdId instanceof ObjectId)) done.unmatchedPlans++;
      continue;
    }
    const layoutOutOfDate = Array.isArray(plan.layout) && plan.layout.every((room) => room && typeof room === 'object') && plan.layout.some((room) => !(room?.householdId instanceof ObjectId) || !room.householdId.equals(household._id));
    const idOutOfDate = !(plan.householdId instanceof ObjectId) || !plan.householdId.equals(household._id);
    if (!idOutOfDate && !layoutOutOfDate) continue;
    if (idOutOfDate) done.plans++;
    if (layoutOutOfDate) done.planLayouts++;
    if (dryRun) continue;
    const set = { householdId: household._id };
    if (layoutOutOfDate && plan.layout.length) set['layout.$[].householdId'] = household._id;
    try {
      await db.collection('plans').updateOne({ _id: plan._id }, { $set: set });
    } catch (error) {
      if (error.code !== 11000) throw error;
      // Two plans with the same name were saved under different forms of the same household.
      // Keep both, and make the second name different instead of losing a plan.
      const name = `${plan.name} (2)`;
      await db.collection('plans').updateOne({ _id: plan._id }, { $set: { ...set, name, nameKey: name.trim().toLowerCase() } });
      done.planNameClashes++;
    }
  }

  // 3. Rooms that were saved with a text householdId.
  const rooms = await db.collection('rooms').find({ householdId: { $type: 'string' } }, { projection: { householdId: 1 } }).toArray();
  for (const room of rooms) {
    const household = byRef.get(room.householdId);
    if (!household) continue;
    done.rooms++;
    if (!dryRun) await db.collection('rooms').updateOne({ _id: room._id }, { $set: { householdId: household._id } });
  }

  const total = Object.values(done).reduce((sum, count) => sum + count, 0);
  if (total) console.log(dryRun ? 'Household ids that would change:' : 'Moved household references to the household _id:', done);
  return done;
}

async function connectDb() {
  if (!process.env.DB) {
    throw new Error('Missing DB connection string in server/.env');
  }
  client = new MongoClient(process.env.DB);
  await client.connect();
  db = client.db(DB_NAME);

  // Emails and Singpass accounts must be unique, but only when they exist
  // (Singpass-only accounts have no email). Replace an older non-partial
  // email index, which would allow only one account without an email.
  const users = db.collection('users');
  // A brand-new database has no users collection (and so no indexes) yet.
  const existingIndexes = await users.indexes().catch((error) => {
    if (error.codeName === 'NamespaceNotFound') return [];
    throw error;
  });
  const oldEmailIndex = existingIndexes.find((index) => index.name === 'email_1');
  if (oldEmailIndex && !oldEmailIndex.partialFilterExpression) {
    await users.dropIndex('email_1');
    console.log('Replaced users.email_1 with a partial unique index.');
  }
  await users.createIndex(
    { email: 1 },
    { name: 'email_1', unique: true, partialFilterExpression: { email: { $type: 'string' } } },
  );
  await db.collection('users').createIndex(
    { 'singpass.uuid': 1 },
    { unique: true, partialFilterExpression: { 'singpass.uuid': { $type: 'string' } } },
  );
  // One contractor account per company UEN (Corppass).
  await users.createIndex(
    { 'corppass.uen': 1 },
    { unique: true, partialFilterExpression: { 'corppass.uen': { $type: 'string' } } },
  );
  await migrateUserIds(db);
  await migrateHouseholdIds(db);
  await db.collection('households').createIndex({ userId: 1, id: 1 });
  await db.collection('plans').createIndex(
    { userId: 1, householdId: 1, nameKey: 1 },
    { unique: true, partialFilterExpression: { nameKey: { $type: 'string' } } },
  );
  // One business profile per contractor account, and per UEN.
  await db.collection('contractors').createIndex({ userId: 1 }, { unique: true });
  await db.collection('contractors').createIndex(
    { uenNo: 1 },
    { unique: true, partialFilterExpression: { uenNo: { $type: 'string' } } },
  );
  await db.collection('quotationRequests').createIndex({ contractorId: 1, createdAt: -1 });
  await db.collection('quotationRequests').createIndex({ userId: 1 });
  await db.collection('portfolioProjects').createIndex({ contractorId: 1, createdAt: -1 });
  await db.collection('projectPhotos').createIndex({ projectId: 1, createdAt: 1 });

  await tidyPlacementTicks(db);

  console.log('MongoDB connected successfully!');
  return db;
}

// Older placements stored tick: 'none' for appliances without a rating and a tick on doors, windows
// and countertops. Neither means anything, so remove the field.
async function tidyPlacementTicks(db) {
  try {
    const rooms = db.collection('rooms');
    const builds = await rooms.updateMany(
      { 'placements.category': 'build', 'placements.tick': { $exists: true } },
      { $unset: { 'placements.$[p].tick': '' } },
      { arrayFilters: [{ 'p.category': 'build', 'p.tick': { $exists: true } }] },
    );
    const empty = await rooms.updateMany(
      { 'placements.tick': { $in: [null, '', 'none'] } },
      { $unset: { 'placements.$[p].tick': '' } },
      { arrayFilters: [{ 'p.tick': { $in: [null, '', 'none'] } }] },
    );
    const n = builds.modifiedCount + empty.modifiedCount;
    if (n) console.log(`Removed meaningless placement ticks from ${n} rooms.`);
  } catch (error) {
    console.log('Could not tidy placement ticks:', error.message);
  }
}

function getDb() {
  if (!db) throw new Error('MongoDB is not connected yet');
  return db;
}

function getClient() {
  if (!client) throw new Error('MongoDB is not connected yet');
  return client;
}

module.exports = { connectDb, getDb, getClient, migrateHouseholdIds, DB_NAME };
