const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const PROFILES = {
  quiet: { maxFps: '60', renderDistance: '8', simulationDistance: '5', particles: '1', enableVsync: 'true', entityDistanceScaling: '0.75' },
  balanced: { maxFps: '144', renderDistance: '12', simulationDistance: '8', particles: '0', enableVsync: 'false', entityDistanceScaling: '1.0' },
  performance: { maxFps: '240', renderDistance: '8', simulationDistance: '5', particles: '2', enableVsync: 'false', entityDistanceScaling: '0.75' },
  visual: { maxFps: '120', renderDistance: '16', simulationDistance: '8', particles: '0', enableVsync: 'false', entityDistanceScaling: '1.0' }
};
async function apply(dir, id, keys = Object.keys(PROFILES[id] || {})) {
  const profile = PROFILES[id]; if (!profile) throw new Error('Unknown performance profile.');
  for (const f of [path.dirname(dir), dir, path.join(dir, 'options.txt'), path.join(dir, 'options.txt.sloth-preset-backup')]) {
    const stat = await fs.lstat(f).catch(e => { if (e.code === 'ENOENT') return null; throw e; });
    if (stat?.isSymbolicLink()) throw new Error('Performance profiles do not follow linked files.');
  }
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, 'options.txt');
  let text = await fs.readFile(file, 'utf8').catch(e => { if (e.code === 'ENOENT') return ''; throw e; });
  const newline = text.includes('\r\n') ? '\r\n' : '\n';
  const entries = [];
  for (const [key, value] of Object.entries(profile).filter(([key])=>keys.includes(key))) {
    const pattern = new RegExp(`^${key}:[^\\r\\n]*`, 'm');
    const old = text.match(pattern)?.[0]?.slice(key.length + 1) ?? null;
    if (old === value) continue;
    entries.push({ key, before: old, after: value });
    text = pattern.test(text) ? text.replace(pattern, `${key}:${value}`) : `${text}${text && !text.endsWith('\n') ? newline : ''}${key}:${value}${newline}`;
  }
  await fs.writeFile(file + '.sloth-preset-backup', JSON.stringify({ version: 2, entries }));
  if (!entries.length) return profile;
  const temp = file + '.' + crypto.randomUUID() + '.partial';
  try { await fs.writeFile(temp, text, { flag: 'wx' }); await fs.rename(temp, file); }
  finally { await fs.rm(temp, { force: true }); }
  return profile;
}
async function prepareRestore(dir) {
  const tools=require('./file-tools'), file=path.join(dir,'options.txt'), backup=file+'.sloth-preset-backup';
  await tools.guard(dir,file,true); await tools.guard(dir,backup);
  if ((await fs.stat(backup)).size > 1048576) throw new Error('Preset backup exceeds the size limit.');
  let data; try { data=JSON.parse(await fs.readFile(backup,'utf8')); } catch { throw new Error('This older preset backup cannot be safely undone. Review and apply a new preset first.'); }
  if(data.version!==2||!Array.isArray(data.entries)) throw new Error('Unsupported preset backup.');
  const original=await fs.readFile(file,'utf8').catch(e=>{if(e.code==='ENOENT')return '';throw e;});let text=original;
  for(const entry of data.entries) {
    if(!Object.values(PROFILES).some(p=>Object.hasOwn(p,entry.key)) || typeof entry.after!=='string' || (entry.before!==null&&typeof entry.before!=='string')) throw new Error('Invalid preset backup.');
    const pattern=new RegExp(`^${entry.key}:[^\\r\\n]*`,'m');
    if(text.match(pattern)?.[0]?.slice(entry.key.length+1)!==entry.after) throw new Error(`${entry.key} changed since the preset. Undo was cancelled to preserve your newer settings.`);
    text=entry.before===null?text.replace(new RegExp(`^${entry.key}:[^\\r\\n]*(?:\\r?\\n|$)`,'m'),''):text.replace(pattern,()=>`${entry.key}:${entry.before}`);
  }
  return {file,original,text};
}
async function restore(dir, prepared) {
  const plan=prepared||await prepareRestore(dir);const checked=await prepareRestore(dir);
  if(checked.original!==plan.original)throw new Error('Minecraft options changed during Undo. Try again.');
  if(plan.text===plan.original)return;
  const temp=plan.file+'.'+crypto.randomUUID()+'.partial';try{await fs.writeFile(temp,plan.text,{flag:'wx'});await fs.rename(temp,plan.file);}finally{await fs.unlink(temp).catch(()=>{});}
}
const LABELS={maxFps:'Frame limit',renderDistance:'Render distance',simulationDistance:'Simulation distance',particles:'Particles',enableVsync:'VSync',entityDistanceScaling:'Entity render distance'};
function display(key,value){if(value==null)return 'Minecraft default';if(key==='particles')return ({'0':'All','1':'Decreased','2':'Minimal'})[value]||String(value);if(key==='enableVsync')return value==='true'?'On':'Off';if(key==='maxFps')return `${value} FPS`;if(key==='renderDistance'||key==='simulationDistance')return `${value} chunks`;if(key==='entityDistanceScaling')return `${Math.round(Number(value)*100)}%`;return String(value);}
module.exports = { apply, restore, prepareRestore, PROFILES, LABELS, display };
