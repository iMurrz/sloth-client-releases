const fs = require('node:fs');
const path = require('node:path');
const { verifyFile } = require('../src/lib/update-signature');
const root = path.join(__dirname, '..');
const releaseRoot = path.join(root, 'release', 'sloth-development');
async function verifyDevelopment() {
  process.env.SLOTH_VERIFY_RELEASE_DIR = releaseRoot;
  require('./verify-security-package');
  const { version } = require('../package.json');
  const publicKey = fs.readFileSync(path.join(root, 'src/lib/update-public-key.pem'), 'utf8');
  for (const name of [`Sloth-Client-Setup-${version}.exe`, `Sloth-Client-${version}-files.json`, 'Sloth-Client-update.json']) {
    const file = path.join(releaseRoot, name);
    if (!await verifyFile(publicKey, file, version, name, fs.readFileSync(file + '.sig', 'utf8'))) throw new Error('Development artifact integrity verification failed: ' + name);
  }
  const update = JSON.parse(fs.readFileSync(path.join(releaseRoot, 'Sloth-Client-update.json'), 'utf8'));
  const installer = path.join(releaseRoot, `Sloth-Client-Setup-${version}.exe`);
  const digest = require('node:crypto').createHash('sha512');
  for await (const chunk of fs.createReadStream(installer)) digest.update(chunk);
  if (update.schema !== 1 || update.kind !== 'development' || update.version !== version || update.fileName !== path.basename(installer) || update.bytes !== fs.statSync(installer).size || update.sha512 !== digest.digest('hex') || !await verifyFile(publicKey, installer, version, update.fileName, update.installerSignature)) throw new Error('Signed update feed does not match the installer.');
  await require('./release-manifest').verifyInventory(path.join(releaseRoot, 'win-unpacked'), JSON.parse(fs.readFileSync(path.join(releaseRoot, `Sloth-Client-${version}-files.json`), 'utf8')), version);
  console.log('Development package and signed inventory match. Windows trusted publisher signing is still pending.');
}
if (require.main === module) verifyDevelopment().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { verifyDevelopment };
