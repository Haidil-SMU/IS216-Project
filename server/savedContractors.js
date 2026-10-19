// Saved contractors, stored per account in MongoDB.
// Same routes and record shape as the contractor pages ({ savedId, source, ...contractor }),
// with each record tied to the logged-in user through `userId`.
const express = require('express');
const { getDb } = require('./db');
const { requireAuth } = require('./auth');

const SOURCES = ['website', 'api'];
const HIDDEN = { projection: { _id: 0, userId: 0 } };

// Keep only "workhead code -> non-negative number" pairs.
function cleanQuotation(quotation) {
  const result = {};
  if (!quotation || typeof quotation !== 'object') return result;
  for (const [workhead, price] of Object.entries(quotation)) {
    const amount = Number(price);
    if (workhead.length <= 20 && price !== '' && price !== null && Number.isFinite(amount) && amount >= 0) {
      result[workhead] = amount;
    }
  }
  return result;
}

function cleanDescription(description) {
  return typeof description === 'string' ? description.slice(0, 2000) : '';
}

const router = express.Router();
router.use(requireAuth);

const collection = () => getDb().collection('savedContractors');

// GET: this account's saved contractors.
router.get('/', async (req, res) => {
  const contractors = await collection()
    .find({ userId: req.session.userId }, HIDDEN)
    .sort({ savedAt: 1 })
    .toArray();
  res.json(contractors);
});

// POST: save a contractor to this account.
router.post('/', async (req, res) => {
  const { _id, userId, savedId, source, quotation, description, ...contractor } = req.body || {};
  if (typeof savedId !== 'string' || !savedId || savedId.length > 100 || !SOURCES.includes(source)) {
    return res.status(400).json({ error: 'Invalid contractor information' });
  }

  const owner = req.session.userId;
  if (await collection().findOne({ userId: owner, savedId })) {
    return res.status(409).json({ error: 'Contractor already saved' });
  }

  const saved = {
    ...contractor,
    savedId,
    source,
    quotation: cleanQuotation(quotation),
    description: cleanDescription(description),
    savedAt: new Date(),
  };
  await collection().insertOne({ ...saved, userId: owner });
  res.status(201).json(saved);
});

// PUT: update the quotation prices and notes for one saved contractor.
router.put('/:savedId', async (req, res) => {
  const result = await collection().updateOne(
    { userId: req.session.userId, savedId: req.params.savedId },
    {
      $set: {
        quotation: cleanQuotation(req.body?.quotation),
        description: cleanDescription(req.body?.description),
        updatedAt: new Date(),
      },
    },
  );
  if (result.matchedCount === 0) {
    return res.status(404).json({ error: 'Saved contractor not found' });
  }
  res.json({ message: 'Quotation saved successfully' });
});

// DELETE: remove a contractor from this account.
router.delete('/:savedId', async (req, res) => {
  const result = await collection().deleteOne({
    userId: req.session.userId,
    savedId: req.params.savedId,
  });
  if (result.deletedCount === 0) {
    return res.status(404).json({ error: 'Saved contractor not found' });
  }
  res.json({ message: 'Contractor removed successfully' });
});

module.exports = { router };
