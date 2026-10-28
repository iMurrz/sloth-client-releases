const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { getText } = require('../http');

async function readJson(file) {
  return JSON.parse(await fsp.readFile(file, 'utf8'));
}

async function writeAtomic(file, text) {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await fsp.writeFile(tmp, text);
  await fsp.rename(tmp, file);
}

const sha1 = text => crypto.createHash('sha1').update(text).digest('hex');

/**
 * Content-addressed JSON metadata: `expectedSha1` pins the exact bytes. A cached copy is used only when its
 * hash matches, and a fresh download is rejected unless it matches too, so tampered or corrupted metadata
 * can never reach the installer.
 */
async function pinnedJson(url, file, expectedSha1, signal) {
  if (!/^[0-9a-f]{40}$/.test(expectedSha1 || '')) throw new Error(`Metadata ${path.basename(file)} is not hash-pinned`);
  try {
    const cached = await fsp.readFile(file, 'utf8');
    if (sha1(cached) === expectedSha1) return JSON.parse(cached);
  } catch { /* not cached yet */ }
  const text = await getText(url, { signal });
  if (sha1(text) !== expectedSha1) throw new Error(`Checksum mismatch for ${path.basename(file)}; refusing to use it`);
  await writeAtomic(file, text);
  return JSON.parse(text);
}

module.exports = { pinnedJson, readJson };
