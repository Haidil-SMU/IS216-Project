require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');

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

app.use(express.json());

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

app.use((req, res) => {
    res.status(404).type('text/plain').send('Not found');
});

app.listen(PORT, '127.0.0.1', () => {
    console.log(`Server running at http://127.0.0.1:${PORT}/`);
});