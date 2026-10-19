// Email + password accounts, MongoDB-backed sessions and the requireAuth guard.
const express = require('express');
const { randomBytes, scrypt, timingSafeEqual } = require('crypto');
const { promisify } = require('util');
const { ObjectId } = require('mongodb');
const { rateLimit } = require('express-rate-limit');
const { getDb } = require('./db');

const scryptAsync = promisify(scrypt);
const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// At least 8 characters with an uppercase letter, a lowercase letter, a number and a symbol.
function strongPassword(password) {
  return (
    password.length >= 8 &&
    password.length <= 128 &&
    /[A-Z]/.test(password) &&
    /[a-z]/.test(password) &&
    /\d/.test(password) &&
    /[^A-Za-z0-9\s]/.test(password)
  );
}

// Passwords are stored as "scrypt$salt$hash" (both base64).
async function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = await scryptAsync(password, salt, 64);
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

async function verifyPassword(password, stored) {
  const [scheme, salt, hash] = String(stored).split('$');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  const actual = await scryptAsync(password, Buffer.from(salt, 'base64'), expected.length);
  return timingSafeEqual(expected, actual);
}

// Used when the email does not exist, so a wrong email takes as long as a wrong password.
const DUMMY_HASH = hashPassword(randomBytes(16).toString('hex'));

// Only these fields ever leave the server.
function publicUser(user) {
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email || null,
    singpass: Boolean(user.singpass),
    hasPassword: Boolean(user.passwordHash),
  };
}

// Starts a fresh session for the user (prevents session fixation).
// `keep` carries values such as the Myinfo draft over to the new session.
function startSession(req, user, { remember = false, keep = {} } = {}) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((error) => {
      if (error) return reject(error);
      req.session.userId = user._id.toString();
      Object.assign(req.session, keep);
      // "Remember me" keeps the cookie for 30 days, otherwise it ends with the browser.
      if (remember) req.session.cookie.maxAge = THIRTY_DAYS;
      else req.session.cookie.expires = false;
      req.session.save((saveError) => (saveError ? reject(saveError) : resolve()));
    });
  });
}

async function currentUser(req) {
  if (!req.session.userId || !ObjectId.isValid(req.session.userId)) return null;
  return getDb()
    .collection('users')
    .findOne({ _id: new ObjectId(req.session.userId) });
}

function requireAuth(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: 'Please log in to continue.' });
  }
  next();
}

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please try again in a few minutes.' },
});

const router = express.Router();

// POST: create an email + password account and log the user in.
router.post('/signup', authLimiter, async (req, res) => {
  const name = String(req.body?.name || '').trim();
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');

  if (name.length < 1 || name.length > 60) {
    return res.status(400).json({ error: 'Please enter your name (up to 60 characters).' });
  }
  if (!EMAIL_PATTERN.test(email) || email.length > 254) {
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  }
  if (!strongPassword(password)) {
    return res.status(400).json({
      error:
        'Password must be at least 8 characters with an uppercase letter, a lowercase letter, a number and a symbol.',
    });
  }

  const users = getDb().collection('users');
  const now = new Date();
  const user = {
    name,
    email,
    passwordHash: await hashPassword(password),
    role: 'client',
    createdAt: now,
    lastLoginAt: now,
  };
  try {
    const result = await users.insertOne(user);
    user._id = result.insertedId;
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }
    throw error;
  }

  await startSession(req, user, { remember: Boolean(req.body?.remember) });
  res.status(201).json({ user: publicUser(user) });
});

// POST: log in with email + password.
router.post('/login', authLimiter, async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  const users = getDb().collection('users');

  const user = email ? await users.findOne({ email }) : null;
  let valid = false;
  if (user?.passwordHash) valid = await verifyPassword(password, user.passwordHash);
  else await verifyPassword(password, await DUMMY_HASH);

  if (!valid) {
    return res.status(401).json({ error: 'Incorrect email or password.' });
  }

  await users.updateOne({ _id: user._id }, { $set: { lastLoginAt: new Date() } });
  await startSession(req, user, { remember: Boolean(req.body?.remember) });
  res.json({ user: publicUser(user) });
});

// POST: end the session and clear the cookie.
router.post('/logout', (req, res, next) => {
  req.session.destroy((error) => {
    if (error) return next(error);
    res.clearCookie('ecohome.sid');
    res.sendStatus(204);
  });
});

// GET: who is logged in?
router.get('/me', async (req, res) => {
  const user = await currentUser(req);
  if (!user) return res.status(401).json({ error: 'Not logged in.' });
  res.json({ user: publicUser(user) });
});

module.exports = { router, requireAuth, startSession, publicUser, currentUser, THIRTY_DAYS };
