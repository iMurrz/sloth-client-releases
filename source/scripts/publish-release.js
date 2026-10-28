// Publishes only the verified installer, signature, blockmap and update feed.
// GitHub CLI owns authentication; this script never reads or prints its token.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { verifyFile } = require('../src/lib/update-signature');
const root = path.join(__dirname, '..');
async function verifyRelease() {
  const readiness = require('./release-readiness');
  readiness.assertReady();
  const signing = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-File', path.join(__dirname, 'verify-windows-signing.ps1')], { encoding: 'utf8', windowsHide: true });
  if (signing.status !== 0) throw new Error('Public release blocked: Windows binaries need valid timestamped Authenticode signatures. Run npm run signing:verify for details.');
  require('./verify-security-package');
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const config = require('../src/lib/config');
  const owner = config.updates.owner, repo = config.updates.repo;
  if (!owner || owner.startsWith('REPLACE_')) throw new Error('Configure the GitHub update repository first.');
  if (pkg.build.publish[0].owner !== owner || pkg.build.publish[0].repo !== repo) throw new Error('Launcher and publisher repositories do not match.');
  const version = pkg.version;
  if (!/^\d+\.\d+\.\d+(-beta\.\d+)?$/.test(version)) throw new Error('Use a stable version or a numbered beta version.');
  const preview = version.includes('-beta.');
  const channel = pkg.build.publish[0].channel;
  if (preview && channel !== 'beta' || !preview && channel && !['latest', 'stable'].includes(channel)) throw new Error('Package publish channel must match the release version (beta for previews).');
  const name = `Sloth-Client-Setup-${version}.exe`;
  const releaseDir = path.join(root, 'release');
  const files = [name, name + '.sig', name + '.blockmap', preview ? 'beta.yml' : 'latest.yml'].map(file => path.join(releaseDir, file));
  for (const file of files) if (!fs.statSync(file).isFile()) throw new Error(`Missing release file: ${path.basename(file)}`);
  const publicKey = fs.readFileSync(path.join(root, 'src', 'lib', 'update-public-key.pem'), 'utf8');
  if (!await verifyFile(publicKey, files[0], version, name, fs.readFileSync(files[1], 'utf8'))) throw new Error('Installer signature failed verification.');
  const inventoryName = `Sloth-Client-${version}-files.json`;
  const inventoryPath = path.join(releaseDir, inventoryName);
  if (!await verifyFile(publicKey, inventoryPath, version, inventoryName, fs.readFileSync(inventoryPath + '.sig', 'utf8'))) throw new Error('Release inventory signature failed verification.');
  await require('./release-manifest').verifyInventory(path.join(releaseDir, 'win-unpacked'), JSON.parse(fs.readFileSync(inventoryPath, 'utf8')), version);
  files.push(inventoryPath, inventoryPath + '.sig');
  const hash = crypto.createHash('sha512');
  for await (const chunk of fs.createReadStream(files[0])) hash.update(chunk);
  const expected = hash.digest('base64');
  const feed = fs.readFileSync(files[3], 'utf8').replace(/\r\n/g, '\n');
  if (!feed.includes(`version: ${version}\n`) || !feed.includes(`path: ${name}\n`) || !feed.includes(`sha512: ${expected}`) || !feed.includes(`size: ${fs.statSync(files[0]).size}`)) throw new Error('Update feed does not describe this installer. Rebuild the release.');
  const asar = require('@electron/asar');
  const archive = path.join(releaseDir, 'win-unpacked', 'resources', 'app.asar');
  const packedPackage = JSON.parse(asar.extractFile(archive, 'package.json'));
  const packedConfig = asar.extractFile(archive, path.normalize('src/lib/config.js')).toString();
  const packedFeed = fs.readFileSync(path.join(releaseDir, 'win-unpacked', 'resources', 'app-update.yml'), 'utf8').replace(/\r\n/g, '\n');
  const expectedPublisher = require('./windows-signing-config').loadSigningConfig().publisherName;
  const feedPublisher = require('js-yaml').load(packedFeed).publisherName;
  if (!Array.isArray(feedPublisher) || feedPublisher.length !== 1 || feedPublisher[0] !== expectedPublisher) throw new Error('Packaged updater publisher differs from the verified Windows publisher. Rebuild with the signing configuration.');
  if (packedPackage.version !== version || !packedFeed.includes(`owner: ${owner}\n`) || !packedFeed.includes(`repo: ${repo}\n`) || !packedConfig.includes(`owner: '${owner}'`) || !packedConfig.includes(`repo: '${repo}'`)) throw new Error('Packaged launcher has old update settings. Rebuild before publishing.');
  if (preview && !packedFeed.includes('channel: beta\n')) throw new Error('Packaged preview updater is missing its beta channel.');
  return { version, repository: `${owner}/${repo}`, files, preview };
}
function gh(args, { capture = false } = {}) {
  const localCli = path.join(root, '.tools', 'gh', 'bin', 'gh.exe');
  const executable = process.env.SLOTH_GH_PATH || (fs.existsSync(localCli) ? localCli : 'gh');
  const result = spawnSync(executable, args, { cwd: root, encoding: 'utf8', stdio: capture ? 'pipe' : 'inherit', windowsHide: true });
  if (result.error) throw new Error('GitHub CLI is not installed or cannot be started.');
  if (result.status !== 0) throw new Error('GitHub did not complete the operation. Check CLI sign-in and repository permissions.');
  return capture ? result.stdout.trim() : '';
}
async function publish() {
  const release = await verifyRelease();
  console.log(`Verified signed release ${release.version} for ${release.repository}.`);
  if (process.argv.includes('--verify-only')) return;
  gh(['auth', 'status']);
  const metadata = JSON.parse(gh(['repo', 'view', release.repository, '--json', 'visibility,defaultBranchRef'], { capture: true }));
  if (metadata.visibility !== 'PUBLIC' || !metadata.defaultBranchRef?.name) throw new Error('Updates need a public repository with an initial commit.');
  const tag = `v${release.version}`;
  const notes = path.join(root, 'release', `release-notes-${release.version}.md`);
  if (!fs.existsSync(notes)) throw new Error(`Write release notes to ${notes} before publishing.`);
  // A draft prevents clients seeing a half-uploaded feed. Existing versions are never overwritten.
  const args = ['release', 'create', tag, ...release.files, '--repo', release.repository, '--draft', '--target', metadata.defaultBranchRef.name, '--title', `Sloth Client ${release.version}`, '--notes-file', notes];
  if (release.preview) args.push('--prerelease');
  gh(args);
  gh(['release', 'edit', tag, '--repo', release.repository, '--draft=false', release.preview ? '--latest=false' : '--latest']);
  console.log(`Published: https://github.com/${release.repository}/releases/tag/${tag}`);
}
if (require.main === module) publish().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { verifyRelease };
