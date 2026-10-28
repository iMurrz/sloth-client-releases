const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { openZip } = require('../src/lib/zip');
const { satisfies } = require('../src/lib/game/fabric-versions');
async function main() {
  const response = await fetch('https://api.modrinth.com/v2/version/DEx5S3uA', { headers: { 'User-Agent': 'SlothLauncher/mod-pin' }, signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error('Flat Items metadata unavailable.');
  const version = await response.json();
  if (version.project_id !== 'fqmegrgv' || !version.game_versions.includes('1.21.11') || !version.loaders.includes('fabric')) throw new Error('Unexpected Flat Items version.');
  const file = version.files.find(f => f.primary);
  if (!file || !file.url.startsWith('https://cdn.modrinth.com/data/fqmegrgv/')) throw new Error('Unexpected Flat Items file.');
  const res = await fetch(file.url, { redirect: 'error', signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error('Flat Items unavailable.');
  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.length !== file.size || bytes.length > 5 * 1024 ** 2 || crypto.createHash('sha512').update(bytes).digest('hex') !== file.hashes.sha512) throw new Error('Flat Items integrity mismatch.');
  const temp = path.join(os.tmpdir(), 'sloth-flat-items-' + crypto.randomUUID() + '.jar');
  await fs.writeFile(temp, bytes, { flag: 'wx' }); let meta;
  try { const zip = await openZip(temp); try { meta = JSON.parse((await zip.read(zip.entries.find(e => e.name === 'fabric.mod.json'))).toString('utf8')); } finally { await zip.close(); } } finally { await fs.unlink(temp); }
  const lockFile = path.join(__dirname, '../src/lib/game/mods-lock.json');
  const lock = JSON.parse(await fs.readFile(lockFile, 'utf8'));
  const available = { minecraft: '1.21.11', java: '21', fabricloader: '0.19.5', 'fabric-api': lock.mods.find(m => m.slug === 'fabric-api').version };
  for (const [id, requirement] of Object.entries(meta.depends || {})) if (!available[id] || !satisfies(available[id], requirement)) throw new Error('Unresolved Flat Items dependency: ' + id);
  lock.mods = lock.mods.filter(m => m.slug !== 'flat-items');
  lock.mods.push({ slug: 'flat-items', kind: 'mod', name: '2D Items · Flat Items', description: 'Dropped items face the camera in a flat retro style. Configure billboard and 3D-model options through Mod Menu.', category: 'optional', defaultEnabled: true, version: version.version_number, versionId: version.id, file: { url: file.url, filename: file.filename, sha512: file.hashes.sha512, size: file.size }, dependencies: ['fabric-api'], source: 'https://github.com/beamingblue/flat-items', license: 'MIT' });
  lock.generatedAt = new Date().toISOString(); await fs.writeFile(lockFile, JSON.stringify(lock, null, 2) + '\n');
  console.log(JSON.stringify({ pinned: true, version: version.version_number, bytes: bytes.length, dependencies: meta.depends }));
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
