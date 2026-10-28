const fs = require('node:fs');
const path = require('node:path');

function cleanPack(value) {
  return ['curseforge','modrinth'].includes(value?.provider) && typeof value.name === 'string' && /^fabric-\d+\.\d+\.\d+$/.test(value.requestedLoader || '') ? { provider: value.provider, name: value.name.slice(0, 100), version: String(value.version || '').slice(0, 80), requestedLoader: value.requestedLoader } : null;
}

const ID = /^[a-z0-9][a-z0-9-]{0,31}$/;
const COPY_DIRS = ['mods', 'config', 'resourcepacks', 'shaderpacks', 'saves', 'screenshots', 'defaultconfigs', 'kubejs', 'scripts'];
const COPY_FILES = ['options.txt', 'session-profiles.json', 'servers.dat', 'servers.dat_old', '.sloth-default-resourcepacks.json', '.sloth-modpack.json'];

async function safeCopy(source, destination) {
  const stat = await fs.promises.lstat(source);
  if (stat.isSymbolicLink()) return;
  if (stat.isDirectory()) {
    await fs.promises.mkdir(destination, { recursive: true });
    for (const name of await fs.promises.readdir(source)) await safeCopy(path.join(source, name), path.join(destination, name));
  } else if (stat.isFile()) {
    await fs.promises.mkdir(path.dirname(destination), { recursive: true });
    await fs.promises.copyFile(source, destination, fs.constants.COPYFILE_EXCL);
  }
}

class InstanceManager {
  constructor(root, defaultMods, gameVersion) {
    this.root = path.resolve(root);
    this.file = path.join(this.root, 'instances.json');
    this.defaultMods = { ...defaultMods };
    this.gameVersion = gameVersion;
    this.value = { activeId: 'sloth', instances: [{ id: 'sloth', name: 'Sloth Client', createdAt: new Date().toISOString(), gameVersion, mods: this.defaultMods }] };
    try {
      const saved = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      if (saved?.schema !== 1) {
        const error = new Error('This instance library uses an unsupported format. Install a newer Sloth Client. Your instance data has been preserved.');
        error.code = 'INSTANCE_SCHEMA';
        throw error;
      }
      if (saved?.schema === 1 && Array.isArray(saved.instances)) {
        const instances = saved.instances.filter(i => i && ID.test(i.id) && typeof i.name === 'string').map(i => ({
          id: i.id, name: i.id === 'sloth' ? 'Sloth Client' : i.name.slice(0, 32), createdAt: typeof i.createdAt === 'string' ? i.createdAt : new Date().toISOString(),
          gameVersion, notes: typeof i.notes === 'string' ? i.notes.slice(0, 2000) : '', tags: cleanTags(i.tags), launch: cleanLaunch(i.launch), pack: cleanPack(i.pack), favorite: i.favorite === true, mods: i.mods && typeof i.mods === 'object' ? { ...this.defaultMods, ...i.mods } : { ...this.defaultMods }
        }));
        if (!instances.some(i => i.id === 'sloth')) instances.unshift({ id: 'sloth', name: 'Sloth Client', createdAt: new Date().toISOString(), gameVersion, mods: { ...this.defaultMods } });
        this.value = { activeId: instances.some(i => i.id === saved.activeId) ? saved.activeId : 'sloth', instances };
      }
    } catch (error) {
      if (error.code === 'INSTANCE_SCHEMA') throw error;
      if (error.code !== 'ENOENT') {
        // Keep the original index before recovering defaults; never silently overwrite a damaged library.
        fs.copyFileSync(this.file, `${this.file}.recovered-${Date.now()}`, fs.constants.COPYFILE_EXCL);
      }
    }
    fs.mkdirSync(path.join(this.root, 'instances'), { recursive: true });
    this.save();
  }

  save() {
    fs.mkdirSync(this.root, { recursive: true });
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ schema: 1, ...this.value }, null, 2));
    fs.renameSync(tmp, this.file);
  }

  list() {
    return this.value.instances.map(i => ({ id: i.id, name: i.name, notes: i.notes || '', tags: i.tags || [], gameVersion: i.gameVersion, createdAt: i.createdAt, favorite: i.favorite === true, pack: i.pack || null, active: i.id === this.value.activeId }));
  }

  get(id = this.value.activeId) {
    const item = this.value.instances.find(i => i.id === id);
    if (!item) throw new Error('That instance no longer exists.');
    return item;
  }

  instancePath(id = this.value.activeId) {
    if (!ID.test(id)) throw new Error('Invalid instance id.');
    const base = path.resolve(this.root, 'instances');
    const resolved = path.resolve(base, id);
    if (!resolved.startsWith(base + path.sep)) throw new Error('Invalid instance path.');
    return resolved;
  }

  setActive(id) {
    this.get(id);
    this.value.activeId = id;
    this.save();
    return this.get(id);
  }

  setMods(id, mods) {
    const item = this.get(id);
    item.mods = { ...this.defaultMods, ...mods };
    this.save();
  }
  setLaunch(id, settings) {
    this.get(id).launch = cleanLaunch(settings);
    this.save();
  }

  edit(id, patch = {}) {
    const item = this.get(id);
    if (typeof patch.name === 'string') {
      const name = patch.name.trim().replace(/[\p{Cc}]/gu, '').slice(0, 32);
      if (name.length < 2) throw new Error('Use at least 2 characters for the instance name.');
      item.name = name;
    }
    if (typeof patch.favorite === 'boolean') item.favorite = patch.favorite;
    if (typeof patch.notes === 'string') item.notes = patch.notes.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '').slice(0, 2000);
    if (Array.isArray(patch.tags)) item.tags = cleanTags(patch.tags);
    this.save();
    return item;
  }

  async create(name, { duplicate = false, testing = false, sourceDir = null, pack = null } = {}) {
    const cleanName = String(name || '').trim().replace(/[\p{Cc}]/gu, '').slice(0, 32);
    if (cleanName.length < 2) throw new Error('Give the instance a name with at least 2 characters.');
    const baseId = cleanName.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'instance';
    let id = baseId, n = 2;
    while (this.value.instances.some(i => i.id === id) || fs.existsSync(this.instancePath(id))) id = `${baseId.slice(0, 27)}-${n++}`;
    const source = this.instancePath(this.value.activeId);
    if (duplicate && fs.existsSync(source) && fs.lstatSync(source).isSymbolicLink()) throw new Error('The active instance folder is a symbolic link and cannot be duplicated.');
    const parent = path.dirname(this.instancePath(id));
    if (fs.lstatSync(parent).isSymbolicLink()) throw new Error('Linked instance folders cannot be modified.');
    const destination = this.instancePath(id);
    fs.mkdirSync(destination, { recursive: true });
    try {
    if (duplicate || sourceDir) {
      const copySource = sourceDir || source;
      for (const folder of COPY_DIRS) {
        const from = path.join(copySource, folder);
        if (fs.existsSync(from)) await safeCopy(from, path.join(destination, folder));
      }
      for (const file of COPY_FILES) {
        const from = path.join(copySource, file);
        if (fs.existsSync(from)) await safeCopy(from, path.join(destination, file));
      }
    }
    if (testing) {
      const modDir = path.join(destination, 'mods');
      let managed = [];
      try { managed = JSON.parse(fs.readFileSync(path.join(modDir, '.sloth-managed.json'), 'utf8')).files || []; } catch { /* No managed index yet. */ }
      if (!Array.isArray(managed)) managed = [];
      for (const filename of fs.existsSync(modDir) ? fs.readdirSync(modDir) : []) {
        if (/\.jar$/i.test(filename) && !managed.includes(filename)) {
          let disabled = path.join(modDir, filename + '.disabled'), n = 2;
          while (fs.existsSync(disabled)) disabled = path.join(modDir, filename + `.disabled-${n++}`);
          await fs.promises.rename(path.join(modDir, filename), disabled);
        }
      }
    }
    const item = { id, name: cleanName, notes: duplicate ? this.get().notes || '' : '', tags: duplicate ? cleanTags(this.get().tags) : [], createdAt: new Date().toISOString(), gameVersion: this.gameVersion, launch: cleanLaunch(this.get().launch), pack: cleanPack(pack || (duplicate ? this.get().pack : null)), mods: { ...this.get().mods } };
    const previous = this.value;
    this.value = { activeId: id, instances: [...previous.instances, item] };
    try { this.save(); } catch (error) { this.value = previous; throw error; }
    return item;
    } catch (error) {
      // Only remove the fresh destination owned by this operation.
      await fs.promises.rm(destination, { recursive: true, force: true }).catch(() => {});
      throw error;
    }
  }
}

function cleanLaunch(value) {
  if (!value || typeof value !== 'object') return null;
  const result = {};
  if (Number.isInteger(value.memoryMb)) result.memoryMb = Math.max(2048, Math.min(16384, value.memoryMb));
  if (['minimize', 'keep', 'close'].includes(value.onLaunch)) result.onLaunch = value.onLaunch;
  if (value.resolution === null) result.resolution = null;
  else if (Number.isInteger(value.resolution?.width) && Number.isInteger(value.resolution?.height)) result.resolution = { width: Math.max(640, Math.min(7680, value.resolution.width)), height: Math.max(480, Math.min(4320, value.resolution.height)) };
  if (['', 'quiet', 'balanced', 'performance', 'visual'].includes(value.performancePreset)) result.performancePreset = value.performancePreset;
  if ([0, 30, 45, 60, 90, 120].includes(value.reminderMinutes)) result.reminderMinutes = value.reminderMinutes;
  return result;
}
function cleanTags(value) { return Array.isArray(value) ? [...new Set(value.filter(x => typeof x === 'string').map(x => x.trim().replace(/[\p{Cc}]/gu, '').slice(0, 24)).filter(Boolean))].slice(0, 8) : []; }
module.exports = { InstanceManager, ID, COPY_DIRS, COPY_FILES, cleanPack, cleanLaunch };
