require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const session = require('express-session');
const { MongoStore } = require('connect-mongo');
const { ObjectId } = require('mongodb');
const { connectDb, getClient, getDb, DB_NAME } = require('./db');
const auth = require('./auth');
const Planner = require('./energyplanner-model');
const singpass = require('./singpass');
const myinfo = require('./myinfo');
const corppass = require('./corppass');
const contractor = require('./contractor');
const contractors = require('./contractors');
const profile = require('./profile');
const portfolio = require('./portfolio');
const spatialRoutes = require('./spatialRoutes');
const { loadLayouts } = require('./floorplan');

const PORT = process.env.PORT || 8000;
const SCENARIO_FILE = path.join(__dirname, 'gameScenarios.json');
const APPLIANCE_FILE = path.join(__dirname, 'appliances.json');

function loadGameData() {
    try {
        const scenarioRaw = fs.readFileSync(SCENARIO_FILE, 'utf8');
        const applianceRaw = fs.readFileSync(APPLIANCE_FILE, 'utf8');

        const scenarioData = JSON.parse(scenarioRaw);
        const applianceData = JSON.parse(applianceRaw);

        return {
            scenarios: Array.isArray(scenarioData.scenarios)
                ? scenarioData.scenarios
                : [],

            appliances: Array.isArray(applianceData.appliances)
                ? applianceData.appliances
                : []
        };

    } catch(error) {
        console.log(error);

        return {
            scenarios: [],
            appliances: []
        }
    }
}


const app = express();
const dbReady = connectDb().then(async (db) => {
  // Prevent simultaneous active requests between the same
  // homeowner and contractor.
  await db.collection('quotationRequests').createIndex(
    {
      userId: 1,
      contractorId: 1
    },
    {
      name: 'one_active_quotation_per_homeowner_contractor',
      unique: true,
      partialFilterExpression: {
        status: {
          $in: ['pending', 'quoted', 'accepted']
        }
      }
    }
  );

  await loadLayouts(db);
  return db;
});
const isProduction = process.env.NODE_ENV === 'production';

if (!process.env.SESSION_SECRET && isProduction) {
    throw new Error('SESSION_SECRET must be set in production');
}
if (!process.env.SESSION_SECRET) {
    console.warn('SESSION_SECRET is not set; using an insecure development secret.');
}
if (isProduction) app.set('trust proxy', 1);

app.use(express.json());

// Sessions are stored in MongoDB so users stay logged in across restarts.
app.use(session({
    name: 'ecohome.sid',
    secret: process.env.SESSION_SECRET || 'ecohome-dev-only-secret',
    resave: false,
    saveUninitialized: false,
    rolling: true,
    store: MongoStore.create({
        clientPromise: dbReady.then(getClient),
        dbName: DB_NAME,
        collectionName: 'sessions',
        ttl: auth.THIRTY_DAYS / 1000,
    }),
    cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: isProduction,
    },
}));

// Handle CORS headers and OPTIONS preflight requests for all /api endpoints
app.use('/api', (req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader(
        'Access-Control-Allow-Methods',
        'GET, POST, PUT, PATCH, DELETE, OPTIONS'
    );
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

// ============================================================
// Authentication: email + password and Singpass/Myinfo (homeowners),
// Corppass (contractors)
// ============================================================

app.use('/api/auth/singpass', singpass.router);
app.use('/api/auth', auth.router);
app.use('/api/myinfo', myinfo.router);
app.use('/api/auth/corppass', corppass.router);

// Retrieve the logged-in contractor's latest saved price list.


app.use('/api/contractor/projects', portfolio.ownRouter);
app.use('/api/contractor', contractor.router);
app.use('/api/profile', profile.router);

app.use('/api', contractors({
  ownContractorProfile,
  resolveAttachedPlanId
}));// ============================================================
// GET
// Retrieve courses
// ============================================================

app.get('/api', (req, res) => {
    res.status(200).json(loadGameData());
});

// Contractor routes act for the logged-in contractor's own profile only:
// the contractorId always comes from their account, never from the browser.
async function ownContractorProfile(req, res, next) {
    const profile = await contractor.findProfile(req);
    if (!profile) {
        return res.status(403).json({ error: 'Please set up your business profile first.' });
    }
    const ownId = profile._id.toString();
    if (req.body?.contractorId && String(req.body.contractorId) !== ownId) {
        return res.status(403).json({ error: 'You can only work on your own quotation requests.' });
    }
    req.body.contractorId = ownId;
    next();
}

// ============================================================
// GET - Retrieve contractors from MongoDB
// ============================================================

app.get('/api/contractors', async (req, res) => {
    try {
        const db = getDb();

        // Only complete profiles are listed, and account ids stay private.
        const contractors = (await db
            .collection('contractors')
            .find({}, { projection: { userId: 0 } })
            .toArray())
            .filter(contractor.isComplete);

        res.status(200).json(contractors);

    } catch (error) {
        console.error('Error retrieving contractors:', error);

        res.status(500).json({
            error: 'Unable to retrieve contractors'
        });
    }
});
// Each contractor's portfolio of past projects, shown from View Portfolio.
app.use('/api/contractors', portfolio.publicRouter);

// Resolve the optional saved energy plan a homeowner attached to a quotation request.
// It must belong to them and to the chosen household, otherwise it is dropped.
async function resolveAttachedPlanId(db, userId, householdId, planId) {
  if (!planId || !householdId) return null;
  const plan = await db.collection('plans').findOne({ id: String(planId), userId: new ObjectId(userId) });
  if (!plan || !Array.isArray(plan.layout) || !plan.layout.length) return null;
  const household = await db.collection('households').findOne({ _id: plan.householdId, userId: new ObjectId(userId) });
  if (!household || household.id !== String(householdId)) return null;
  return plan.id;
}



// ============================================================
// GET - 3D FLOOR PLAN OF A QUOTATION REQUEST (contractor, read-only)
// ============================================================

app.get('/api/quotation-requests/:requestId/floorplan', auth.requireContractor, async (req, res) => {
  try {
    const db = getDb();
    const profile = await contractor.findProfile(req);
    if (!profile) return res.status(403).json({ error: 'Please set up your business profile first.' });
    if (!ObjectId.isValid(req.params.requestId)) return res.status(400).json({ error: 'Invalid request ID' });

    // Only requests that were sent to this contractor.
    const request = await db.collection('quotationRequests').findOne({
      _id: new ObjectId(req.params.requestId),
      contractorId: profile._id
    });
    if (!request) return res.status(404).json({ error: 'Quotation request not found' });
    if (!request.householdId) {
      return res.status(404).json({ error: "The homeowner didn't attach a saved 3D layout to this request." });
    }

    // The household must belong to the homeowner who sent the request.
    // If the homeowner attached a saved plan, show that plan's layout; otherwise the home's current layout.
    // Always read it fresh so edits to the request or the layout show up for the contractor.
    const plan = request.planId
      ? await spatialRoutes.planFloorplanOf(db, request.planId, request.userId, request.householdId)
      : await spatialRoutes.floorplanOf(db, request.householdId, request.userId);
    if (!plan) {
      return res.status(404).json({ error: 'The 3D layout is no longer available.' });
    }
    res.set('Cache-Control', 'no-store');
    res.json(plan);
  } catch (error) {
    console.error('Error loading quotation request floor plan:', error);
    res.status(500).json({ error: 'Unable to load the 3D layout' });
  }
});



// Energy planner: households and plans are stored in MongoDB per account.
function readJson(filename) {
  const content = fs.readFileSync(path.join(__dirname, filename), "utf8");
  return JSON.parse(content);
}

// Hide MongoDB's own fields from the Vue page.
const HIDDEN = {
  projection: {
    _id: 0,
    userId: 0
  }
};

// Households and plans belong to the logged-in homeowner: userId is their users._id.
const ownedBy = (req) => ({ userId: new ObjectId(req.session.userId) });

// Never let the request body choose its own id or owner.
function cleanBody(body) {
  const { _id, ownerId, userId, id, ...rest } = body;
  return rest;
}

// The shared households collection (also used by 3D Spatial) validates that
// every household has a string flatTypeId, so store the flat type under both names.
function householdBody(req, id) {
  const household = { ...cleanBody(req.body), id };
  if (typeof household.flatType === "string") household.flatTypeId = household.flatType;
  return household;
}

// A plan belongs to one of the homeowner's households (householdId).
function validPlan(body) {
  return (
    body &&
    typeof body.name === 'string' && body.name.trim().length > 0 &&
    typeof body.householdId === "string" &&
    body.householdId.length > 0 &&
    Array.isArray(body.items) &&
    body.estimate &&
    body.profile
  );
}

// GET - Retrieve simulator data for the logged-in user's household

app.get('/api/simulator', auth.requireClient, async (req, res) => {
    try {
        const db = getDb()

        const userId = new ObjectId(req.session.userId)

        // Find the logged-in user's household
        const household = await db.collection('households')
            .findOne({ userId: userId })

        if (!household) {
            return res.status(404).json({
                error: 'No household found.'
            })
        }

        // Retrieve rooms belonging to this household
        const rooms = await db.collection('rooms')
            .find({ householdId: household._id })
            .sort({ order: 1 }) //to ensure consistency in the simulator room tabs
            .toArray()

        if (rooms.length === 0) {
            return res.status(404).json({
                error: 'No rooms found in this household.'
            })
        }

        // Retrieve electrical catalogue items and their products
        const items = await db.collection('catalogue_items')
            .find({
                category: {
                    $in: [
                        'kitchen',
                        'cooling',
                        'entertainment',
                        'laundry',
                        'lighting',
                        'bathroom'
                    ]
                }
            })
            .toArray()

            // Retrieve the user's most recently created energy plan
        const plan = await db.collection('plans')
            .findOne(
                {
                    userId: userId,
                    householdId: household.id
                },
                {
                    sort: { _id: -1 }
                }
            )

        // Use the saved electricity rate, or a default rate
        const electricityRate =
            Number.isFinite(plan?.tariff) && plan.tariff > 0
                ? plan.tariff
                : 0.32


        return res.status(200).json({
            householdId: String(household._id),
            rooms: rooms,
            items: items,
            electricityRate: electricityRate
        })

    } catch (error) {
        console.log(error)

        res.status(500).json({
            error: 'Unable to retrieve simulator data'
        })
    }
})


// Compare names within the same account and household, including older saved plans.
async function duplicatePlanName(req, exceptId = '') {
  const plans = await Planner.retrievePlans(req.session.userId);
  const name = req.body.name.trim().toLowerCase();
  for (const plan of plans) {
    if (plan.householdId === req.body.householdId && plan.id !== exceptId && plan.name.trim().toLowerCase() === name) return true;
  }
  return false;
}

// GET: read this account's existing households and saved energy plans.
app.get('/api/planner', auth.requireClient, async (req, res) => {
  // Profile shares this endpoint and needs the database flat types to render its form.
  const flats = await getDb().collection('flat_types').find().sort({ _id: 1 }).toArray();
  const flatTypes = flats.map((flat) => ({
    id: flat._id,
    name: flat.name,
    bedrooms: flat.bedrooms,
    rooms: (flat.roomTemplate?.rooms || []).map((room) => room.name),
  }));
  res.json({
    flatTypes,
    users: await Planner.retrieveHouseholds(req.session.userId),
    plans: await Planner.retrievePlans(req.session.userId),
  });
});

// Resolve saved 3D placements only for a household owned by this account.
app.get('/api/planner/households/:id/rooms', auth.requireClient, async (req, res) => {
  const household = await Planner.findHousehold(req.session.userId, req.params.id);
  if (!household) return res.status(404).json({ error: 'Household not found.' });
  res.json({ rooms: await Planner.retrieveRooms(household) });
});

// POST: add this account's household. Each account has only one.
app.post("/api/users", auth.requireClient, async (req, res) => {
  if (!req.body || !req.body.name) {
    return res.status(400).json({ error: "Household name is required." });
  }
  if (await getDb().collection("households").countDocuments(ownedBy(req), { limit: 1 })) {
    return res.status(409).json({ error: "This account already has a household. Edit it instead." });
  }
  const user = householdBody(req, randomUUID());
  const { insertedId } = await getDb()
    .collection("households")
    .insertOne({ ...user, ...ownedBy(req) });
  req.session.householdId = String(insertedId);
  delete req.session.myinfoDraft;
  res.status(201).json(user);
});

// PUT: update this account's household matching the ID in the URL.
app.put("/api/users/:id", auth.requireClient, async (req, res) => {
  if (!req.body || !req.body.name) {
    return res.status(400).json({ error: "Household name is required." });
  }
  const user = householdBody(req, req.params.id);
  const households = getDb().collection("households");
  const mine = { ...ownedBy(req), id: req.params.id };
  // Older households may use their MongoDB _id instead of a separate public id.
  if (ObjectId.isValid(req.params.id)) {
    delete mine.id;
    mine.$or = [{ id: req.params.id }, { _id: new ObjectId(req.params.id) }];
  }
  const before = await households.findOne(mine);
  if (!before) {
    return res.status(404).json({ error: "Household not found." });
  }

  // A different flat type means different rooms: add or delete them in the 3D floor plan first,
  // so if that fails nothing has changed and the person can simply try again.
  const flatChanged = user.flatTypeId && user.flatTypeId !== (before.flatTypeId || before.flatType);
  let roomChanges;
  if (flatChanged) {
    try {
      roomChanges = await spatialRoutes.syncRoomsToFlatType(getDb(), before._id, user.flatTypeId);
    } catch (error) {
      console.log("Could not update rooms:", error.message);
      return res.status(500).json({
        error: "Could not update the 3D floor plan for the new flat type, so nothing was changed. Please try again.",
      });
    }
  }
  await households.replaceOne(mine, { ...user, ...ownedBy(req) });
  req.session.householdId = String(before._id);
  delete req.session.myinfoDraft;
  res.json(roomChanges ? { ...user, roomChanges } : user);
});

// POST: save a plan and the estimate calculated in EnergyPlanner.vue.
app.post("/api/plans", auth.requireClient, async (req, res) => {
  if (!validPlan(req.body)) {
    return res.status(400).json({ error: "Plan details are required." });
  }
  // A household ID from the browser must belong to the same logged-in account.
  const household = await Planner.findHousehold(req.session.userId, req.body.householdId);
  if (!household) {
    return res.status(404).json({ error: "Household not found." });
  }
  if (await duplicatePlanName(req)) {
    return res.status(409).json({ error: "A plan with this name already exists in this household. Choose a different name." });
  }
  const plan = { ...cleanBody(req.body), id: randomUUID(), name: req.body.name.trim(), nameKey: req.body.name.trim().toLowerCase() };
  await Planner.addPlan({ ...plan, ...ownedBy(req) });
  res.status(201).json(plan);
});

// PUT: update one of this account's plans.
app.put("/api/plans/:id", auth.requireClient, async (req, res) => {
  if (!validPlan(req.body)) {
    return res.status(400).json({ error: "Plan details are required." });
  }
  // A household ID from the browser must belong to the same logged-in account.
  const household = await Planner.findHousehold(req.session.userId, req.body.householdId);
  if (!household) {
    return res.status(404).json({ error: "Household not found." });
  }
  if (await duplicatePlanName(req, req.params.id)) {
    return res.status(409).json({ error: "A plan with this name already exists in this household. Choose a different name." });
  }
  const plan = { ...cleanBody(req.body), id: req.params.id, name: req.body.name.trim(), nameKey: req.body.name.trim().toLowerCase() };
  const result = await Planner.editPlan(req.session.userId, req.params.id, plan);
  if (result.matchedCount === 0) {
    return res.status(404).json({ error: "Plan not found." });
  }
  res.json(plan);
});

// DELETE: remove one of this account's plans.
app.delete("/api/plans/:id", auth.requireClient, async (req, res) => {
  const result = await Planner.deletePlan(req.session.userId, req.params.id);
  if (result.deletedCount === 0) {
    return res.status(404).json({ error: "Plan not found." });
  }
  res.sendStatus(204);
});

// 3D Spatial: the floor plan, rooms and placements of the logged-in homeowner's household.
app.use('/api/spatial', spatialRoutes);

// One error handler for file or request errors across these routes.
app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  if (error.code === 11000 && req.path.startsWith('/api/plans')) {
    return res.status(409).json({ error: "A plan with this name already exists in this household. Choose a different name." });
  }
  console.log(error.message);
  res
    .status(error.status || 500)
    .json({ error: "Unable to process the planner request." });
});


app.use((req, res) => {
    res.status(404).type('text/plain').send('Not found');
});

// Start listening once MongoDB is connected.
dbReady
    .then(() => {
        app.listen(PORT, '127.0.0.1', () => {
            console.log(`Server running at http://127.0.0.1:${PORT}/`);
        });
        loadLayouts(getDb())
    })
    .catch((error) => {
        console.error("MongoDB error:", error.message);
        process.exit(1);
    });
