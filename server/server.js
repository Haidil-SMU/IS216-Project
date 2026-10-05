const express = require('express');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 8000;
const FILE_LOC = path.join(__dirname, 'courses.json');

function loadData() {
    try {
        const raw = fs.readFileSync(FILE_LOC, 'utf8');
        const data = JSON.parse(raw);

        return {
            courseInfo: Array.isArray(data.courseInfo) ? data.courseInfo : []
        };
    } catch {
        return { courseInfo: [] };
    }
}

function saveData(data) {
    const tmp = `${FILE_LOC}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 4));
    fs.renameSync(tmp, FILE_LOC);
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
    res.status(200).json(loadData());
});

// ============================================================
// POST
// Create a new course
// ============================================================


app.use((req, res) => {
    res.status(404).type('text/plain').send('Not found');
});

app.listen(PORT, '127.0.0.1', () => {
    console.log(`Server running at http://127.0.0.1:${PORT}/`);
});