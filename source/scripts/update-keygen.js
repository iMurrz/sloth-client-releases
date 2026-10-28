#!/usr/bin/env node
// One-time setup: creates the Ed25519 key pair that signs launcher updates.
//   private key -> %USERPROFILE%\.sloth-release\update-signing-key.pem  (keep secret, back it up offline)
//   public key  -> src/lib/update-public-key.pem                     (committed, shipped in the launcher)
// Refuses to overwrite an existing private key: rotating it would strand every installed launcher.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

const keyDir = process.env.SLOTH_RELEASE_KEY_DIR || path.join(os.homedir(), '.sloth-release');
const privatePath = path.join(keyDir, 'update-signing-key.pem');
const publicPath = path.join(__dirname, '..', 'src', 'lib', 'update-public-key.pem');

if (fs.existsSync(privatePath)) {
  console.error(`A signing key already exists at ${privatePath}. Not overwriting it.`);
  process.exit(1);
}
const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
fs.mkdirSync(keyDir, { recursive: true });
fs.writeFileSync(privatePath, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600, flag: 'wx' });
fs.writeFileSync(publicPath, publicKey.export({ type: 'spki', format: 'pem' }));
console.log(`Private key: ${privatePath}\n  Keep it secret and back it up offline (e.g. a password manager). Anyone with it can sign updates.`);
console.log(`Public key:  ${path.relative(process.cwd(), publicPath)} (commit this)`);
