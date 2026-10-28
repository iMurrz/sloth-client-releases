const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const asar = require('@electron/asar');
const root = path.join(__dirname, '..');
const releaseRoot = path.resolve(process.env.SLOTH_VERIFY_RELEASE_DIR || path.join(root, 'release'));
const archive = path.join(releaseRoot, 'win-unpacked/resources/app.asar');
const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)]);
const files = walk(path.join(root, 'src'));
for (const file of files) assert.deepEqual(asar.extractFile(archive, path.relative(root, file)), fs.readFileSync(file), 'Packaged runtime differs: ' + path.relative(root, file));
const pkg = require('../package.json'); assert.equal(JSON.parse(asar.extractFile(archive, 'package.json')).version, pkg.version);
let inspected = 0;
for (const entry of asar.listPackage(archive)) {
  const relative = entry.replace(/^[\\/]/, '');
  if (/(^|[\\/])(accounts\.json|session-seal-key\.bin|.*api-key\.bin|update-signing-key\.pem|\.env(?:\..*)?)$/i.test(relative)) throw new Error('Forbidden private file included');
  if (/\.(js|json|html|css|pem)$/i.test(relative)) {
    const text = asar.extractFile(archive, relative).toString(); inspected++;
    if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]+?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(text)) throw new Error('Private key material included');
  }
}
const packagedMods = path.join(releaseRoot, 'win-unpacked/resources/mods');
const jar = fs.readdirSync(packagedMods).find(name => /^sloth-client-.*\.jar$/.test(name)); assert.ok(jar);
const digest = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
assert.equal(digest(path.join(packagedMods, jar)), digest(path.join(root, 'client-mod/build/libs', jar)));
assert.ok(!fs.existsSync(path.join(releaseRoot, 'win-unpacked/resources/resourcepacks')), 'Personal resource packs must not be bundled');
console.log(JSON.stringify({ version: pkg.version, runtimeFilesMatched: files.length, textFilesInspected: inspected, forbiddenFilesOrPrivateKeyBlocks: 0, nativeSha256: digest(path.join(packagedMods, jar)) }, null, 2));
