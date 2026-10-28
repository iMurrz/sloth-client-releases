const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { openZip, readZipEntry } = require('./zip');
const { worldVersion } = require('./nbt');
const { hashFile } = require('./http');
const modrinth = require('./modrinth');
const playerMods = require('./game/player-mods');
const { satisfies, readFabricMeta } = require('./game/fabric-versions');
const lock = require('./game/mods-lock.json');

/**
 * Imports from another launcher's game folder (Lunar Client, vanilla, Prism/MultiMC, Modrinth App)
 * or a zip of one: screenshots, resource packs, shader packs, compatible worlds, and mods re-resolved on Modrinth
 * for this game version. Never copies logs, crash dumps (they can hold session tokens), or account files, and
 * never overwrites anything already in the Sloth instance.
 */
const PARTS = ['screenshots', 'saves', 'resourcepacks', 'shaderpacks', 'mods'];

function listDirs(dir) {
  try { return fs.readdirSync(dir, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => path.join(dir, d.name)); }
  catch { return []; }
}

const looksLikeGameDir = dir => PARTS.some(p => fs.existsSync(path.join(dir, p))) || fs.existsSync(path.join(dir, 'options.txt'));

/** Known launcher folders on this PC that look like Minecraft game directories. */
function detectSources() {
  const home = os.homedir();
  const appData = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
  const out = [];
  const add = (kind, name, dir) => { if (looksLikeGameDir(dir)) out.push({ kind, name, path: dir }); };
  for (const dir of listDirs(path.join(home, '.lunarclient', 'profiles'))) add('Lunar Client', `Lunar: ${path.basename(dir)}`, dir);
  add('Minecraft Launcher', 'Minecraft (vanilla)', path.join(appData, '.minecraft'));
  for (const root of [path.join(appData, 'PrismLauncher', 'instances'), path.join(appData, '.minecraft', 'MultiMC', 'instances')]) {
    for (const inst of listDirs(root)) {
      const game = [path.join(inst, '.minecraft'), path.join(inst, 'minecraft')].find(fs.existsSync);
      if (game) add('Prism Launcher', `Prism: ${path.basename(inst)}`, game);
    }
  }
  for (const dir of listDirs(path.join(appData, 'ModrinthApp', 'profiles'))) add('Modrinth App', `Modrinth: ${path.basename(dir)}`, dir);
  return out;
}

/** Extracts only importable parts of a zip into a temp folder; returns that folder (the caller cleans it up). */
async function extractZip(zipFile, tempRoot) {
  const zip = await openZip(zipFile);
  try {
    const names = zip.entries.map(e => e.name);
    // Find the game folder inside the archive: the shortest prefix that contains one of the known parts.
    let prefix = '';
    let best = Infinity;
    for (const name of names) {
      const parts = name.split('/');
      const idx = parts.findIndex(p => PARTS.includes(p));
      if (idx >= 0 && idx < best) { best = idx; prefix = parts.slice(0, idx).join('/'); }
    }
    const dest = path.join(tempRoot, `import-${crypto.randomBytes(6).toString('hex')}`);
    const base = prefix ? `${prefix}/` : '';
    await zip.extract(dest, name => {
      if (!name.startsWith(base)) return false;
      const rel = name.slice(base.length);
      const top = rel.split('/')[0];
      if (top === 'mods') return /^mods\/[^/]+\.jar$/i.test(rel); // top-level jars only (launcher-internal subfolders skipped)
      return PARTS.includes(top) || rel === 'options.txt';
    });
    const inner = prefix ? path.join(dest, ...prefix.split('/')) : dest;
    if (prefix) {
      // Flatten so the temp folder itself is the game directory.
      for (const part of [...PARTS, 'options.txt']) {
        if (fs.existsSync(path.join(inner, part))) await fsp.rename(path.join(inner, part), path.join(dest, part));
      }
    }
    return dest;
  } finally {
    await zip.close();
  }
}

async function targetDataVersion(gameRoot, gameVersion) {
  const json = await readZipEntry(path.join(gameRoot, 'versions', gameVersion, `${gameVersion}.jar`), 'version.json').catch(() => null);
  if (!json) return null;
  try { return JSON.parse(json.toString('utf8')).world_version ?? null; } catch { return null; }
}

/** What a source folder contains, without changing anything. */
async function scan(dir, { gameRoot, gameVersion }) {
  const list = (sub, filter = () => true) => {
    try { return fs.readdirSync(path.join(dir, sub), { withFileTypes: true }).filter(filter).map(d => d.name); } catch { return []; }
  };
  const target = await targetDataVersion(gameRoot, gameVersion);
  const worlds = [];
  for (const name of list('saves', d => d.isDirectory())) {
    let info = { name: null, dataVersion: null, levelName: null };
    try { info = worldVersion(await fsp.readFile(path.join(dir, 'saves', name, 'level.dat'))); } catch { /* unreadable */ }
    const compatible = info.dataVersion != null && target != null ? info.dataVersion <= target : info.name === gameVersion;
    worlds.push({ folder: name, title: info.levelName || name, version: info.name || 'unknown', compatible });
  }
  return {
    screenshots: list('screenshots', d => d.isFile() && /\.(png|jpe?g)$/i.test(d.name)).length,
    worlds,
    resourcepacks: list('resourcepacks', d => d.isDirectory() || /\.zip$/i.test(d.name)),
    shaderpacks: list('shaderpacks', d => d.isDirectory() || /\.zip$/i.test(d.name)),
    mods: list('mods', d => d.isFile() && /\.jar$/i.test(d.name)),
    hasOptions: fs.existsSync(path.join(dir, 'options.txt'))
  };
}

async function copyTree(src, dest) {
  const stat = await fsp.lstat(src); // links are skipped, never followed
  if (stat.isDirectory()) {
    await fsp.mkdir(dest, { recursive: true });
    for (const entry of await fsp.readdir(src)) await copyTree(path.join(src, entry), path.join(dest, entry));
  } else if (stat.isFile()) {
    await fsp.copyFile(src, dest, fs.constants.COPYFILE_EXCL);
  }
}

/** A name that doesn't exist yet in `dir` ("World", "World (imported)", "World (imported 2)"...). */
function freeName(dir, name) {
  if (!fs.existsSync(path.join(dir, name))) return name;
  const ext = path.extname(name), stem = ext && !fs.statSync(path.join(dir, name)).isDirectory() ? name.slice(0, -ext.length) : name;
  const suffix = ext && stem !== name ? ext : '';
  for (let i = 1; ; i++) {
    const candidate = `${stem} (imported${i > 1 ? ` ${i}` : ''})${suffix}`;
    if (!fs.existsSync(path.join(dir, candidate))) return candidate;
  }
}

/**
 * Imports the chosen parts. `choices` = { screenshots, resourcepacks, shaderpacks, mods, worlds: [folder,...] }.
 * Returns a report; `enableCatalog` lists launcher catalog mods to switch on instead of installing separately.
 */
async function importFrom(dir, choices, { instanceDir, gameVersion, onProgress = () => {}, signal }) {
  const report = { screenshots: 0, resourcepacks: [], shaderpacks: [], worlds: [], mods: [], enableCatalog: [], unmatched: [], skipped: [] };
  const into = sub => { const d = path.join(instanceDir, sub); fs.mkdirSync(d, { recursive: true }); return d; };

  if (choices.screenshots) {
    onProgress('Copying screenshots');
    const src = path.join(dir, 'screenshots'), dest = into('screenshots');
    for (const name of fs.existsSync(src) ? fs.readdirSync(src) : []) {
      if (!/\.(png|jpe?g)$/i.test(name) || fs.existsSync(path.join(dest, name)) || !fs.lstatSync(path.join(src, name)).isFile()) continue;
      await fsp.copyFile(path.join(src, name), path.join(dest, name));
      report.screenshots++;
    }
  }
  for (const part of ['resourcepacks', 'shaderpacks']) {
    if (!choices[part]) continue;
    onProgress(`Copying ${part === 'resourcepacks' ? 'resource packs' : 'shader packs'}`);
    const src = path.join(dir, part), dest = into(part);
    for (const name of fs.existsSync(src) ? fs.readdirSync(src) : []) {
      if (!/\.zip$/i.test(name) && !fs.statSync(path.join(src, name)).isDirectory()) continue;
      if (fs.existsSync(path.join(dest, name))) { report.skipped.push(`${name} (already there)`); continue; }
      await copyTree(path.join(src, name), path.join(dest, name));
      report[part].push(name);
    }
  }
  for (const folder of choices.worlds || []) {
    if (!fs.existsSync(path.join(dir, 'saves', folder))) continue;
    onProgress(`Copying world ${folder}`);
    const dest = into('saves');
    const name = freeName(dest, folder);
    await copyTree(path.join(dir, 'saves', folder), path.join(dest, name));
    report.worlds.push(name);
  }

  if (choices.mods) {
    onProgress('Identifying mods on Modrinth');
    const modsSrc = path.join(dir, 'mods');
    const jars = fs.existsSync(modsSrc) ? fs.readdirSync(modsSrc).filter(n => /\.jar$/i.test(n)) : [];
    const hashes = {};
    for (const jar of jars) hashes[await hashFile(path.join(modsSrc, jar), 'sha1')] = jar;
    const found = await modrinth.versionsByHash(Object.keys(hashes));
    const projectIds = [...new Set(Object.values(found).map(v => v.project_id))];
    for (const [sha1, jar] of Object.entries(hashes)) if (!found[sha1]) report.unmatched.push(jar);
    const projectInfo = Object.fromEntries((await modrinth.projects(projectIds)).map(p => [p.id, p]));
    const catalogSlugs = new Set(lock.mods.map(m => m.slug));
    const modsDir = into('mods');
    const installed = new Set();
    // Each job: a project, optionally pinned to an exact version by whatever depends on it.
    const queue = projectIds.map(id => ({ id, versionId: null }));
    while (queue.length) {
      if (signal?.aborted) throw new Error('Cancelled');
      const { id, versionId } = queue.shift();
      if (installed.has(id)) continue;
      installed.add(id);
      const project = projectInfo[id] || (await modrinth.projects([id]))[0];
      if (!project) continue;
      if (catalogSlugs.has(project.slug)) { report.enableCatalog.push(project.slug); continue; }
      onProgress(`Installing ${project.title} for ${gameVersion}`);
      let version = versionId ? await modrinth.version(versionId).catch(() => null) : null;
      if (!version?.game_versions?.includes(gameVersion)) version = await modrinth.compatibleVersion(id, gameVersion, 'fabric', { preferRelease: false });
      if (!version) { report.unmatched.push(`${project.title} (no ${gameVersion} build)`); continue; }
      const file = await modrinth.installFile(version, modsDir, signal);
      await playerMods.add(modsDir, { projectId: id, versionId: version.id, title: project.title, slug: project.slug, ...file, source: 'import' });
      report.mods.push(project.title);
      for (const dep of version.dependencies || []) {
        if (dep.dependency_type === 'required' && dep.project_id) queue.unshift({ id: dep.project_id, versionId: dep.version_id || null });
      }
    }
    onProgress('Checking mod compatibility');
    await reconcile(modsDir, gameVersion, signal);
  }
  return report;
}

/**
 * Modrinth metadata doesn't always carry exact version requirements; each jar's fabric.mod.json does. Swap in a
 * build of any player-added dependency that doesn't satisfy what another player-added mod requires.
 */
async function reconcile(modsDir, gameVersion, signal) {
  for (let pass = 0; pass < 3; pass++) {
    const entries = await playerMods.read(modsDir);
    const byModId = new Map();
    for (const entry of entries) {
      const meta = await readFabricMeta(path.join(modsDir, entry.filename));
      if (meta.id) byModId.set(meta.id, { entry, meta });
    }
    let changed = false;
    for (const { meta } of byModId.values()) {
      for (const [depId, constraint] of Object.entries(meta.depends || {})) {
        const dep = byModId.get(depId);
        if (!dep || satisfies(dep.meta.version, constraint)) continue;
        const versions = await modrinth.compatibleVersions(dep.entry.projectId, gameVersion, 'fabric');
        for (const candidate of versions) {
          if (signal?.aborted) throw new Error('Cancelled');
          const tempDir = path.join(modsDir, '.sloth-check');
          const file = await modrinth.installFile(candidate, tempDir, signal);
          const candidateMeta = await readFabricMeta(path.join(tempDir, file.filename));
          await fsp.rm(tempDir, { recursive: true, force: true });
          if (!satisfies(candidateMeta.version, constraint)) continue;
          const installedFile = await modrinth.installFile(candidate, modsDir, signal);
          await playerMods.add(modsDir, { ...dep.entry, versionId: candidate.id, ...installedFile });
          changed = true;
          break;
        }
      }
    }
    if (!changed) return;
  }
}

module.exports = { detectSources, extractZip, scan, importFrom, reconcile };
