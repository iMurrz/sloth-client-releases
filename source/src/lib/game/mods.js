const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { hashFile } = require('../http');
const lock = require('./mods-lock.json');

const MANAGED_FILE = '.sloth-managed.json';
const DIR_FOR = { mod: 'mods', shader: 'shaderpacks', resourcepack: 'resourcepacks' };
const SAFE = { mod: /^[A-Za-z0-9 _.+()'!-]+\.jar$/, shader: /^[A-Za-z0-9 _.+()'!-]+\.zip$/, resourcepack: /^[A-Za-z0-9 _.+()'!-]+\.zip$/ };
const TOGGLEABLE = new Set(['performance', 'optional', 'shader', 'resourcepack']);
const kindOf = mod => mod.kind || 'mod';
const { randomUUID } = require('node:crypto');

/** The catalog shown in the launcher UI (required mods and pulled-in dependencies are not toggleable). */
function catalog() {
  return lock.mods
    .filter(mod => TOGGLEABLE.has(mod.category))
    .map(({ slug, name, description, category, defaultEnabled, version }) => ({ slug, name, description, category, defaultEnabled, version }));
}

function defaultModSettings() {
  return Object.fromEntries(catalog().map(mod => [mod.slug, mod.defaultEnabled]));
}

/** Enabled entries + required mods + everything they depend on (a shader pulls in Iris). */
function resolveEnabled(modSettings = {}) {
  const bySlug = new Map(lock.mods.map(mod => [mod.slug, mod]));
  const chosen = new Map();
  const visit = slug => {
    const mod = bySlug.get(slug);
    if (!mod || chosen.has(slug)) return;
    chosen.set(slug, mod);
    mod.dependencies.forEach(visit);
  };
  for (const mod of lock.mods) {
    const enabled = mod.category === 'required' || (TOGGLEABLE.has(mod.category) && (modSettings[mod.slug] ?? mod.defaultEnabled));
    if (enabled) visit(mod.slug);
  }
  // An enabled mod may need an exact build of a dependency (Iris → the Sodium it supports).
  for (const mod of [...chosen.values()]) {
    for (const [slug, pin] of Object.entries(mod.pins || {})) {
      if (chosen.has(slug)) chosen.set(slug, { ...chosen.get(slug), version: pin.version, file: pin.file });
    }
  }
  return [...chosen.values()];
}

async function readManaged(dir) {
  try { const file=path.join(dir,MANAGED_FILE);if((await fsp.lstat(file)).isSymbolicLink())return [];const data=JSON.parse(await fsp.readFile(file,'utf8'));return Array.isArray(data.files)?data.files.filter(x=>typeof x==='string'):[]; }
  catch { return []; }
}

/** Preserve stale managed builds outside Fabric's scan path, including known dependency-pin alternatives. */
async function archiveStaleMods(instanceDir, keep, { includeUnselectedCatalog=false }={}) {
  const dir=path.join(instanceDir,'mods');
  for(const folder of [instanceDir,dir])if((await fsp.lstat(folder)).isSymbolicLink())throw Error('Linked mod directories are unsupported.');
  const prior=new Set(await readManaged(dir));
  const players=require('./player-mods');const userOwned=new Set((await players.read(dir)).map(x=>x.filename));
  const known=new Map();
  for(const mod of lock.mods.filter(x=>kindOf(x)==='mod')){
    const variants=[mod.file,...lock.mods.flatMap(x=>Object.entries(x.pins||{}).filter(([slug])=>slug===mod.slug).map(([,pin])=>pin.file))];
    if(includeUnselectedCatalog||variants.some(f=>keep.has(f.filename)))for(const f of variants)known.set(f.filename,f.sha512);
  }
  let backup=null;const archived=[];
  for(const name of await fsp.readdir(dir)){
    if(!SAFE.mod.test(name)||keep.has(name)||userOwned.has(name)||(!prior.has(name)&&!known.has(name)))continue;
    const file=path.join(dir,name),stat=await fsp.lstat(file);if(!stat.isFile()||stat.isSymbolicLink())continue;
    if(!prior.has(name)&&await hashFile(file,'sha512')!==known.get(name))continue;
    if(!backup){const base=path.join(instanceDir,'mod-backups');await fsp.mkdir(base,{recursive:true});if((await fsp.lstat(base)).isSymbolicLink())throw Error('Linked mod backups are unsupported.');backup=path.join(base,'managed-cleanup-'+Date.now()+'-'+randomUUID());await fsp.mkdir(backup);}
    await fsp.rename(file,path.join(backup,name));archived.push(name);
  }
  return {archived,backup};
}

/**
 * Plans the instance's mods, shaderpacks and resourcepacks folders. The launcher records what it placed in each
 * folder's `.sloth-managed.json`, so it only ever removes its own stale files: anything a player added stays.
 * `bundled` lists jars shipped inside the launcher (the Sloth Client mod). Resource packs are user-selected downloads.
 */
async function planMods(instanceDir, modSettings, bundled = []) {
  const wanted = resolveEnabled(modSettings);
  const tasks = [];
  const keep = { mod: new Set(), shader: new Set(), resourcepack: new Set() };
  for (const mod of wanted) {
    const kind = kindOf(mod);
    const { url, filename, sha512, size } = mod.file;
    if (!SAFE[kind]?.test(filename)) throw new Error(`Unsafe file name in lock: ${filename}`);
    keep[kind].add(filename);
    tasks.push({ url, dest: path.join(instanceDir, DIR_FOR[kind], filename), sha512, size, group: kind });
  }
  const bundledCopies = bundled.map(source => {
    keep.mod.add(path.basename(source));
    return { source, dest: path.join(instanceDir, 'mods', path.basename(source)) };
  });
  return {
    tasks,
    enabled: wanted.map(mod => mod.slug),
    async finalize() {
      for (const { source, dest } of bundledCopies) {
        await fsp.mkdir(path.dirname(dest), { recursive: true });
        const same = fs.existsSync(dest) && (await hashFile(source, 'sha256')) === (await hashFile(dest, 'sha256'));
        if (!same) await fsp.copyFile(source, dest);
      }
      for (const [kind, files] of Object.entries(keep)) {
        const dir = path.join(instanceDir, DIR_FOR[kind]);
        await fsp.mkdir(dir, { recursive: true });
        // Also recognize exact, hash-pinned builds from disabled catalog entries. Older
        // manifests may have lost ownership metadata after an interrupted migration;
        // archiving these known files prevents disabled Iris/Sodium alternatives from
        // remaining in Fabric's scan path without ever touching unknown player JARs.
        if(kind==='mod')await archiveStaleMods(instanceDir,files,{includeUnselectedCatalog:true});
        for (const filename of kind==='mod'?[]:await readManaged(dir)) {
          if (files.has(filename) || !SAFE[kind].test(filename)) continue;
          await fsp.rm(path.join(dir, filename), { force: true });
        }
        await fsp.writeFile(path.join(dir, MANAGED_FILE), JSON.stringify({ note: 'Files managed by Sloth Client. Your own files are left alone.', files: [...files] }, null, 2));
      }
    }
  };
}

module.exports = { catalog, defaultModSettings, planMods, resolveEnabled, archiveStaleMods };
