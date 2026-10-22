// "Log in with Corppass" for renovation contractors.
// Corppass is the business version of Singpass: the ID token tells us which
// company (UEN) the person is acting for, so the UEN is verified by the login itself.
// Every Corppass user from the same company shares one contractor account.
// Locally this runs against MockPass; point the CORPPASS_* settings at Corppass to go live.
const express = require('express');
const client = require('openid-client');
const { getDb } = require('./db');
const { startSession } = require('./auth');
const { getOidcConfig, safeReturnTo, loginErrorUrl } = require('./oidc');
const { lookupUen, ownerFilter } = require('./contractor');

const DISCOVERY_URL =
  process.env.CORPPASS_DISCOVERY_URL ||
  'http://localhost:5156/corppass/v2/.well-known/openid-configuration';
const CLIENT_ID = process.env.CORPPASS_CLIENT_ID || 'ecohome-local';
const REDIRECT_URI =
  process.env.CORPPASS_REDIRECT_URI || 'http://localhost:5173/api/auth/corppass/callback';

const getConfig = () => getOidcConfig({ discoveryUrl: DISCOVERY_URL, clientId: CLIENT_ID });

// Corppass gives the UEN but not the company name, so use BCA's register of
// contractors when it knows the UEN, otherwise just the UEN until profile set-up.
// ("Company <UEN>" was the placeholder in earlier versions.)
const isPlaceholderName = (name, uen) => name === uen || name === `Company ${uen}`;
async function registeredName(uen) {
  try {
    return (await lookupUen(uen))?.companyName || '';
  } catch (error) {
    console.error('UEN lookup error:', error.message);
    return '';
  }
}

// sub looks like "s=S8979373D,uuid=a98…,u=123456789AS8979373D,c=SG"
function parseSub(sub) {
  const parts = {};
  for (const pair of String(sub || '').split(',')) {
    const [key, ...rest] = pair.split('=');
    if (key) parts[key.trim()] = rest.join('=').trim();
  }
  return parts;
}

const router = express.Router();

// GET: start the Corppass flow (sign-up and login are the same flow).
router.get('/login', async (req, res) => {
  const returnTo = safeReturnTo(req.query.returnTo);
  try {
    const { config } = await getConfig();
    const flow = {
      returnTo,
      state: client.randomState(),
      nonce: client.randomNonce(),
      codeVerifier: client.randomPKCECodeVerifier(),
    };
    const authorizationUrl = client.buildAuthorizationUrl(config, {
      response_type: 'code',
      scope: 'openid',
      redirect_uri: REDIRECT_URI,
      state: flow.state,
      nonce: flow.nonce,
      code_challenge: await client.calculatePKCECodeChallenge(flow.codeVerifier),
      code_challenge_method: 'S256',
    });
    req.session.corppassFlow = flow;
    res.redirect(authorizationUrl.href);
  } catch (error) {
    console.error('Corppass login error:', error.message);
    res.redirect(loginErrorUrl({ as: 'contractor', error: 'corppass' }, returnTo));
  }
});

// GET: Corppass sends the user back here with an authorization code.
router.get('/callback', async (req, res) => {
  const flow = req.session.corppassFlow;
  delete req.session.corppassFlow;

  try {
    if (!flow) throw new Error('No Corppass login in progress for this session');
    if (req.query.error) throw new Error(`Corppass returned ${req.query.error}`);

    const { config } = await getConfig();
    const tokens = await client.authorizationCodeGrant(
      config,
      new URL(req.originalUrl, REDIRECT_URI),
      {
        pkceCodeVerifier: flow.codeVerifier,
        expectedState: flow.state,
        expectedNonce: flow.nonce,
        idTokenExpected: true,
      },
      undefined,
      { redirectUri: REDIRECT_URI },
    );

    const claims = tokens.claims();
    const entity = claims.entityInfo || {};
    const uen = String(entity.CPEntID || '').trim().toUpperCase();
    if (!uen) throw new Error('Corppass did not return a UEN');
    if (entity.CPEnt_Status && entity.CPEnt_Status !== 'Registered') {
      throw new Error(`Company status is ${entity.CPEnt_Status}`);
    }
    const person = {
      uuid: parseSub(claims.sub).uuid || null,
      name: String(claims.userInfo?.CPUID_FullName || '').slice(0, 100),
      at: new Date(),
    };

    // One shared contractor account per company (UEN).
    const users = getDb().collection('users');
    const now = new Date();
    let user = await users.findOne({ 'corppass.uen': uen });
    if (user && user.role !== 'contractor') throw new Error('UEN is linked to a non-contractor account');

    if (user) {
      const update = { lastLoginAt: now, 'corppass.lastLoginBy': person };
      // Existing accounts go by their profile's company name; before set-up,
      // replace a placeholder with the registered name if BCA knows the UEN.
      const profile = await getDb()
        .collection('contractors')
        .findOne(ownerFilter(user._id.toString()), { projection: { companyName: 1 } });
      if (profile?.companyName) {
        update.name = user.name = profile.companyName;
      } else if (isPlaceholderName(user.name, uen)) {
        update.name = user.name = (await registeredName(uen)) || uen;
      }
      await users.updateOne({ _id: user._id }, { $set: update });
    } else {
      user = {
        // Replaced by the name entered during profile set-up.
        name: (await registeredName(uen)) || uen,
        role: 'contractor',
        corppass: { uen, linkedAt: now, lastLoginBy: person },
        createdAt: now,
        lastLoginAt: now,
      };
      user._id = (await users.insertOne(user)).insertedId;
    }

    await startSession(req, user, { remember: true });
    res.redirect(flow.returnTo || '/ContractorDashboard');
  } catch (error) {
    console.error('Corppass callback error:', error.message);
    res.redirect(loginErrorUrl({ as: 'contractor', error: 'corppass' }, flow?.returnTo));
  }
});

module.exports = { router };
