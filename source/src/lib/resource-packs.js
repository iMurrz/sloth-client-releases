const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { openZip } = require('./zip');

// This build is locked to 1.21.11, whose resource format is 75.
const FORMAT = 75;
async function plain(file, optional = false) {
  try {
    const stat = await fs.lstat(file);
    if (stat.isSymbolicLink()) throw new Error('Linked resource-pack files and folders are not supported.');
    return stat;
  } catch (error) { if (optional && error.code === 'ENOENT') return null; throw error; }
}
async function guard(dir) {
  await plain(path.dirname(dir)); await plain(dir, true); await plain(path.join(dir, 'resourcepacks'), true);
}
async function options(dir) {
  const file = path.join(dir, 'options.txt');
  await plain(file, true);
  const text = await fs.readFile(file, 'utf8').catch(error => { if (error.code === 'ENOENT') return ''; throw error; });
  let selected = [];
  try { selected = JSON.parse(text.match(/^resourcePacks:(\[[^\r\n]*\])\r?$/m)?.[1] || '[]'); } catch { throw new Error('Minecraft resource-pack settings are damaged. Restore options.txt before changing packs.'); }
  if (!Array.isArray(selected) || selected.some(x => typeof x !== 'string')) throw new Error('Invalid resource-pack selection.');
  return { text, selected };
}
function description(value) {
  if (typeof value === 'string') return value.slice(0, 300);
  if (Array.isArray(value)) return value.map(description).join('').slice(0, 300);
  return value && typeof value === 'object' ? `${value.text || ''}${description(value.extra || [])}`.slice(0, 300) : '';
}
async function inspectPack(file, name, selected) {
  const issues = [];
  let zip, format = null, summary = '';
  try {
    const stat = await plain(file);
    let entries, read;
    if (stat.isDirectory()) {
      const metadata = path.join(file, 'pack.mcmeta'); await plain(metadata);
      if ((await fs.stat(metadata)).size > 256 * 1024) throw new Error('Pack metadata is too large.');
      read = () => fs.readFile(metadata);
      entries = [];
    } else {
      zip = await openZip(file); entries = zip.entries;
      const e = entries.find(e => e.name === 'pack.mcmeta');
      if (!e || e.uncompressedSize > 256 * 1024 || e.compressedSize > 256 * 1024) throw new Error('Missing or oversized pack.mcmeta.');
      read = () => zip.read(e);
    }
    const data = JSON.parse((await read()).toString('utf8'));
    if (!data.pack) throw new Error('Missing pack metadata.');
    const p = data.pack;
    const number = x => Array.isArray(x) ? Number(x[0]) : Number(x);
    format = number(p.pack_format ?? p.min_format);
    const support = p.supported_formats;
    const lo = number(p.min_format ?? (Array.isArray(support) ? support[0] : support?.min_inclusive) ?? support ?? p.pack_format);
    const hi = number(p.max_format ?? (Array.isArray(support) ? support[1] : support?.max_inclusive) ?? support ?? p.pack_format);
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) issues.push('Pack has no valid version range.');
    else if (FORMAT < lo || FORMAT > hi) issues.push(`Pack format ${lo}${lo !== hi ? `–${hi}` : ''} does not include Minecraft 1.21.11 (75).`);
    summary = description(p.description);
    // Known fatal import from newer Minecraft text shaders, found in the legacy shader pack.
    const shader = entries.find(e => e.name === 'assets/minecraft/shaders/core/text.vsh');
    if (shader && shader.uncompressedSize <= 128 * 1024 && shader.compressedSize <= 128 * 1024 && /#moj_import\s+<minecraft:sample_lightmap\.glsl>/.test((await zip.read(shader)).toString())) {
      issues.push('Text shader imports sample_lightmap.glsl, which is missing in Minecraft 1.21.11. This can fail the entire resource reload.');
    }
    if (entries.some(e => /assets\/minecraft\/optifine\/cit\//.test(e.name))) issues.push('OptiFine custom item rules need a compatible renderer; vanilla does not apply them.');
    return { name, selected, description: summary, format, issues, directory: stat.isDirectory() };
  } catch (error) { return { name, selected, description: '', format, issues: [error.message], damaged: true }; }
  finally { await zip?.close(); }
}
async function inspect(dir) {
  await guard(dir);
  const { selected } = await options(dir);
  const folder = path.join(dir, 'resourcepacks');
  const names = await fs.readdir(folder).catch(error => { if (error.code === 'ENOENT') return []; throw error; });
  const packs = [];
  for (const name of names.slice(0, 250)) {
    if (name.startsWith('.')) continue;
    const stat = await plain(path.join(folder, name));
    if (!stat.isDirectory() && !/\.zip$/i.test(name)) continue;
    packs.push(await inspectPack(path.join(folder, name), name, selected.includes(`file/${name}`)));
  }
  const missing = selected.filter(x => x.startsWith('file/') && !packs.some(p => `file/${p.name}` === x));
  return { packs, selected, missing, truncated: names.length > 250, note: 'Selected packs override earlier packs in this list. The last selected pack has highest priority. Metadata checks cannot guarantee every texture or effect will render.' };
}
async function change(dir, { name, action } = {}) {
  if (typeof name !== 'string' || name !== path.basename(name) || /[\r\n\0]/.test(name) || !['enable', 'disable', 'up', 'down'].includes(action)) throw new Error('Invalid pack change.');
  const report = await inspect(dir);
  const pack = report.packs.find(p => p.name === name);
  if (!pack && !(action === 'disable' && report.missing.includes(`file/${name}`))) throw new Error('Resource pack was not found.');
  if (action === 'enable' && pack.damaged) throw new Error('This resource pack cannot be read.');
  const { text, selected } = await options(dir);
  const key = `file/${name}`; const index = selected.indexOf(key);
  if (action === 'enable' && index < 0) selected.push(key);
  if (action === 'disable' && index >= 0) selected.splice(index, 1);
  if ((action === 'up' || action === 'down') && index >= 0) {
    const other = index + (action === 'up' ? -1 : 1);
    if (other >= 0 && other < selected.length && selected[other].startsWith('file/')) [selected[index], selected[other]] = [selected[other], selected[index]];
  }
  const line = `resourcePacks:${JSON.stringify(selected)}`;
  const newline = text.includes('\r\n') ? '\r\n' : '\n';
  let next = /^resourcePacks:/m.test(text) ? text.replace(/^resourcePacks:[^\r\n]*/m, line) : `${text}${text && !text.endsWith('\n') ? newline : ''}${line}${newline}`;
  let accepted;
  try { accepted = JSON.parse(text.match(/^incompatibleResourcePacks:(\[[^\r\n]*\])\r?$/m)?.[1] || '[]'); } catch { throw new Error('Minecraft compatibility settings are damaged. Restore options.txt first.'); }
  if (!Array.isArray(accepted) || accepted.some(x => typeof x !== 'string')) throw new Error('Invalid compatibility selection.');
  accepted = accepted.filter(x => x !== key);
  if (action !== 'disable' && selected.includes(key) && pack?.issues.some(x => x.includes('does not include Minecraft'))) accepted.push(key);
  const acceptedLine = `incompatibleResourcePacks:${JSON.stringify(accepted)}`;
  next = /^incompatibleResourcePacks:/m.test(next) ? next.replace(/^incompatibleResourcePacks:[^\r\n]*/m, acceptedLine) : next + `${next.endsWith('\n') ? '' : newline}${acceptedLine}${newline}`;
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, 'options.txt'); const temp = file + '.' + crypto.randomUUID() + '.partial';
  if (text) { await plain(file + '.sloth-pack-backup', true); await fs.writeFile(file + '.sloth-pack-backup', text); }
  try { await fs.writeFile(temp, next, { flag: 'wx' }); await fs.rename(temp, file); }
  finally { await fs.rm(temp, { force: true }); }
  return inspect(dir);
}
async function inspectAsset(dir, asset) {
  if(typeof asset!=='string'||!/^assets\/[a-z0-9_.-]+\/[a-z0-9_./-]{1,200}$/.test(asset)||asset.split('/').some(x=>x==='..'||x==='.'||!x))throw new Error('Enter a resource path such as assets/minecraft/font/default.json.');
  const report=await inspect(dir),providers=[],summaries=[];
  const selected=report.selected.filter(n=>n.startsWith('file/')).slice(-30);
  for(let index=0;index<selected.length;index++) {
    const key=selected[index],pack=report.packs.find(p=>'file/'+p.name===key);if(!pack||pack.damaged){summaries.push({name:pack?.name||key.slice(5),priority:index+1,unreadable:true,issues:pack?.issues||['Selected pack was missing or outside the inspection limit.']});continue;}
    const file=path.join(dir,'resourcepacks',pack.name);let zip;
    try {
      if(pack.directory) {
        const target=path.join(file,...asset.split('/'));await require('./file-tools').guard(file,target,true);
        const stat=await plain(target,true);if(stat?.isFile())providers.push({name:pack.name,priority:index+1});
        summaries.push({name:pack.name,priority:index+1,directory:true,issues:pack.issues});
      } else {
        zip=await openZip(file);const entries=zip.entries.filter(e=>!e.directory&&e.name.startsWith('assets/'));
        if(entries.some(e=>e.name===asset))providers.push({name:pack.name,priority:index+1});
        summaries.push({name:pack.name,priority:index+1,assets:entries.length,fonts:entries.filter(e=>e.name.includes('/font/')).length,items:entries.filter(e=>e.name.includes('/textures/item/')).length,gui:entries.filter(e=>e.name.includes('/textures/gui/')).length,issues:pack.issues});
      }
    }catch(e){summaries.push({name:pack.name,priority:index+1,unreadable:true,issues:[e.message]});}finally{await zip?.close();}
  }
  return {asset,providers,winner:providers.at(-1)?.name||null,packs:summaries,limited:report.selected.filter(n=>n.startsWith('file/')).length>30,note:'Last matching inspected pack has highest file priority among readable packs. Missing or unreadable packs cannot be resolved. Built-in/mod resources, pack filters, overlays, inherited fonts and runtime transforms are not simulated. Folder packs are checked for this file only.'};
}
module.exports = { inspect, change, inspectAsset };
