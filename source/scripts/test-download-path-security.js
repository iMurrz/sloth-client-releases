const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { download, fileMatches } = require('../src/lib/http');
const { safeJoin } = require('../src/lib/game/paths');
const { openZip } = require('../src/lib/zip');
const digest = bytes => crypto.createHash('sha1').update(bytes).digest('hex');
let root, passed = 0;
const originalFetch = global.fetch;
async function test(name, fn) { await fn(); passed++; console.log('PASS ' + name); }
// Stored ZIP fixtures; extraction security tests do not execute their contents.
function archive(entries) {
  const local = [], central = []; let offset = 0;
  for (const [name, text] of entries) {
    const n = Buffer.from(name), data = Buffer.from(text), h = Buffer.alloc(30), c = Buffer.alloc(46);
    h.writeUInt32LE(0x04034b50); h.writeUInt32LE(data.length, 18); h.writeUInt32LE(data.length, 22); h.writeUInt16LE(n.length, 26);
    c.writeUInt32LE(0x02014b50); c.writeUInt32LE(data.length, 20); c.writeUInt32LE(data.length, 24); c.writeUInt16LE(n.length, 28); c.writeUInt32LE(offset, 42);
    local.push(h, n, data); central.push(c, n); offset += h.length + n.length + data.length;
  }
  const directory = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, directory, end]);
}
async function extract(entries, dest) {
  const file = path.join(root, crypto.randomUUID() + '.zip'); await fs.writeFile(file, archive(entries));
  const zip = await openZip(file); try { await zip.extract(dest); } finally { await zip.close(); }
}
(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'sloth-download-security-'));
  const bytes = Buffer.from('trusted bytes'), expected = { sha1: digest(bytes), size: bytes.length, retries: 0 };
  const dest = path.join(root, 'artifact.jar');
  await test('verified HTTPS artifact downloads successfully', async () => {
    global.fetch = async (_url, options) => { assert.equal(options.redirect, 'manual'); return new Response(bytes); };
    await download('https://cdn.modrinth.com/file', dest, expected); assert.deepEqual(await fs.readFile(dest), bytes);
  });
  await test('same-origin HTTPS redirect is supported', async () => {
    let calls = 0; global.fetch = async () => ++calls === 1 ? new Response(null, { status: 302, headers: { location: '/next' } }) : new Response(bytes);
    await download('https://cdn.modrinth.com/file', dest, expected); assert.equal(calls, 2);
  });
  for (const target of ['http://cdn.modrinth.com/file', 'https://127.0.0.1/file', 'https://attacker.invalid/file', 'https://cdn.modrinth.com:8443/file', 'https://user:pass@cdn.modrinth.com/file']) {
    await test('redirect blocked before contacting ' + target, async () => {
      let calls = 0; global.fetch = async () => { calls++; return new Response(null, { status: 302, headers: { location: target } }); };
      await assert.rejects(download('https://cdn.modrinth.com/file', dest, expected), /unsafe/); assert.equal(calls, 1); assert.deepEqual(await fs.readFile(dest), bytes);
    });
  }
  await test('redirect loop is bounded', async () => {
    let calls = 0; global.fetch = async () => { calls++; return new Response(null, { status: 302, headers: { location: '/loop' } }); };
    await assert.rejects(download('https://cdn.modrinth.com/file', dest, expected), /excessive/); assert.equal(calls, 6);
  });
  await test('oversized body stops and leaves original file intact', async () => {
    global.fetch = async () => new Response(Buffer.alloc(bytes.length + 1));
    await assert.rejects(download('https://cdn.modrinth.com/file', dest, expected), /size limit/); assert.deepEqual(await fs.readFile(dest), bytes);
    assert.equal((await fs.readdir(root)).some(n => n.endsWith('.part')), false);
  });
  await test('same-size bad checksum leaves original intact', async () => {
    global.fetch = async () => new Response(Buffer.alloc(bytes.length));
    await assert.rejects(download('https://cdn.modrinth.com/file', dest, expected), /Checksum/); assert.deepEqual(await fs.readFile(dest), bytes);
  });
  await test('malformed hash and size rejected before network', async () => {
    global.fetch = async () => { throw new Error('network must not run'); };
    await assert.rejects(download('https://cdn.modrinth.com/file', dest, { sha1: 'oops' }), /checksum/);
    await assert.rejects(download('https://cdn.modrinth.com/file', dest, { ...expected, size: -1 }), /size/);
  });
  await test('deep verification catches same-size cached tampering', async () => {
    await fs.writeFile(dest, Buffer.alloc(bytes.length)); assert.equal(await fileMatches(dest, expected, true), false);
  });
  await test('linked cached artifacts are never accepted', async () => {
    const link = path.join(root, 'linked-dir'); await fs.symlink(root, link, 'junction');
    assert.equal(await fileMatches(link, {}), false); await fs.unlink(link);
  });
  await test('portable paths reject traversal, absolute paths, ADS and Windows aliases', async () => {
    for (const name of ['../escape', 'a/../../escape', '/absolute', 'C:\\escape', '\\\\server\\share', 'file:stream', 'NUL.jar', 'dir/COM1.txt', 'name.', 'name ', 'a/./b', 'a\0b']) assert.throws(() => safeJoin(root, name), /Unsafe/);
    assert.equal(safeJoin(root, 'mods/good.jar'), path.join(root, 'mods', 'good.jar'));
  });
  await test('archive extracts ordinary nested content', async () => { const folder = path.join(root, 'normal'); await extract([['config/test.txt', 'safe']], folder); assert.equal(await fs.readFile(path.join(folder, 'config/test.txt'), 'utf8'), 'safe'); });
  await test('archive traversal is rejected', async () => { await assert.rejects(extract([['../escape.txt', 'bad']], path.join(root, 'traversal')), /Unsafe/); await assert.rejects(fs.access(path.join(root, 'escape.txt'))); });
  await test('archive cannot write alternate data streams', async () => { await assert.rejects(extract([['config/file:stream', 'bad']], path.join(root, 'ads')), /Unsafe/); });
  await test('case-colliding duplicate archive files are rejected', async () => { await assert.rejects(extract([['mods/a.jar', 'first'], ['mods/A.jar', 'second']], path.join(root, 'duplicate')), /Duplicate/); });
  await test('archive cannot overwrite an existing file', async () => {
    const folder = path.join(root, 'existing'); await fs.mkdir(folder); await fs.writeFile(path.join(folder, 'a.txt'), 'original');
    await assert.rejects(extract([['a.txt', 'bad']], folder), e => e.code === 'EEXIST'); assert.equal(await fs.readFile(path.join(folder, 'a.txt'), 'utf8'), 'original');
  });
  await test('archive cannot escape through an existing directory junction', async () => {
    const folder = path.join(root, 'junction'), outside = path.join(root, 'outside'); await fs.mkdir(folder); await fs.mkdir(outside); await fs.symlink(outside, path.join(folder, 'config'), 'junction');
    await assert.rejects(extract([['config/escaped.txt', 'bad']], folder), /Linked/); await assert.rejects(fs.access(path.join(outside, 'escaped.txt'))); await fs.unlink(path.join(folder, 'config'));
  });
  await test('routine game preparation repairs tampered executable files', async () => {
    const modules = ['meta', 'java', 'mods'].map(name => require.resolve('../src/lib/game/' + name));
    const saved = modules.map(id => require.cache[id]); const installerId = require.resolve('../src/lib/game/installer'); const savedInstaller = require.cache[installerId];
    const lock = require('../src/lib/game/game-lock.json'); const game = path.join(root, 'game');
    const overrides = require('../src/lib/game/security-libraries.json');
    const assetHash = digest(bytes), gameJar = path.join(game, 'versions', lock.gameVersion, lock.gameVersion + '.jar');
    const javaFile = path.join(game, 'runtime', 'synthetic.exe'), modFile = path.join(game, 'instances', 'sloth', 'mods', 'synthetic.jar');
    const task = (dest, group) => ({ url: 'https://piston-data.mojang.com/synthetic', dest, group, sha1: assetHash, size: bytes.length });
    require.cache[modules[0]] = { exports: { pinnedJson: async url => url === 'https://example.invalid/index' ? { objects: { test: { hash: assetHash, size: bytes.length } } } : { id: lock.gameVersion, type: 'release', libraries: [], downloads: { client: task(gameJar, 'client') }, assetIndex: { id: 'synthetic', url: 'https://example.invalid/index', sha1: assetHash } } } };
    require.cache[modules[1]] = { exports: { planJavaRuntime: async () => ({ tasks: [task(javaFile, 'java')], javaPath: javaFile, finalize: async () => {} }) } };
    require.cache[modules[2]] = { exports: { planMods: async () => ({ tasks: [task(modFile, 'mod')], enabled: [], finalize: async () => {} }) } };
    delete require.cache[installerId];
    try {
      const { prepareGame } = require(installerId), libraryFile = path.join(game, 'libraries', 'synthetic', 'logging.jar');
      for (const file of [gameJar, javaFile, modFile, libraryFile]) { await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, Buffer.alloc(bytes.length)); }
      // Pinned Fabric libraries have their real hashes: supply synthetic bytes only for our fixture tasks.
      global.fetch = async input => { if (!String(input).includes('synthetic') && !String(input).includes('/' + assetHash)) throw new Error('Unexpected library download'); return new Response(bytes); };
      // Keep authentic Fabric metadata out of this fixture; restore it in finally.
      const libraries = lock.fabric.profile.libraries, security = overrides.libraries;
      lock.fabric.profile.libraries = [];
      overrides.libraries = [{ name: 'synthetic:logging:1', downloads: { artifact: { ...task(libraryFile, 'libraries'), path: 'synthetic/logging.jar' } } }];
      try { const result = await prepareGame({ root: game, gameVersion: lock.gameVersion, loaderVersion: lock.fabric.loaderVersion }); assert.equal(result.downloaded.files, 5); for (const file of [gameJar, javaFile, modFile, libraryFile]) assert.deepEqual(await fs.readFile(file), bytes); }
      finally { lock.fabric.profile.libraries = libraries; overrides.libraries = security; }
    } finally { modules.forEach((id, i) => { if (saved[i]) require.cache[id] = saved[i]; else delete require.cache[id]; }); if (savedInstaller) require.cache[installerId] = savedInstaller; else delete require.cache[installerId]; }
  });
  console.log(`\n${passed}/${passed} download/path security tests passed`);
})().catch(error => { console.error(error.stack); process.exitCode = 1; }).finally(async () => { global.fetch = originalFetch; if (root) await fs.rm(root, { recursive: true, force: true }); });
