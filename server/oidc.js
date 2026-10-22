// Shared plumbing for Singpass and Corppass logins: this app's keys and the
// OpenID Connect client set-up (private_key_jwt, encrypted + signed ID tokens).
const fs = require('fs');
const path = require('path');
const client = require('openid-client');
const jose = require('jose');

const KEYS_FILE =
  process.env.SINGPASS_KEYS_FILE || path.join(__dirname, 'keys', 'singpass-jwks.json');

// ------------------------------------------------------------
// This app's keys (loaded once, retried on failure)
// ------------------------------------------------------------

let keysPromise;
function loadKeys() {
  keysPromise ??= (async () => {
    if (!fs.existsSync(KEYS_FILE)) {
      throw new Error(`Login keys not found at ${KEYS_FILE}. Run "pnpm keys" in server/.`);
    }
    const { keys } = JSON.parse(fs.readFileSync(KEYS_FILE, 'utf8'));
    const sigJwk = keys.find((key) => key.use === 'sig');
    const encJwk = keys.find((key) => key.use === 'enc');
    if (!sigJwk || !encJwk) throw new Error('Key file needs a "sig" and an "enc" key.');
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

// ------------------------------------------------------------
// Provider configuration (one per discovery URL, cached)
// ------------------------------------------------------------

const configs = new Map();
function getOidcConfig({ discoveryUrl, clientId }) {
  if (!configs.has(discoveryUrl)) {
    const promise = (async () => {
      const keys = await loadKeys();
      const url = new URL(discoveryUrl);
      const config = await client.discovery(
        url,
        clientId,
        { id_token_signed_response_alg: 'ES256' },
        client.PrivateKeyJwt(keys.sig),
        // MockPass runs on plain http; the real Singpass/Corppass are always https.
        url.protocol === 'http:' ? { execute: [client.allowInsecureRequests] } : undefined,
      );
      // The ID token is encrypted for us, and we check its signature.
      client.enableDecryptingResponses(config, ['A256GCM', 'A256CBC-HS512'], keys.enc);
      client.enableNonRepudiationChecks(config);
      return {
        config,
        keys,
        remoteJwks: jose.createRemoteJWKSet(new URL(config.serverMetadata().jwks_uri)),
      };
    })().catch((error) => {
      configs.delete(discoveryUrl);
      throw error;
    });
    configs.set(discoveryUrl, promise);
  }
  return configs.get(discoveryUrl);
}

// Only allow redirects back into this site ("/path", never "//other-site").
function safeReturnTo(value) {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//')
    ? value
    : '';
}

// The login page to show after a failed login, still remembering where the user was going.
function loginErrorUrl(query, returnTo) {
  const params = new URLSearchParams(query);
  if (safeReturnTo(returnTo)) params.set('redirect', returnTo);
  return '/login?' + params;
}

module.exports = { loadKeys, getOidcConfig, safeReturnTo, loginErrorUrl };
