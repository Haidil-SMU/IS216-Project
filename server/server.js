require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const { MongoClient } = require('mongodb');

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

app.use(express.json({ limit: '2mb' }));

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

// Energy planner: JSON storage and GET, POST, PUT, DELETE routes.
function readJson(filename) {
  const content = fs.readFileSync(path.join(__dirname, filename), "utf8");
  return JSON.parse(content);
}

function writeJson(filename, data) {
  fs.writeFileSync(
    path.join(__dirname, filename),
    JSON.stringify(data, null, 2),
  );
}

// GET: return the JSON data to the Vue page.
app.get("/api/planner", (req, res) => {
  const catalogue = JSON.parse(
    fs.readFileSync(path.join(__dirname, "appliances.json"), "utf8"),
  );
  for (const appliance of catalogue.appliances) {
    appliance.type = appliance.type || appliance.name;
    appliance.location = appliance.location || "Not specified";
  }
  res.json({
    appliances: catalogue.appliances,
    flatTypes: readJson("hdb_rooms.json").flatTypes,
    users: readJson("users.json").users,
    plans: readJson("plans.json").plans,
  });
});

// POST: add a new household to users.json.
app.post("/api/users", (req, res) => {
  if (!req.body || !req.body.name) {
    return res.status(400).json({ error: "Household name is required." });
  }
  const data = readJson("users.json");
  const user = { ...req.body, id: randomUUID() };
  data.users.push(user);
  writeJson("users.json", data);
  res.status(201).json(user);
});

// PUT: replace the household matching the ID in the URL.
app.put("/api/users/:id", (req, res) => {
  if (!req.body || !req.body.name) {
    return res.status(400).json({ error: "Household name is required." });
  }
  const data = readJson("users.json");
  for (let i = 0; i < data.users.length; i++) {
    if (data.users[i].id === req.params.id) {
      data.users[i] = { ...req.body, id: req.params.id };
      writeJson("users.json", data);
      return res.json(data.users[i]);
    }
  }
  res.status(404).json({ error: "Household not found." });
});

// POST: save a plan and the estimate calculated in EnergyPlanner.vue.
app.post("/api/plans", (req, res) => {
  if (
    !req.body ||
    !req.body.name ||
    !req.body.userId ||
    !Array.isArray(req.body.items) ||
    !req.body.estimate ||
    !req.body.profile
  ) {
    return res.status(400).json({ error: "Plan details are required." });
  }
  const data = readJson("plans.json");
  const plan = { ...req.body, id: randomUUID() };
  data.plans.push(plan);
  writeJson("plans.json", data);
  res.status(201).json(plan);
});

// PUT: update an existing plan in plans.json.
app.put("/api/plans/:id", (req, res) => {
  if (
    !req.body ||
    !req.body.name ||
    !req.body.userId ||
    !Array.isArray(req.body.items) ||
    !req.body.estimate ||
    !req.body.profile
  ) {
    return res.status(400).json({ error: "Plan details are required." });
  }
  const data = readJson("plans.json");
  for (let i = 0; i < data.plans.length; i++) {
    if (data.plans[i].id === req.params.id) {
      data.plans[i] = { ...req.body, id: req.params.id };
      writeJson("plans.json", data);
      return res.json(data.plans[i]);
    }
  }
  res.status(404).json({ error: "Plan not found." });
});

// DELETE: remove the plan matching the ID, then save the remaining plans.
app.delete("/api/plans/:id", (req, res) => {
  const data = readJson("plans.json");
  for (let i = 0; i < data.plans.length; i++) {
    if (data.plans[i].id === req.params.id) {
      data.plans.splice(i, 1);
      writeJson("plans.json", data);
      return res.sendStatus(204);
    }
  }
  res.status(404).json({ error: "Plan not found." });
});

const spatialRoutes = require('./spatialRoutes');
app.use('/api', spatialRoutes);

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

async function testMongoDB() {
    const client = new MongoClient(process.env.DB);

    try {
        await client.connect();
        console.log("MongoDB connected successfully!");

        const db = client.db("wq_test");
        // const test = db.collection("test");
        const test = db.collection("test");

        const firstDocument = await test.findOne({});

        console.log("Testing:", firstDocument);

    } catch (error) {
        console.error("MongoDB error:", error.message);
    } finally {
        await client.close();
    }
}


testMongoDB();

app.listen(PORT, '127.0.0.1', () => {
    console.log(`Server running at http://127.0.0.1:${PORT}/`);
});