const fsp = require('node:fs/promises');
const path = require('node:path');

// Mods the player chose themselves (Browse Mods page or an import), tracked so they can be listed, updated and
// removed. Kept apart from the launcher-managed pack, which never deletes them.
const MANIFEST = '.sloth-player-mods.json';
const SAFE = /^[A-Za-z0-9 _.+()'!-]+\.jar$/;

async function read(modsDir) {
  try {
    const data = JSON.parse(await fsp.readFile(path.join(modsDir, MANIFEST), 'utf8'));
    return Array.isArray(data.mods) ? data.mods.filter(m => SAFE.test(m.filename || '')) : [];
  } catch {
    return [];
  }
}

async function write(modsDir, mods) {
  await fsp.mkdir(modsDir, { recursive: true });
  await fsp.writeFile(path.join(modsDir, MANIFEST), JSON.stringify({ note: 'Mods you added through Sloth Client (Browse Mods or Import).', mods }, null, 2));
}

async function removeCopies(modsDir, filename) {
  const names = await fsp.readdir(modsDir).catch(error => { if (error.code === 'ENOENT') return []; throw error; });
  for (const name of names) if (name === filename || name.startsWith(filename + '.disabled') && /^\.disabled(?:-\d+)?$/.test(name.slice(filename.length))) {
    const file = path.join(modsDir, name), stat = await fsp.lstat(file);
    if (stat.isFile() && !stat.isSymbolicLink()) await fsp.unlink(file);
  }
}

async function add(modsDir, entry) {
  const existing = await read(modsDir);
  // Replacing a mod with another build: remove the old file so two versions never load together.
  for (const old of existing) {
    if (old.projectId === entry.projectId && old.filename !== entry.filename) await removeCopies(modsDir, old.filename);
  }
  const mods = existing.filter(m => m.projectId !== entry.projectId);
  mods.push(entry);
  await write(modsDir, mods);
}

async function remove(modsDir, projectId) {
  const mods = await read(modsDir);
  const target = mods.find(m => m.projectId === projectId);
  if (!target) return false;
  await removeCopies(modsDir, target.filename);
  await write(modsDir, mods.filter(m => m.projectId !== projectId));
  return true;
}

module.exports = { read, add, remove };
