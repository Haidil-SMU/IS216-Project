// Generates this app's Singpass keys (run once: `pnpm keys`).
//  - sig: ES256 key that signs the client assertion sent to Singpass
//  - enc: ECDH-ES+A256KW key that Singpass uses to encrypt the ID token and Myinfo data
// The private keys stay in server/keys/ (git-ignored); only the public halves
// are published at /api/auth/singpass/jwks.
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const jose = require('jose');

const KEYS_FILE = path.join(__dirname, '..', 'keys', 'singpass-jwks.json');

async function exportPrivate(alg, use) {
  const { privateKey } = await jose.generateKeyPair(alg, { crv: 'P-256', extractable: true });
  const jwk = await jose.exportJWK(privateKey);
  return { ...jwk, kid: `ecohome-${use}-${randomUUID().slice(0, 8)}`, use, alg };
}

async function main() {
  if (fs.existsSync(KEYS_FILE) && !process.argv.includes('--force')) {
    console.log(`Keys already exist at ${KEYS_FILE} (use --force to replace them).`);
    return;
  }
  const keys = [await exportPrivate('ES256', 'sig'), await exportPrivate('ECDH-ES+A256KW', 'enc')];
  fs.mkdirSync(path.dirname(KEYS_FILE), { recursive: true });
  fs.writeFileSync(KEYS_FILE, JSON.stringify({ keys }, null, 2), { mode: 0o600 });
  console.log(`Singpass keys written to ${KEYS_FILE}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
