// Add only the requested CUI release without updating unrelated pinned mods.
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { openZip } = require('../src/lib/zip');
const { satisfies } = require('../src/lib/game/fabric-versions');
async function main() {
  const response = await fetch('https://api.modrinth.com/v2/version/SD1ZtHLA', { headers: { 'User-Agent': 'SlothLauncher/mod-pin' }, signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error('CUI release metadata unavailable.');
  const version = await response.json();
  if (version.project_id !== 'NSLJJooQ' || !version.game_versions.includes('1.21.11') || !version.loaders.includes('fabric')) throw new Error('Unexpected CUI release.');
  const file = version.files.find(f => f.primary);
  if (!file || !file.url.startsWith('https://cdn.modrinth.com/data/NSLJJooQ/') || file.size > 10 * 1024 ** 2) throw new Error('Unexpected CUI file.');
  const download = await fetch(file.url, { redirect: 'error', signal: AbortSignal.timeout(20000) });
  if (!download.ok) throw new Error('CUI download unavailable.');
  const bytes = Buffer.from(await download.arrayBuffer());
  if (bytes.length !== file.size || crypto.createHash('sha512').update(bytes).digest('hex') !== file.hashes.sha512) throw new Error('CUI integrity mismatch.');
  const temp = path.join(os.tmpdir(), 'sloth-cui-' + crypto.randomUUID() + '.jar');
  await fs.writeFile(temp, bytes, { flag: 'wx' });
  let meta; const included = [];
  try {
    const zip = await openZip(temp);
    try {
      meta = JSON.parse((await zip.read(zip.entries.find(e => e.name === 'fabric.mod.json'))).toString('utf8'));
      for (const jar of meta.jars || []) {
        const entry = zip.entries.find(e => e.name === jar.file);
        if (!entry) throw new Error('Missing bundled CUI dependency.');
        const nestedFile = path.join(os.tmpdir(), 'sloth-cui-nested-' + crypto.randomUUID() + '.jar');
        try {
          await fs.writeFile(nestedFile, await zip.read(entry), { flag: 'wx' });
          const nested = await openZip(nestedFile);
          try { included.push(JSON.parse((await nested.read(nested.entries.find(e => e.name === 'fabric.mod.json'))).toString('utf8'))); }
          finally { await nested.close(); }
        } finally { await fs.unlink(nestedFile).catch(() => {}); }
      }
    }
    finally { await zip.close(); }
  } finally { await fs.unlink(temp); }
  const lockFile = path.join(__dirname, '../src/lib/game/mods-lock.json');
  const lock = JSON.parse(await fs.readFile(lockFile, 'utf8'));
  const api = lock.mods.find(m => m.slug === 'fabric-api');
  const apiResponse = await fetch(api.file.url, { redirect: 'error', signal: AbortSignal.timeout(20000) });
  if (!apiResponse.ok) throw new Error('Pinned Fabric API is unavailable.');
  const apiBytes = Buffer.from(await apiResponse.arrayBuffer());
  if (crypto.createHash('sha512').update(apiBytes).digest('hex') !== api.file.sha512) throw new Error('Fabric API integrity mismatch.');
  const apiFile = path.join(os.tmpdir(), 'sloth-cui-api-' + crypto.randomUUID() + '.jar');
  const apiModules = [];
  await fs.writeFile(apiFile, apiBytes, { flag: 'wx' });
  try {
    const zip = await openZip(apiFile);
    try {
      const apiMeta = JSON.parse((await zip.read(zip.entries.find(e => e.name === 'fabric.mod.json'))).toString('utf8'));
      for (const jar of apiMeta.jars || []) {
        const nestedFile = path.join(os.tmpdir(), 'sloth-cui-api-nested-' + crypto.randomUUID() + '.jar');
        try {
          await fs.writeFile(nestedFile, await zip.read(zip.entries.find(e => e.name === jar.file)), { flag: 'wx' });
          const nested = await openZip(nestedFile);
          try { apiModules.push(JSON.parse((await nested.read(nested.entries.find(e => e.name === 'fabric.mod.json'))).toString('utf8'))); }
          finally { await nested.close(); }
        } finally { await fs.unlink(nestedFile).catch(() => {}); }
      }
    } finally { await zip.close(); }
  } finally { await fs.unlink(apiFile); }
  const available = { minecraft: '1.21.11', fabricloader: '0.19.5', java: '21', ...Object.fromEntries([...included, ...apiModules].map(m => [m.id, m.version])) };
  for (const item of [meta, ...included]) for (const [id, requirement] of Object.entries(item.depends || {})) {
    const present = available[id];
    if (!present || !satisfies(present, requirement)) throw new Error('Unresolved CUI dependency: ' + id);
  }
  const entry = { slug: 'worldedit-cui', kind: 'mod', name: 'WorldEdit CUI', description: 'Shows WorldEdit selection outlines. Requires WorldEdit on the server and permission to use it. Configure colors through Mod Menu.', category: 'optional', defaultEnabled: true, version: version.version_number, versionId: version.id, file: { url: file.url, filename: file.filename, sha512: file.hashes.sha512, size: file.size }, dependencies: ['fabric-api'], source: 'https://github.com/EngineHub/WorldEditCUI', license: 'EPL-2.0' };
  lock.mods = lock.mods.filter(m => m.slug !== entry.slug); lock.mods.push(entry);
  lock.generatedAt = new Date().toISOString();
  await fs.writeFile(lockFile, JSON.stringify(lock, null, 2) + '\n');
  console.log(JSON.stringify({ version: version.version_number, bytes: bytes.length, fabricMetadata: meta.depends, bundledJars: meta.jars?.length || 0, pinned: true }));
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
