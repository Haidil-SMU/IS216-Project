// "Log in with Singpass" + Myinfo, using Singpass's FAPI 2.0 flow:
// PAR -> authorize -> token (PKCE, private_key_jwt, DPoP) -> userinfo (encrypted Myinfo data).
// Locally this runs against MockPass; point the SINGPASS_* settings at Singpass to go live.
const express = require('express');
const fs = require('fs');
const path = require('path');
const { ObjectId } = require('mongodb');
const client = require('openid-client');
const jose = require('jose');
const { getDb } = require('./db');
const { startSession } = require('./auth');
const { toHousehold, personName } = require('./myinfo');

const DISCOVERY_URL =
  process.env.SINGPASS_DISCOVERY_URL ||
  'http://localhost:5156/singpass/v3/fapi/.well-known/openid-configuration';
const CLIENT_ID = process.env.SINGPASS_CLIENT_ID || 'ecohome-local';
const REDIRECT_URI =
  process.env.SINGPASS_REDIRECT_URI || 'http://localhost:5173/api/auth/singpass/callback';
const SCOPES =
  process.env.SINGPASS_SCOPES ||
  'openid user.identity name hdbtype housingtype regadd marital childrenbirthrecords';
const KEYS_FILE =
  process.env.SINGPASS_KEYS_FILE || path.join(__dirname, 'keys', 'singpass-jwks.json');

// ------------------------------------------------------------
// Keys and Singpass configuration (loaded once, retried on failure)
// ------------------------------------------------------------

let keysPromise;
function loadKeys() {
  keysPromise ??= (async () => {
    if (!fs.existsSync(KEYS_FILE)) {
      throw new Error(`Singpass keys not found at ${KEYS_FILE}. Run "pnpm keys" in server/.`);
    }
    const { keys } = JSON.parse(fs.readFileSync(KEYS_FILE, 'utf8'));
    const sigJwk = keys.find((key) => key.use === 'sig');
    const encJwk = keys.find((key) => key.use === 'enc');
    if (!sigJwk || !encJwk) throw new Error('Singpass key file needs a "sig" and an "enc" key.');
    const publicJwk = ({ d, ...rest }) => rest;
    return {
      sig: { key: await jose.importJWK(sigJwk, 'ES256'), kid: sigJwk.kid },
      enc: { key: await jose.importJWK(encJwk, encJwk.alg), kid: encJwk.kid, alg: encJwk.alg },
      publicJwks: { keys: [publicJwk(sigJwk), publicJwk(encJwk)] },
    };
  })().catch((error) => {
    keysPromise = undefined;
    throw error;
  });
  return keysPromise;
}

let configPromise;
function getConfig() {
  configPromise ??= (async () => {
    const keys = await loadKeys();
    const url = new URL(DISCOVERY_URL);
    const config = await client.discovery(
      url,
      CLIENT_ID,
      { id_token_signed_response_alg: 'ES256' },
      client.PrivateKeyJwt(keys.sig),
      // MockPass runs on plain http; real Singpass is always https.
      url.protocol === 'http:' ? { execute: [client.allowInsecureRequests] } : undefined,
    );
    // Singpass encrypts the ID token for us, and we check its signature.
    client.enableDecryptingResponses(config, ['A256GCM', 'A256CBC-HS512'], keys.enc);
    client.enableNonRepudiationChecks(config);
    return {
      config,
      keys,
      remoteJwks: jose.createRemoteJWKSet(new URL(config.serverMetadata().jwks_uri)),
    };
  })().catch((error) => {
    configPromise = undefined;
    throw error;
  });
  return configPromise;
}

// The DPoP key pair must survive the trip to Singpass and back, so it is kept
// in the session as JWKs.
async function newDpopKeys() {
  const pair = await client.randomDPoPKeyPair('ES256', { extractable: true });
  return {
    publicJwk: await jose.exportJWK(pair.publicKey),
    privateJwk: await jose.exportJWK(pair.privateKey),
  };
}

async function dpopHandle(config, { publicJwk, privateJwk }) {
  const keyPair = {
    publicKey: await jose.importJWK(publicJwk, 'ES256', { extractable: true }),
    privateKey: await jose.importJWK(privateJwk, 'ES256'),
  };
  return client.getDPoPHandle(config, keyPair);
}

// Only allow redirects back into this site ("/path", never "//other-site").
function safeReturnTo(value) {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//')
    ? value
    : '';
}

// Myinfo arrives as a signed JWT inside an encrypted JWE.
async function readMyinfo({ config, keys, remoteJwks }, accessToken, dpop, expectedSub) {
  const userinfoUrl = new URL(config.serverMetadata().userinfo_endpoint);
  const response = await client.fetchProtectedResource(
    config,
    accessToken,
    userinfoUrl,
    'GET',
    undefined,
    undefined,
    { DPoP: dpop },
  );
  const body = await response.text();
  if (!response.ok) throw new Error(`Myinfo request failed (${response.status}): ${body}`);

  const { plaintext } = await jose.compactDecrypt(body.trim(), keys.enc.key);
  const { payload } = await jose.jwtVerify(new TextDecoder().decode(plaintext), remoteJwks, {
    issuer: config.serverMetadata().issuer,
    audience: CLIENT_ID,
  });
  if (payload.sub !== expectedSub) throw new Error('Myinfo subject does not match the ID token');
  return payload.person_info || {};
}

// ------------------------------------------------------------
// Routes (mounted at /api/auth/singpass)
// ------------------------------------------------------------

const router = express.Router();

// GET: our public keys. Singpass uses them to check our client assertion and to
// encrypt the ID token and Myinfo data for us.
router.get('/jwks', async (req, res) => {
  const { publicJwks } = await loadKeys();
  res.json(publicJwks);
});

// GET: start the Singpass flow.
//   mode=login  - log in or sign up with Singpass (from the login page)
//   mode=myinfo - an already logged-in user retrieves Myinfo and links Singpass
router.get('/login', async (req, res) => {
  const mode = req.query.mode === 'myinfo' ? 'myinfo' : 'login';
  const returnTo = safeReturnTo(req.query.returnTo);
  if (mode === 'myinfo' && !req.session.userId) {
    return res.redirect('/login?redirect=' + encodeURIComponent(returnTo || '/EnergyPlanner/'));
  }

  try {
    const { config } = await getConfig();
    const flow = {
      mode,
      returnTo,
      state: client.randomState(),
      nonce: client.randomNonce(),
      codeVerifier: client.randomPKCECodeVerifier(),
      dpop: await newDpopKeys(),
    };
    const authorizationUrl = await client.buildAuthorizationUrlWithPAR(
      config,
      {
        response_type: 'code',
        scope: SCOPES,
        redirect_uri: REDIRECT_URI,
        state: flow.state,
        nonce: flow.nonce,
        code_challenge: await client.calculatePKCECodeChallenge(flow.codeVerifier),
        code_challenge_method: 'S256',
      },
      { DPoP: await dpopHandle(config, flow.dpop) },
    );
    req.session.singpassFlow = flow;
    res.redirect(authorizationUrl.href);
  } catch (error) {
    console.error('Singpass login error:', error.message);
    res.redirect(mode === 'myinfo' ? '/EnergyPlanner/?error=myinfo' : '/login?error=singpass');
  }
});

// GET: Singpass sends the user back here with an authorization code.
router.get('/callback', async (req, res) => {
  const flow = req.session.singpassFlow;
  delete req.session.singpassFlow;
  const failUrl = flow?.mode === 'myinfo' ? '/EnergyPlanner/?error=myinfo' : '/login?error=singpass';

  try {
    if (!flow) throw new Error('No Singpass login in progress for this session');
    if (req.query.error) throw new Error(`Singpass returned ${req.query.error}`);

    const singpass = await getConfig();
    const dpop = await dpopHandle(singpass.config, flow.dpop);
    const tokens = await client.authorizationCodeGrant(
      singpass.config,
      new URL(req.originalUrl, REDIRECT_URI),
      {
        pkceCodeVerifier: flow.codeVerifier,
        expectedState: flow.state,
        expectedNonce: flow.nonce,
        idTokenExpected: true,
      },
      undefined,
      { DPoP: dpop, redirectUri: REDIRECT_URI },
    );
    const uuid = tokens.claims().sub;
    const person = await readMyinfo(singpass, tokens.access_token, dpop, uuid);
    const household = toHousehold(person);

    const users = getDb().collection('users');
    const now = new Date();
    const linked = await users.findOne({ 'singpass.uuid': uuid });
    let user;

    if (flow.mode === 'myinfo' && req.session.userId) {
      // Link Singpass to the account that is already logged in.
      const currentId = new ObjectId(req.session.userId);
      if (linked && !linked._id.equals(currentId)) {
        throw new Error('This Singpass account is already linked to another EcoHome account');
      }
      if (!linked) {
        await users.updateOne({ _id: currentId }, { $set: { singpass: { uuid, linkedAt: now } } });
      }
      user = await users.findOne({ _id: currentId });
    } else if (linked) {
      user = linked;
      const update = { lastLoginAt: now };
      // Replace the placeholder name once Myinfo provides a real one.
      if (user.name === 'Singpass user' && personName(person)) update.name = personName(person);
      await users.updateOne({ _id: user._id }, { $set: update });
    } else {
      user = {
        name: personName(person) || 'Singpass user',
        role: 'client',
        singpass: { uuid, linkedAt: now },
        createdAt: now,
        lastLoginAt: now,
      };
      user._id = (await users.insertOne(user)).insertedId;
    }
    if (!user) throw new Error('Account not found');

    // Offer the Myinfo household when it was asked for, or when the account has none yet.
    const hasHousehold = await getDb()
      .collection('households')
      .countDocuments({ ownerId: user._id.toString() }, { limit: 1 });
    const offerDraft = flow.mode === 'myinfo' || !hasHousehold;

    await startSession(req, user, {
      remember: true,
      keep: offerDraft ? { myinfoDraft: household } : {},
    });
    res.redirect(flow.returnTo || (offerDraft ? '/EnergyPlanner/' : '/'));
  } catch (error) {
    console.error('Singpass callback error:', error.message);
    res.redirect(failUrl);
  }
});

module.exports = { router };
