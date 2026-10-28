const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const config = require('./config');
const { verifyBytes, verifyFile } = require('./update-signature');
const { Readable, Transform } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const publicKey = fs.readFileSync(path.join(__dirname, 'update-public-key.pem'), 'utf8');
const allowedHosts = new Set(['github.com', 'release-assets.githubusercontent.com', 'objects.githubusercontent.com']);
async function assetResponse(url, signal) {
  let target = new URL(url);
  for (let hop = 0; hop < 6; hop++) {
    if (target.protocol !== 'https:' || target.port || target.username || target.password || !allowedHosts.has(target.hostname)) throw new Error('Unsafe update download destination.');
    const response = await fetch(target, { redirect: 'manual', signal: signal?AbortSignal.any([signal,AbortSignal.timeout(120000)]):AbortSignal.timeout(120000), headers: { 'User-Agent': 'SlothClientUpdater' } });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location'); await response.body?.cancel();
      if (!location) throw new Error('Invalid update redirect.');
      target = new URL(location, target); continue;
    }
    if (!response.ok) { await response.body?.cancel(); throw new Error(`Update service returned HTTP ${response.status}.`); }
    return response;
  }
  throw new Error('Too many update redirects.');
}
async function boundedAsset(url, maxBytes, signal) {
  const response = await assetResponse(url,signal), parts = []; let size = 0;
  for await (const chunk of response.body) { size += chunk.length; if (size > maxBytes) throw new Error('Update metadata exceeds its size limit.'); parts.push(Buffer.from(chunk)); }
  return Buffer.concat(parts);
}
async function prepareDevelopmentUpdate(release, userData, onProgress, signal) {
  if (!/^\d+\.\d+\.\d+$/.test(release.version)) throw new Error('Invalid update version.');
  const base = `https://github.com/${config.updates.owner}/${config.updates.repo}/releases/download/v${release.version}/`;
  const name = 'Sloth-Client-update.json';
  const bytes = await boundedAsset(base + name, 16384,signal);
  const signature = (await boundedAsset(base + name + '.sig', 1024,signal)).toString('utf8');
  if (!verifyBytes(publicKey, bytes, release.version, name, signature)) throw new Error('Update metadata failed Sloth signature verification.');
  const manifest = JSON.parse(bytes.toString('utf8'));
  if (manifest.schema !== 1 || manifest.kind !== 'development' || manifest.version !== release.version || manifest.fileName !== `Sloth-Client-Setup-${release.version}.exe` || !Number.isSafeInteger(manifest.bytes) || manifest.bytes <= 0 || manifest.bytes > 512 * 1024 * 1024 || !/^[a-f0-9]{128}$/.test(manifest.sha512) || typeof manifest.installerSignature !== 'string') throw new Error('Invalid signed development update metadata.');
  const root = path.join(userData, 'development-updates');
  for (const folder of [userData, root]) {
    await fsp.mkdir(folder, { recursive: true });
    if ((await fsp.lstat(folder)).isSymbolicLink()) throw new Error('Linked update storage is unsupported.');
  }
  await pruneDevelopmentUpdates(userData);
  const file = path.join(root, `${crypto.randomUUID()}-${manifest.fileName}`), part = file + '.part';
  let received = 0, lastProgress = 0; const hash = crypto.createHash('sha512');
  try {
    const response = await assetResponse(base + manifest.fileName,signal);
    const meter = new Transform({ transform(chunk, encoding, callback) {
      received += chunk.length;
      if (received > manifest.bytes) return callback(new Error('Update exceeds its signed size.'));
      hash.update(chunk);
      if (Date.now() - lastProgress > 200) { lastProgress = Date.now(); onProgress(Math.round(received / manifest.bytes * 100)); }
      callback(null, chunk);
    } });
    await pipeline(Readable.fromWeb(response.body), meter, fs.createWriteStream(part, { flags: 'wx' }),{signal});
    if (received !== manifest.bytes || hash.digest('hex') !== manifest.sha512) throw new Error('Update size or checksum does not match its signed manifest.');
    if (!await verifyFile(publicKey, part, manifest.version, manifest.fileName, manifest.installerSignature)) throw new Error('Installer failed Sloth signature verification.');
    await fsp.rename(part, file);
    return { file, manifest };
  } catch (error) { await fsp.unlink(part).catch(() => {}); throw error; }
}
/** Deletes installers and partial downloads this updater left behind. Only files with the updater's own naming are touched. */
async function pruneDevelopmentUpdates(userData, keepFile = null) {
  const root = path.join(userData, 'development-updates');
  let names;
  try { names = await fsp.readdir(root); } catch { return; }
  for (const name of names) {
    const target = path.join(root, name);
    if (keepFile && path.resolve(target) === path.resolve(keepFile)) continue;
    if (!/^[0-9a-f-]{36}-Sloth-Client-Setup-\d+\.\d+\.\d+\.exe(\.part)?$/i.test(name)) continue;
    try { if ((await fsp.lstat(target)).isFile()) await fsp.unlink(target); } catch { /* In use or already gone. */ }
  }
}
async function verifyPreparedUpdate(prepared) {
  if (!prepared || (await fsp.lstat(prepared.file)).isSymbolicLink()) throw new Error('Prepared update is unavailable or linked.');
  if (!await verifyFile(publicKey, prepared.file, prepared.manifest.version, prepared.manifest.fileName, prepared.manifest.installerSignature)) throw new Error('Installer changed after download. Check for updates again.');
}
module.exports = { prepareDevelopmentUpdate, verifyPreparedUpdate, pruneDevelopmentUpdates };
