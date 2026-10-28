const fs = require('node:fs');
const crypto = require('node:crypto');
const { pipeline } = require('node:stream/promises');

/**
 * Ed25519 signatures for launcher updates. The release machine signs each installer with a private key that
 * never leaves it; the launcher ships only the public key and refuses any update whose signature doesn't
 * verify. This holds even if the GitHub account or release were compromised.
 *
 * The signed message binds the file's SHA-512 to its version and file name, so a validly signed old
 * installer can't be replayed as a different version.
 */
const CONTEXT = 'sloth-launcher-update:v1';

async function sha512File(file) {
  const hash = crypto.createHash('sha512');
  await pipeline(fs.createReadStream(file), hash);
  return hash.digest('hex');
}

const message = (version, fileName, sha512) => Buffer.from(`${CONTEXT}\n${version}\n${fileName}\n${sha512}`, 'utf8');

async function signFile(privateKeyPem, file, version, fileName) {
  const digest = await sha512File(file);
  return crypto.sign(null, message(version, fileName, digest), privateKeyPem).toString('base64');
}

async function verifyFile(publicKeyPem, file, version, fileName, signatureBase64) {
  if (!/^[A-Za-z0-9+/]{86}==$/.test(signatureBase64.trim())) return false;
  const digest = await sha512File(file);
  return crypto.verify(null, message(version, fileName, digest), publicKeyPem, Buffer.from(signatureBase64.trim(), 'base64'));
}

function verifyBytes(publicKeyPem, bytes, version, fileName, signatureBase64) {
  if (!/^[A-Za-z0-9+/]{86}==$/.test(signatureBase64.trim())) return false;
  const digest = crypto.createHash('sha512').update(bytes).digest('hex');
  return crypto.verify(null, message(version, fileName, digest), publicKeyPem, Buffer.from(signatureBase64.trim(), 'base64'));
}
module.exports = { signFile, verifyFile, verifyBytes };
