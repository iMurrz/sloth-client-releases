const fsp = require('node:fs/promises');
const path = require('node:path');
const { getJson, postJson, download } = require('./http');

// Modrinth API v2 (https://docs.modrinth.com/api/). Requests go out with the launcher's own User-Agent.
const API = 'https://api.modrinth.com/v2';
const SAFE_FILENAME = /^[A-Za-z0-9 _.+()'!-]+\.(jar|zip)$/;
const ID = /^[A-Za-z0-9]{8}$/;

const q = value => encodeURIComponent(JSON.stringify(value));

/** sha1 -> version, for identifying jars from another launcher. */
async function versionsByHash(sha1s) {
  if (!sha1s.length) return {};
  return postJson(`${API}/version_files`, { hashes: sha1s, algorithm: 'sha1' });
}

async function projects(ids) {
  const clean = ids.filter(id => ID.test(id));
  return clean.length ? getJson(`${API}/projects?ids=${q(clean)}`) : [];
}

/**
 * A project's build for this game version and loader, or null. `preferRelease` picks the newest stable build
 * (for curated lists); otherwise the newest build of any channel (matching what a player already had).
 */
async function compatibleVersion(projectId, gameVersion, loader, { preferRelease = true } = {}) {
  if (!ID.test(projectId) && !/^[a-z0-9-_]{2,64}$/.test(projectId)) return null;
  const loaders = loader ? `&loaders=${q([loader])}` : '';
  const versions = await getJson(`${API}/project/${projectId}/version?game_versions=${q([gameVersion])}${loaders}`);
  return (preferRelease && versions.find(v => v.version_type === 'release')) || versions[0] || null;
}

/** Every build of a project for this game version and loader, newest first. */
async function compatibleVersions(projectId, gameVersion, loader) {
  if (!ID.test(projectId) && !/^[a-z0-9-_]{2,64}$/.test(projectId)) return [];
  const loaders = loader ? `&loaders=${q([loader])}` : '';
  return getJson(`${API}/project/${projectId}/version?game_versions=${q([gameVersion])}${loaders}`);
}

async function categoryTags() {
  return getJson(`${API}/tag/category`);
}

async function version(versionId) {
  if (!ID.test(versionId)) return null;
  return getJson(`${API}/version/${versionId}`);
}

async function search({ query = '', type = 'mod', gameVersion, loader, categories = [], sort = 'downloads', offset = 0, limit = 20 }) {
  const facets = [[`project_type:${type}`], [`versions:${gameVersion}`]];
  if (loader && ['mod', 'modpack'].includes(type)) facets.push([`categories:${loader}`]);
  for (const c of categories) facets.push([`categories:${c}`]);
  const index = ['relevance', 'downloads', 'follows', 'newest', 'updated'].includes(sort) ? sort : 'downloads';
  return getJson(`${API}/search?query=${encodeURIComponent(query.slice(0, 100))}&facets=${q(facets)}&index=${index}&offset=${Math.max(0, offset | 0)}&limit=${Math.min(50, limit | 0 || 20)}`);
}

/** Downloads a version's primary file into `dir`, verified against Modrinth's SHA-512. */
async function installFile(version, dir, signal) {
  const file = version.files.find(f => f.primary) || version.files[0];
  if (!file || !SAFE_FILENAME.test(file.filename)) throw new Error('Modrinth returned an unexpected file name');
  const url = new URL(file.url);
  if (url.protocol !== 'https:' || url.hostname !== 'cdn.modrinth.com') throw new Error('Blocked download from an unexpected host');
  if (!/^[0-9a-f]{128}$/.test(file.hashes?.sha512 || '')) throw new Error('Modrinth file has no SHA-512');
  await fsp.mkdir(dir, { recursive: true });
  await download(file.url, path.join(dir, file.filename), { sha512: file.hashes.sha512, size: file.size, signal });
  return { filename: file.filename, sha512: file.hashes.sha512, size: file.size };
}

module.exports = { versionsByHash, projects, compatibleVersion, compatibleVersions, version, categoryTags, search, installFile, SAFE_FILENAME };
