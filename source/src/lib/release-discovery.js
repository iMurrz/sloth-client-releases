const config = require('./config');
const { request } = require('./http');
const semver = require('semver');
async function discoverRelease(installedVersion) {
  const { owner, repo } = config.updates;
  if (!/^[A-Za-z0-9-]+$/.test(owner) || !/^[A-Za-z0-9_.-]+$/.test(repo)) throw new Error('Invalid release repository configuration.');
  const response = await request(`https://api.github.com/repos/${owner}/${repo}/releases/latest`, { timeout: 15000, retries: 0, redirect: 'error' });
  const chunks = []; let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > 512 * 1024) { await response.body.cancel().catch(() => {}); throw new Error('Release metadata exceeds its size limit.'); }
    chunks.push(Buffer.from(chunk));
  }
  const release = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if (release.draft || release.prerelease || !/^v\d+\.\d+\.\d+$/.test(release.tag_name || '') || !Array.isArray(release.assets)) throw new Error('Invalid stable release metadata.');
  const version = release.tag_name.slice(1);
  if (!semver.valid(installedVersion)) throw new Error('Installed version is invalid.');
  const name = `Sloth-Client-Setup-${version}.exe`;
  const installer = release.assets.find(asset => asset.name === name && asset.state === 'uploaded' && Number.isSafeInteger(asset.size) && asset.size > 0);
  if (!installer) throw new Error('Latest release has no complete Sloth installer.');
  return { version, newer: semver.gt(version, installedVersion), hasDevelopmentUpdate: ['Sloth-Client-update.json', 'Sloth-Client-update.json.sig'].every(name => release.assets.some(asset => asset.name === name && asset.state === 'uploaded')), hasFeed: release.assets.some(asset => asset.name === 'latest.yml' && asset.state === 'uploaded'),
    url: `https://github.com/${owner}/${repo}/releases/tag/v${version}`,
    notes: String(release.body || '').replace(/<[^>]*>/g, '').slice(0, 12000) };
}
module.exports = { discoverRelease };
