const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { openZip } = require('./zip');
const { satisfies } = require('./game/fabric-versions');
const playerMods = require('./game/player-mods');
const lock = require('./game/mods-lock.json');
const dependencyGraph = require('./mod-dependencies');

const SAFE = /^[A-Za-z0-9 _.+()'!-]+\.jar(?:\.disabled(?:-\d+)?)?$/i;
const canonical = name => name.replace(/\.disabled(?:-\d+)?$/i, '');
const protectedName = name => /^(?:sloth|sloth)-client-/i.test(name) || lock.mods.some(mod => mod.file?.filename.toLowerCase() === canonical(name).toLowerCase() || Object.values(mod.pins || {}).some(pin => pin.file?.filename.toLowerCase() === canonical(name).toLowerCase()));

async function metadata(file) {
  let zip;
  try {
    zip = await openZip(file);
    const entry = zip.entries.find(item => item.name === 'fabric.mod.json');
    if (!entry) return { problem: 'No Fabric metadata. Check the loader before enabling this mod.' };
    if (entry.uncompressedSize > 256 * 1024 || entry.compressedSize > 256 * 1024) return { problem: 'Mod metadata exceeds the inspection limit.' };
    const data = JSON.parse((await zip.read(entry)).toString('utf8'));
    return { id: typeof data.id === 'string' ? data.id.slice(0, 128) : null, name: typeof data.name === 'string' ? data.name.slice(0, 160) : null, version: String(data.version || '').slice(0, 80), depends: data.depends && typeof data.depends==='object' && !Array.isArray(data.depends) ? data.depends : {}, breaks: data.breaks && typeof data.breaks==='object'&&!Array.isArray(data.breaks)?data.breaks:{}, conflicts:data.conflicts&&typeof data.conflicts==='object'&&!Array.isArray(data.conflicts)?data.conflicts:{}, environment: data.environment, nested: Array.isArray(data.jars) && data.jars.length > 0 };
  } catch { return { problem: 'Cannot read this mod archive. It may be damaged.' }; }
  finally { await zip?.close(); }
}

async function inspect(instanceDir, gameVersion, loaderVersion, { standalone = false, javaVersion = "21" } = {}) {
  const dir = path.join(instanceDir, 'mods');
  let files;
  try { files = await fs.readdir(dir, { withFileTypes: true }); } catch (error) { if (error.code === 'ENOENT') files = []; else throw error; }
  let managed = [];
  try { const manifest = JSON.parse(await fs.readFile(path.join(dir, '.sloth-managed.json'), 'utf8')); if (Array.isArray(manifest.files)) managed = manifest.files; } catch { /* protected catalog remains authoritative */ }
  const tracked = await playerMods.read(dir);
  const mods = [];
  // Sequential reads bound memory use even for a large mod folder.
  for (const file of files.filter(file => file.isFile() && SAFE.test(file.name)).slice(0, 1000)) {
    const full = path.join(dir, file.name);
    const stat = await fs.lstat(full);
    if (!stat.isFile() || stat.isSymbolicLink()) continue;
    const meta = await metadata(full);
    const graph = /\.jar$/i.test(file.name) ? await dependencyGraph.readGraph(full) : {nodes:[],complete:true};
    const origin = tracked.find(item => item.filename.toLowerCase() === canonical(file.name).toLowerCase());
    mods.push({ filename: file.name, name: meta.name || origin?.title || canonical(file.name), id: meta.id, version: meta.version || '', size: stat.size, enabled: /\.jar$/i.test(file.name), managed: !standalone && protectedName(file.name) || managed.some(name => String(name).toLowerCase() === canonical(file.name).toLowerCase()), source: origin?.source || (origin ? 'Modrinth' : 'Local file'), issues: meta.problem ? [meta.problem] : [], meta, graph });
  }
  const active = mods.filter(mod => mod.enabled);
  const activeById=new Map();
  for(const mod of active)if(mod.id){const entries=activeById.get(mod.id)||[];entries.push(mod);activeById.set(mod.id,entries);}
  for (const mod of mods) {
    if (!mod.enabled) continue;
    if (mod.id && activeById.get(mod.id).length > 1) mod.issues.push(`Duplicate mod ID: ${mod.id}. Disable one copy.`);
    if (mod.meta.environment === 'server') mod.issues.push('This mod is marked for servers only.');
    for (const [id, version] of [['minecraft', gameVersion], ['fabricloader', loaderVersion], ['java', String(javaVersion)]]) {
      if (mod.meta.depends?.[id] && !satisfies(version, mod.meta.depends[id])) mod.issues.push(`Requires ${id} ${JSON.stringify(mod.meta.depends[id])}; this launcher uses ${version}.`);
    }
  }
  const builtins=new Map([['minecraft',gameVersion],['fabricloader',loaderVersion],['java',String(javaVersion)]]);
  for(const node of await dependencyGraph.loaderLibraries(instanceDir,loaderVersion))for(const id of [node.id,...node.provides])builtins.set(id,node.version);
  const graphComplete = !files.some(f=>f.isSymbolicLink()) && active.every(m=>m.graph.complete) && files.filter(f=>f.isFile()&&SAFE.test(f.name)).length<=1000;
  dependencyGraph.resolve(mods, builtins, graphComplete);
  for(const mod of mods) {
    mod.dependencies ||= []; mod.dependencyNotices ||= []; mod.blockers ||= [];
    mod.compatibility={state:!mod.enabled?'disabled':mod.issues.length?'incompatible':mod.dependencyNotices.length||!mod.id?'review':'checked',label:!mod.enabled?'Disabled · not checked':mod.issues.length?'Needs attention':mod.dependencyNotices.length||!mod.id?'Needs review':'Metadata checks passed',detail:'Minecraft '+gameVersion+' · Fabric '+loaderVersion+'. Includes inspected nested libraries and aliases; Fabric resolves the final graph.'};
    const suppliedIds = new Set([mod.id, ...mod.graph.nodes.filter(node => node.environment !== 'server').flatMap(node => [node.id, ...node.provides])].filter(Boolean));
    mod.requiredBy=active.filter(other=>other!==mod&&Object.keys(other.meta.depends||{}).some(id=>suppliedIds.has(id))).map(other=>other.name);
    mod.disablePreview=mod.requiredBy.length?'Disabling may prevent '+mod.requiredBy.join(', ')+' from loading. Review dependencies before changing it.':'No enabled top-level mod declares this mod as required.';
    if(mod.issues.length&&mod.enabled){mod.compatibility.state='incompatible';mod.compatibility.label='Needs attention';}
  }
  const unresolved=active.reduce((n,m)=>n+(m.dependencyNotices?.length||0),0),affected=active.filter(m=>m.issues.length||m.dependencyNotices?.length).length;
  return { mods: mods.map(({ meta, graph, ...mod }) => mod).sort((a, b) => Number(b.managed) - Number(a.managed) || a.name.localeCompare(b.name)), enabled: active.length, disabled: mods.length - active.length, issues: mods.reduce((total, mod) => total + mod.issues.length, 0), compatibility:{affected,unresolved,truncated:files.filter(f=>f.isFile()&&SAFE.test(f.name)).length>1000}, note: 'Fabric requirements include bounded inspection of nested libraries and aliases. Review conflicts and missing requirements; Fabric resolves the final graph at launch.' };
}

async function toggle(instanceDir, filename, enabled, { standalone = false } = {}) {
  if (typeof filename !== 'string' || !SAFE.test(filename) || typeof enabled !== 'boolean') throw new Error('Invalid mod selection. Refresh the mod list.');
  const dir = path.join(instanceDir, 'mods');
  const resolvedDir = await fs.realpath(dir);
  if (resolvedDir.toLowerCase() !== path.resolve(dir).toLowerCase()) throw new Error('Linked mod folders cannot be changed here.');
  const source = path.join(dir, filename);
  const stat = await fs.lstat(source);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Only regular mod files can be changed.');
  let managed = [];
  try { managed = JSON.parse(await fs.readFile(path.join(dir, '.sloth-managed.json'), 'utf8')).files || []; } catch { /* catalog still protects core files */ }
  if (!standalone && protectedName(filename) || managed.some(name => String(name).toLowerCase() === canonical(filename).toLowerCase())) throw new Error('Manage launcher-provided mods on the Sloth Client page.');
  if (enabled === /\.jar$/i.test(filename)) return;
  const destination = path.join(dir, enabled ? canonical(filename) : `${filename}.disabled`);
  // Exclusive hard-link plus unlink avoids Windows rename replacing an existing mod.
  await fs.link(source, destination).catch(error => { if (error.code === 'EEXIST') throw new Error('Another copy already occupies that filename. Resolve it in your mods folder.'); throw error; });
  try { await fs.unlink(source); } catch (error) { await fs.unlink(destination).catch(() => {}); throw error; }
}

async function fingerprint(instanceDir, filename) {
  if (typeof filename !== 'string' || !SAFE.test(filename)) throw new Error('Invalid mod selection.');
  const file = path.join(instanceDir, 'mods', filename);
  const stat = await fs.lstat(file);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Only regular mod files can be inspected.');
  const hash = crypto.createHash('sha256');
  const handle = await fs.open(file, 'r');
  try { for await (const chunk of handle.createReadStream()) hash.update(chunk); } finally { await handle.close(); }
  return hash.digest('hex');
}

async function importFiles(instanceDir, files) {
  const dir = path.join(instanceDir, 'mods');
  await fs.mkdir(dir, { recursive: true });
  if ((await fs.realpath(dir)).toLowerCase() !== path.resolve(dir).toLowerCase()) throw new Error('Linked mod folders cannot be changed here.');
  const imported = [], skipped = [];
  for (const source of files.slice(0, 100)) {
    const filename = path.basename(source);
    if (!SAFE.test(filename) || !/\.jar$/i.test(filename) || protectedName(filename)) { skipped.push({ filename, reason: 'Not a supported personal mod filename.' }); continue; }
    const stat = await fs.lstat(source);
    if (!stat.isFile() || stat.isSymbolicLink()) { skipped.push({ filename, reason: 'Not a regular file.' }); continue; }
    const meta = await metadata(source);
    if (meta.problem || !meta.id) { skipped.push({ filename, reason: meta.problem || 'Missing Fabric mod ID.' }); continue; }
    try {
      await fs.copyFile(source, path.join(dir, filename), require('node:fs').constants.COPYFILE_EXCL);
      imported.push(filename);
    } catch (error) {
      skipped.push({ filename, reason: error.code === 'EEXIST' ? 'Already exists; the existing file was preserved.' : 'Could not copy this file.' });
    }
  }
  return { imported, skipped };
}

function compatibilitySummary(report) {
  const conflicts=report.mods.filter(m=>m.enabled&&m.issues.length).length;
  const unresolved=report.compatibility?.unresolved||0, truncated=Boolean(report.compatibility?.truncated);
  const warnings=[];
  if(conflicts)warnings.push(conflicts+' enabled mods have compatibility notices.');
  if(unresolved)warnings.push(unresolved+' required dependencies need review after nested-library inspection.');
  if(truncated)warnings.push('Inspection is limited to 1,000 files; additional mods were not checked.');
  return {level:warnings.length?'warn':'good',detail:warnings.length?warnings.join(' ')+' Review Mod Manager. Fabric resolves the complete dependency graph during launch.':report.enabled+' installed mods enabled. No recognized top-level conflicts; managed pack files are prepared during launch.'};
}
module.exports = { inspect, toggle, fingerprint, importFiles, compatibilitySummary };
