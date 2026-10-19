// Turns a Singpass Myinfo person record into Energy Planner household details.
// Only the derived fields are kept; the raw Myinfo record is never stored.
const express = require('express');
const { requireAuth } = require('./auth');

// Myinfo HDB type codes -> planner flat types (hdb_rooms.json).
const HDB_TYPES = {
  111: '2-room', // 1-room flat: closest planner layout
  112: '2-room',
  113: '3-room',
  114: '4-room',
  115: '5-room',
  116: '5-room', // Executive flat
  118: '2-room', // Studio apartment
};

function value(claim) {
  if (!claim || claim.unavailable) return '';
  return String(claim.value ?? claim.desc ?? '').trim();
}

function titleCase(text) {
  return text.toLowerCase().replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

// "Blk 123 Lorong 1 Toa Payoh #12-22, Singapore 310123"
function formatAddress(regadd) {
  if (!regadd || regadd.unavailable) return '';
  if (regadd.type === 'Unformatted') {
    return [value(regadd.line1), value(regadd.line2)].filter(Boolean).join(', ');
  }
  const block = value(regadd.block);
  const street = titleCase(value(regadd.street));
  const floor = value(regadd.floor);
  const unit = value(regadd.unit);
  const postal = value(regadd.postal);

  let line = [block && `Blk ${block}`, street].filter(Boolean).join(' ');
  if (floor && unit) line += ` #${floor}-${unit}`;
  return [line, postal && `Singapore ${postal}`].filter(Boolean).join(', ');
}

function flatTypeOf(person) {
  const code = person.hdbtype && !person.hdbtype.unavailable ? person.hdbtype.code : '';
  if (HDB_TYPES[code]) return HDB_TYPES[code];
  // Fall back to the HDB flat the person owns.
  const owned = Array.isArray(person.hdbownership) ? person.hdbownership[0] : null;
  return HDB_TYPES[owned?.hdbtype?.code] || null;
}

// Rough household size: the person, a spouse if married, and their children.
function estimateOccupants(person) {
  let count = 1;
  if (person.marital && !person.marital.unavailable && person.marital.code === '2') count += 1;
  if (Array.isArray(person.childrenbirthrecords)) count += person.childrenbirthrecords.length;
  return Math.min(Math.max(count, 1), 12);
}

function personName(person = {}) {
  return titleCase(value(person.name));
}

function toHousehold(person = {}) {
  const fullName = personName(person);
  const flatType = flatTypeOf(person);
  const address = formatAddress(person.regadd);

  const fields = ['occupants'];
  if (fullName) fields.push('name');
  if (flatType) fields.push('flatType');
  if (address) fields.push('address');

  return {
    name: fullName ? `${fullName}'s household`.slice(0, 80) : 'My household',
    flatType,
    occupants: estimateOccupants(person),
    address,
    myinfo: { fields, filledAt: new Date().toISOString() },
  };
}

const router = express.Router();

// GET: the household details retrieved at the last Singpass login, if any.
router.get('/draft', requireAuth, (req, res) => {
  if (!req.session.myinfoDraft) return res.sendStatus(204);
  res.json(req.session.myinfoDraft);
});

// DELETE: the user dismissed the Myinfo details.
router.delete('/draft', requireAuth, (req, res) => {
  delete req.session.myinfoDraft;
  res.sendStatus(204);
});

module.exports = { router, toHousehold, formatAddress, personName };
