// electron-builder afterAllArtifactBuild hook: signs each NSIS installer with the release key and returns the
// .sig files so they are published next to the installer. Publishing without the key fails the release.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { signFile, verifyFile } = require('../src/lib/update-signature');

const keyPath = process.env.SLOTH_UPDATE_KEY || path.join(os.homedir(), '.sloth-release', 'update-signing-key.pem');
const publicKey = fs.readFileSync(path.join(__dirname, '..', 'src', 'lib', 'update-public-key.pem'), 'utf8');

module.exports = async function signUpdates(buildResult) {
  const publishing = process.argv.includes('always') || process.env.SLOTH_RELEASE === '1';
  if (publishing) require('./release-readiness').assertReady();
  if (!fs.existsSync(keyPath)) {
    if (publishing) throw new Error(`Update signing key not found at ${keyPath}. Refusing to publish an unsigned update.`);
    console.warn(`  • update signing key not found (${keyPath}); installer left unsigned (local build only)`);
    return [];
  }
  const privateKey = fs.readFileSync(keyPath, 'utf8');
  const derived = crypto.createPublicKey(privateKey).export({ type: 'spki', format: 'pem' });
  if (derived.trim() !== publicKey.trim()) throw new Error('The signing key does not match src/lib/update-public-key.pem');

  const version = buildResult.configuration?.extraMetadata?.version || require('../package.json').version;
  const signatures = [];
  // Authenticate every distributed application file, including external JARs and assets.
  // This provides release provenance; it is not a runtime filesystem sandbox.
  const releaseRoot = path.resolve(buildResult.outDir || path.join(__dirname, '..', 'release'));
  const { inventory } = require('./release-manifest');
  const manifestName = `Sloth-Client-${version}-files.json`;
  const manifestPath = path.join(releaseRoot, manifestName);
  fs.writeFileSync(manifestPath, JSON.stringify({ schema: 1, version, files: await inventory(path.join(releaseRoot, 'win-unpacked')) }, null, 2) + '\n');
  const manifestSignature = await signFile(privateKey, manifestPath, version, manifestName);
  if (!await verifyFile(publicKey, manifestPath, version, manifestName, manifestSignature)) throw new Error('Release inventory signing failed');
  fs.writeFileSync(manifestPath + '.sig', manifestSignature + '\n');
  signatures.push(manifestPath, manifestPath + '.sig');
  for (const artifact of buildResult.artifactPaths) {
    if (!artifact.endsWith('.exe') || artifact.includes('__uninstaller')) continue;
    const fileName = path.basename(artifact);
    const signature = await signFile(privateKey, artifact, version, fileName);
    if (!(await verifyFile(publicKey, artifact, version, fileName, signature))) throw new Error(`Self-check failed for ${fileName}`);
    fs.writeFileSync(`${artifact}.sig`, `${signature}\n`);
    signatures.push(`${artifact}.sig`);
    if (buildResult.configuration?.extraMetadata?.slothDevelopmentUpdates === true) {
      const updateName = 'Sloth-Client-update.json';
      const updatePath = path.join(releaseRoot, updateName);
      const digest = crypto.createHash('sha512');
      for await (const chunk of fs.createReadStream(artifact)) digest.update(chunk);
      fs.writeFileSync(updatePath, JSON.stringify({ schema: 1, kind: 'development', version, fileName, bytes: fs.statSync(artifact).size, sha512: digest.digest('hex'), installerSignature: signature }) + '\n');
      fs.writeFileSync(updatePath + '.sig', await signFile(privateKey, updatePath, version, updateName) + '\n');
      signatures.push(updatePath, updatePath + '.sig');
    }
    console.log(`  • signed update  file=${fileName}.sig`);
  }
  return signatures;
};
