const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const modrinth = require('./modrinth');
const playerMods = require('./game/player-mods');
const { reconcile } = require('./importer');

// Browse Mods (Modrinth) and Screenshots, for the launcher UI. Everything returned to the renderer is plain,
// validated data; file paths never come from the renderer.
const TYPES = { mod: 'mods', resourcepack: 'resourcepacks', shader: 'shaderpacks' };
const LOADER = { mod: 'fabric', resourcepack: 'minecraft', shader: 'iris' };
const BROWSE_TYPES = new Set([...Object.keys(TYPES), 'modpack', 'datapack']);
const SLUG = /^[a-z0-9-_.]{1,64}$/i;
const ID = /^[A-Za-z0-9]{8}$/;
let categoryCache = null;

function safeIcon(url) {
  try { const u = new URL(url); return u.protocol === 'https:' && u.hostname === 'cdn.modrinth.com' ? u.toString() : null; } catch { return null; }
}

async function search({ query, type, sort, categories, offset }, gameVersion) {
  if (!BROWSE_TYPES.has(type)) throw new Error('Unknown content type');
  const res = await modrinth.search({
    query: String(query || ''), type: type === 'datapack' ? 'mod' : type, gameVersion, loader: type === 'datapack' ? 'datapack' : ['mod', 'modpack'].includes(type) ? 'fabric' : undefined,
    categories: (Array.isArray(categories) ? categories : []).filter(c => /^[a-z0-9-]{1,32}$/.test(c)).slice(0, 5),
    sort, offset: Number(offset) || 0, limit: 20
  });
  return {
    total: res.total_hits,
    hits: res.hits.map(h => ({
      id: h.project_id, slug: h.slug, title: String(h.title).slice(0, 80), description: String(h.description).slice(0, 240),
      compatibility: {gameVersion,loader:['mod','modpack'].includes(type)?'Fabric':type==='shader'?'Shader pack':type==='datapack'?'Data pack':'Resource pack',client:['required','optional','unsupported'].includes(h.client_side)?h.client_side:'unknown'},
      author: String(h.author).slice(0, 40), icon: safeIcon(h.icon_url), downloads: h.downloads, updated: h.date_modified,
      categories: (h.display_categories || h.categories || []).filter(c => !['fabric', 'forge', 'neoforge', 'quilt', 'minecraft', 'iris', 'optifine', 'canvas'].includes(c)).slice(0, 3)
    }))
  };
}

async function categories(type) {
  if (!BROWSE_TYPES.has(type)) return [];
  categoryCache ??= await modrinth.categoryTags();
  return categoryCache.filter(c => c.project_type === (type === 'datapack' ? 'mod' : type) && c.header === 'categories').map(c => c.name).sort();
}

/** Installs a project into the right folder; mods also get required dependencies and a compatibility pass. */
async function install({ id, type, versionId }, { instanceDir, gameVersion, catalogSlugs }) {
  if (!ID.test(id) || !TYPES[type]) throw new Error('Invalid project');
  const dir = path.join(instanceDir, TYPES[type]);
  const [project] = await modrinth.projects([id]);
  if (!project) throw new Error('Project not found');
  if (type !== 'mod') {
    const version = await modrinth.compatibleVersion(id, gameVersion, LOADER[type], { preferRelease: false });
    if (!version) throw new Error(`${project.title} has no ${gameVersion} build`);
    const file = await modrinth.installFile(version, dir);
    return { installed: [project.title], enableCatalog: type === 'shader' ? ['iris'] : [], file: file.filename };
  }
  const installed = [], enableCatalog = [];
  if (versionId && !ID.test(versionId)) throw new Error('Invalid version selection.');
  const queue = [{ id, versionId: versionId || null }];
  const seen = new Set();
  while (queue.length) {
    const job = queue.shift();
    if (seen.has(job.id)) continue;
    seen.add(job.id);
    const [p] = job.id === id ? [project] : await modrinth.projects([job.id]);
    if (!p) throw new Error('A required project could not be resolved.');
    if (catalogSlugs.has(p.slug)) { enableCatalog.push(p.slug); continue; }
    let version = job.versionId ? await modrinth.version(job.versionId).catch(() => null) : null;
    if (job.versionId && (!version || version.project_id !== job.id || !version.game_versions?.includes(gameVersion) || !version.loaders?.includes('fabric'))) throw new Error('The reviewed version is no longer a compatible Fabric build.');
    if (!version?.game_versions?.includes(gameVersion)) version = await modrinth.compatibleVersion(p.id, gameVersion, 'fabric');
    if (!version) throw new Error(`${p.title} has no Fabric ${gameVersion} build`);
    const file = await modrinth.installFile(version, dir);
    await playerMods.add(dir, { projectId: p.id, versionId: version.id, title: p.title, slug: p.slug, icon: safeIcon(p.icon_url), ...file, source: 'browse' });
    installed.push(p.title);
    for (const dep of version.dependencies || []) {
      if (dep.dependency_type !== 'required') continue;
      const projectId = dep.project_id || (dep.version_id ? (await modrinth.version(dep.version_id))?.project_id : null);
      if (!projectId || !ID.test(projectId)) throw new Error('A required dependency could not be resolved.');
      queue.push({ id: projectId, versionId: dep.version_id || null });
    }
  }
  await reconcile(dir, gameVersion);
  return { installed, enableCatalog };
}

async function installed(instanceDir) {
  const mods = await playerMods.read(path.join(instanceDir, 'mods'));
  const packs = kind => {
    try { return fs.readdirSync(path.join(instanceDir, kind)).filter(n => /\.zip$/i.test(n) || fs.statSync(path.join(instanceDir, kind, n)).isDirectory()); } catch { return []; }
  };
  return {
    mods: mods.map(m => ({ id: m.projectId, title: m.title, filename: m.filename, icon: m.icon || null, source: m.source })),
    resourcepacks: packs('resourcepacks'),
    shaderpacks: packs('shaderpacks')
  };
}

async function remove(id, instanceDir) {
  if (!ID.test(id)) throw new Error('Invalid project');
  return playerMods.remove(path.join(instanceDir, 'mods'), id);
}

// ---------- screenshots ----------

const SHOT = /^[A-Za-z0-9 _.()-]+\.(png|jpe?g)$/i;

function screenshotDir(instanceDir) { return path.join(instanceDir, 'screenshots'); }

async function screenshots(instanceDir, nativeImage, limit = 60) {
  return (await screenshotPage(instanceDir, nativeImage, { limit })).items;
}
async function screenshotPage(instanceDir, nativeImage, request = {}) {
  const dir = screenshotDir(instanceDir);
  for (const folder of [path.dirname(instanceDir), instanceDir, dir]) {
    const s = await fsp.lstat(folder).catch(e => { if (e.code === 'ENOENT') return null; throw e; });
    if (s?.isSymbolicLink()) throw new Error('Linked screenshot folders are not supported.');
  }
  const names = (await fsp.readdir(dir).catch(e => { if (e.code === 'ENOENT') return []; throw e; })).filter(n => SHOT.test(n)).slice(0, 10000);
  const query = String(request.query || '').slice(0, 100).toLowerCase();
  const date = typeof request.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(request.date) ? request.date : '';
  const records = [];
  const albumNames = Array.isArray(request.albumNames) ? new Set(request.albumNames) : null;
  for (const name of names) {
    const s = await fsp.lstat(path.join(dir, name)).catch(() => null);
    if (!s?.isFile() || s.isSymbolicLink() || !name.toLowerCase().includes(query) || (albumNames && !albumNames.has(name))) continue;
    const taken = new Date(s.mtimeMs);
    const localDate = `${taken.getFullYear()}-${String(taken.getMonth() + 1).padStart(2, '0')}-${String(taken.getDate()).padStart(2, '0')}`;
    if (date && localDate !== date) continue;
    records.push({ name, taken: s.mtimeMs, bytes: s.size });
  }
  records.sort((a, b) => request.sort === 'oldest' ? a.taken - b.taken : request.sort === 'name' ? a.name.localeCompare(b.name) : b.taken - a.taken);
  const limit = Math.max(1, Math.min(60, Number(request.limit) || 24));
  const offset = Math.max(0, Math.min(records.length, Math.floor(Number(request.offset) || 0)));
  const items = [];
  for (const record of records.slice(offset, offset + limit)) {
    let thumb = null;
    if (record.bytes <= 32 * 1024 ** 2) {
      let allowed = true;
      if (/\.png$/i.test(record.name)) {
        const handle = await fsp.open(path.join(dir, record.name), 'r');
        try { const header = Buffer.alloc(24); const { bytesRead } = await handle.read(header); allowed = bytesRead === 24 && header.readUInt32BE(0) === 0x89504e47 && header.readUInt32BE(16) * header.readUInt32BE(20) <= 16 * 1024 ** 2; }
        finally { await handle.close(); }
      }
      if (allowed && /\.jpe?g$/i.test(record.name)) {
        const handle = await fsp.open(path.join(dir, record.name), 'r');
        try {
          const buffer = Buffer.alloc(Math.min(record.bytes, 1024 * 1024)); await handle.read(buffer);
          allowed = false;
          let i = 2;
          while (buffer.length >= 2 && buffer.readUInt16BE(0) === 0xffd8 && i + 8 < buffer.length) {
            if (buffer[i++] !== 0xff) break;
            while (buffer[i] === 0xff) i++;
            const marker = buffer[i++];
            if (marker === 0xda || marker === 0xd9 || i + 7 >= buffer.length) break;
            const size = buffer.readUInt16BE(i);
            if (size < 2 || i + size > buffer.length) break;
            if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
              allowed = buffer.readUInt16BE(i + 3) * buffer.readUInt16BE(i + 5) <= 16 * 1024 ** 2; break;
            }
            i += size;
          }
        } finally { await handle.close(); }
      }
      if (allowed) { const img = nativeImage.createFromPath(path.join(dir, record.name)); if (!img.isEmpty()) thumb = img.resize({ width: 320, quality: 'good' }).toDataURL(); }
    }
    items.push({ ...record, thumb });
  }
  return { items, total: records.length, offset, limit, scanned: names.length };
}

/** Resolves a screenshot name to its path, refusing anything that isn't a plain file name in the folder. */
function screenshotPath(instanceDir, name) {
  if (typeof name !== 'string' || !SHOT.test(name) || name.includes('..')) throw new Error('Invalid screenshot');
  const file = path.join(screenshotDir(instanceDir), name);
  if (!fs.existsSync(file)) throw new Error('Screenshot not found');
  for (const f of [path.dirname(instanceDir), instanceDir, screenshotDir(instanceDir), file]) if (fs.lstatSync(f).isSymbolicLink()) throw new Error('Linked screenshots are not supported.');
  if (!fs.lstatSync(file).isFile()) throw new Error('Screenshot is not a regular file.');
  return file;
}

module.exports = { search, categories, install, installed, remove, screenshots, screenshotPage, screenshotPath, SLUG };
