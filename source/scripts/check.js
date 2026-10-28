#!/usr/bin/env node
// Syntax-checks every launcher script and validates the pinned mod lock.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
  const full = path.join(dir, entry.name);
  return entry.isDirectory() ? walk(full) : entry.name.endsWith('.js') ? [full] : [];
});

let failed = 0;
for (const file of [...walk(path.join(root, 'src')), ...walk(path.join(root, 'scripts'))]) {
  try { execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' }); }
  catch (err) { failed++; console.error(`✗ ${path.relative(root, file)}\n${err.stderr}`); }
}

const lock = require('../src/lib/game/mods-lock.json');
const gameLock = require('../src/lib/game/game-lock.json');
const config = require('../src/lib/config');
const SHA1 = /^[0-9a-f]{40}$/;
const securityLibraries = require('../src/lib/game/security-libraries.json');
const { safeJoin } = require('../src/lib/game/paths');
for (const lib of securityLibraries.libraries) {
  try {
    const artifact = lib.downloads.artifact, url = new URL(artifact.url);
    safeJoin(root, artifact.path);
    if (!/^org\.apache\.logging\.log4j:log4j-(api|core|slf4j2-impl):2\.25\.5$/.test(lib.name) ||
        url.origin !== 'https://repo.maven.apache.org' || url.username || url.password ||
        !/^[a-f0-9]{128}$/.test(artifact.sha512) || !Number.isSafeInteger(artifact.size) || artifact.size <= 0) throw new Error('invalid security pin');
  } catch (err) { failed++; console.error(`✗ Security library ${lib.name}: ${err.message}`); }
}
if (securityLibraries.schema !== 1 || securityLibraries.libraries.length !== 3) { failed++; console.error('✗ Expected three reviewed Log4j security overrides'); }
if (lock.gameVersion !== config.game.version) { failed++; console.error(`✗ mods-lock.json is for ${lock.gameVersion}, config wants ${config.game.version}. Run npm run lock.`); }
if (gameLock.gameVersion !== config.game.version || gameLock.fabric.loaderVersion !== config.game.fabricLoader) { failed++; console.error('✗ game-lock.json does not match config.js. Run npm run lock.'); }
if (!SHA1.test(gameLock.versionJson.sha1)) { failed++; console.error('✗ game-lock.json: Minecraft version JSON is not hash-pinned'); }
for (const lib of gameLock.fabric.profile.libraries) {
  if (!SHA1.test(lib.sha1 || '') || !lib.url.startsWith('https://maven.fabricmc.net/')) { failed++; console.error(`✗ game-lock.json: Fabric library ${lib.name} is not hash-pinned`); }
}
for (const [platform, manifest] of Object.entries(gameLock.java.manifests)) {
  if (!SHA1.test(manifest.sha1) || !manifest.url.startsWith('https://piston-meta.mojang.com/')) { failed++; console.error(`✗ game-lock.json: Java manifest for ${platform} is not hash-pinned`); }
}
for (const mod of lock.mods) {
  for (const file of [mod.file, ...Object.values(mod.pins || {}).map(p => p.file)]) {
    if (!/^[0-9a-f]{128}$/.test(file.sha512) || !file.url.startsWith('https://cdn.modrinth.com/')) { failed++; console.error(`✗ mods-lock entry ${mod.slug} is not hash-pinned to Modrinth`); }
  }
}

const pkg = require('../package.json');
const publish = pkg.build.publish[0];
if (publish.owner !== config.updates.owner || publish.repo !== config.updates.repo) { failed++; console.error('✗ package.json build.publish must match config.updates (owner/repo)'); }
if (!publish.publisherName?.length) { failed++; console.error('✗ build.publish.publisherName is required so update signatures are always verified'); }
try {
  const key = require('node:crypto').createPublicKey(fs.readFileSync(path.join(root, 'src', 'lib', 'update-public-key.pem')));
  if (key.asymmetricKeyType !== 'ed25519') throw new Error('not Ed25519');
} catch (err) { failed++; console.error(`✗ src/lib/update-public-key.pem is missing or invalid (${err.message}). Run npm run keygen.`); }
if (config.updates.owner.startsWith('REPLACE_')) console.warn('! config.updates.owner is still a placeholder: launcher updates are disabled until it is set.');

if (failed) process.exit(1);
// Compatibility regressions must pass before either installer build can proceed.
for (const script of ['test-fabric-versions.js', 'test-mod-inspection.js']) {
  execFileSync(process.execPath, [path.join(__dirname, script)], { stdio: 'inherit' });
}
console.log('All launcher scripts and the mod lock look good.');
