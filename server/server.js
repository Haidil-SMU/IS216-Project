require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const session = require('express-session');
const { MongoStore } = require('connect-mongo');
const { connectDb, getClient, getDb, DB_NAME } = require('./db');
const auth = require('./auth');
const singpass = require('./singpass');
const myinfo = require('./myinfo');

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
const dbReady = connectDb();
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
        'GET, POST, PUT, DELETE, OPTIONS'
    );
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

// ============================================================
// Authentication: email + password, Singpass and Myinfo
// ============================================================

app.use('/api/auth/singpass', singpass.router);
app.use('/api/auth', auth.router);
app.use('/api/myinfo', myinfo.router);

// ============================================================
// GET
// Retrieve courses
// ============================================================

app.get('/api', (req, res) => {
    res.status(200).json(loadGameData());
});

// ============================================================
// POST
// Create a new course
// ============================================================





// DARYL EDWIN
// ============================================================
// POST - Analyze Contractor Quotations with Gemini AI
// ============================================================

app.post('/api/analyze-quotations', async (req, res) => {
    try {
        const { contractors } = req.body;

        if (!Array.isArray(contractors) || contractors.length === 0) {
            return res.status(400).json({ error: 'No contractor quotations provided' });
        }

        const { GoogleGenAI } = await import('@google/genai');

        const ai = new GoogleGenAI({
            apiKey: process.env.GEMINI_API_KEY
        });

const prompt = `
You are helping a Singapore homeowner compare renovation quotations.

Contractor data:
${JSON.stringify(contractors)}

Recommend the best combination of contractors based on price,
scope of work, hidden costs, discounts, and warranty.

IMPORTANT:
- Keep the response extremely short.
- Do not invent prices, discounts, or additional fees.
- Only apply discounts if their conditions are clearly satisfied.
- Do not recommend duplicate services.
- Return ONLY valid JSON, without Markdown.

Use this exact JSON structure:
{
  "recommendation": "One sentence recommending contractors and services",
  "reasons": [
    "Short reason 1",
    "Short reason 2",
    "Short reason 3"
  ]
}

Maximum 4 reasons.
Each reason must be under 20 words.
`;
const response = await ai.models.generateContent({
    model: 'gemini-3.1-flash-lite',
    contents: prompt,
    config: {
        responseMimeType: 'application/json',
        maxOutputTokens: 1000
    }
});

const analysis = JSON.parse(response.text);

res.json({ analysis });

    } catch (error) {
        console.error('Gemini error:', error);
        res.status(500).json({
            error: 'Unable to analyze quotations'
        });
    }
});

// Energy planner: households and plans are stored in MongoDB per account.
function readJson(filename) {
  const content = fs.readFileSync(path.join(__dirname, filename), "utf8");
  return JSON.parse(content);
}

// Hide MongoDB's own fields from the Vue page.
const HIDDEN = { projection: { _id: 0, ownerId: 0 } };

// Never let the request body choose its own id or owner.
function cleanBody(body) {
  const { _id, ownerId, id, ...rest } = body;
  return rest;
}

function validPlan(body) {
  return (
    body &&
    body.name &&
    body.userId &&
    Array.isArray(body.items) &&
    body.estimate &&
    body.profile
  );
}

// GET: return the catalogue plus this account's households and plans.
app.get("/api/planner", auth.requireAuth, async (req, res) => {
  const catalogue = readJson("appliances.json");
  for (const appliance of catalogue.appliances) {
    appliance.type = appliance.type || appliance.name;
    appliance.location = appliance.location || "Not specified";
  }
  const ownerId = req.session.userId;
  res.json({
    appliances: catalogue.appliances,
    flatTypes: readJson("hdb_rooms.json").flatTypes,
    users: await getDb().collection("households").find({ ownerId }, HIDDEN).toArray(),
    plans: await getDb().collection("plans").find({ ownerId }, HIDDEN).toArray(),
  });
});

// POST: add a new household for this account.
app.post("/api/users", auth.requireAuth, async (req, res) => {
  if (!req.body || !req.body.name) {
    return res.status(400).json({ error: "Household name is required." });
  }
  const user = { ...cleanBody(req.body), id: randomUUID() };
  await getDb()
    .collection("households")
    .insertOne({ ...user, ownerId: req.session.userId });
  delete req.session.myinfoDraft;
  res.status(201).json(user);
});

// PUT: replace this account's household matching the ID in the URL.
app.put("/api/users/:id", auth.requireAuth, async (req, res) => {
  if (!req.body || !req.body.name) {
    return res.status(400).json({ error: "Household name is required." });
  }
  const ownerId = req.session.userId;
  const user = { ...cleanBody(req.body), id: req.params.id };
  const result = await getDb()
    .collection("households")
    .replaceOne({ ownerId, id: req.params.id }, { ...user, ownerId });
  if (result.matchedCount === 0) {
    return res.status(404).json({ error: "Household not found." });
  }
  delete req.session.myinfoDraft;
  res.json(user);
});

// POST: save a plan and the estimate calculated in EnergyPlanner.vue.
app.post("/api/plans", auth.requireAuth, async (req, res) => {
  if (!validPlan(req.body)) {
    return res.status(400).json({ error: "Plan details are required." });
  }
  const plan = { ...cleanBody(req.body), id: randomUUID() };
  await getDb()
    .collection("plans")
    .insertOne({ ...plan, ownerId: req.session.userId });
  res.status(201).json(plan);
});

// PUT: update one of this account's plans.
app.put("/api/plans/:id", auth.requireAuth, async (req, res) => {
  if (!validPlan(req.body)) {
    return res.status(400).json({ error: "Plan details are required." });
  }
  const ownerId = req.session.userId;
  const plan = { ...cleanBody(req.body), id: req.params.id };
  const result = await getDb()
    .collection("plans")
    .replaceOne({ ownerId, id: req.params.id }, { ...plan, ownerId });
  if (result.matchedCount === 0) {
    return res.status(404).json({ error: "Plan not found." });
  }
  res.json(plan);
});

// DELETE: remove one of this account's plans.
app.delete("/api/plans/:id", auth.requireAuth, async (req, res) => {
  const result = await getDb()
    .collection("plans")
    .deleteOne({ ownerId: req.session.userId, id: req.params.id });
  if (result.deletedCount === 0) {
    return res.status(404).json({ error: "Plan not found." });
  }
  res.sendStatus(204);
});

// One error handler for file or request errors across these routes.
app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
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
    })
    .catch((error) => {
        console.error("MongoDB error:", error.message);
        process.exit(1);
    });
