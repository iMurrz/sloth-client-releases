const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const tools = require('./file-tools');

// A small, explicit preference document. No account/skin/cape/world/mod folders are read.
const HUD = new Set(['coordinates', 'inventory', 'fps', 'ping', 'cps', 'memory', 'clock', 'server_address', 'armor_status', 'potion_effects', 'keystrokes', 'direction', 'saturation', 'speed', 'reach', 'combo', 'playtime', 'stopwatch', 'day_counter', 'pack_display', 'looking_at', 'cooldowns', 'health_hud', 'hunger_hud', 'air_hud', 'xp_hud', 'held_item_hud', 'offhand_hud', 'light_hud', 'biome_hud', 'dimension_hud', 'movement_hud', 'item_count_hud', 'entities_hud']);
const VISUAL = new Set(['main_menu', 'menu_theme', 'crosshair', 'zoom', 'freelook', 'better_sounds']);
const CHOICES = new Set(['format', 'shape', 'mode', 'style']);
const NAME = /^[A-Za-z0-9 _-]{1,24}$/;
const validName = value => typeof value === 'string' && NAME.test(value) && !/^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i.test(value.trim()) && value === value.trim();
const MAX = 1024 * 1024;
const object = v => v && typeof v === 'object' && !Array.isArray(v);
function cleanSetup(input, choices) {
  const out = { modules: {} };
  if (!object(input)) return out;
  for (const [id, m] of Object.entries(object(input.modules) ? input.modules : {})) {
    if (!(choices.hud && HUD.has(id) || choices.visual && VISUAL.has(id)) || !object(m)) continue;
    const next = { settings: {} };
    for (const k of ['enabled', 'favorite']) if (typeof m[k] === 'boolean') next[k] = m[k];
    for (const k of ['x', 'y']) if (HUD.has(id) && Number.isFinite(m[k])) next[k] = Math.max(0, Math.min(1, m[k]));
    for (const [k, v] of Object.entries(object(m.settings) ? m.settings : {}).slice(0, 64)) {
      if (!/^[a-z][a-z0-9_]{0,40}$/.test(k)) continue;
      if (typeof v === 'boolean' || typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= 1e6) next.settings[k] = v;
      else if (k === 'hud_group' && typeof v === 'string' && /^[A-Za-z0-9 _-]{0,32}$/.test(v)) next.settings[k] = v;
      else if (CHOICES.has(k) && typeof v === 'string' && /^[A-Za-z0-9 /+.,%-]{1,40}$/.test(v)) next.settings[k] = v;
      else if (object(v) && /^#[a-f0-9]{8}$/i.test(v.argb)) next.settings[k] = { argb: v.argb, chroma: v.chroma === true };
    }
    out.modules[id] = next;
  }
  if (choices.hud) for (const k of ['hudHidden', 'hudInF3']) if (typeof input[k] === 'boolean') out[k] = input[k];
  return out;
}
function cleanLauncher(input) {
  const out = {};
  if (!object(input)) return out;
  if (['pink', 'violet', 'ocean', 'ember'].includes(input.accent)) out.accent = input.accent;
  if (object(input.accessibility)) {
    out.accessibility = {};
    if ([1, 1.15, 1.3].includes(input.accessibility.textScale)) out.accessibility.textScale = input.accessibility.textScale;
    for (const k of ['reduceMotion', 'highContrast']) if (typeof input.accessibility[k] === 'boolean') out.accessibility[k] = input.accessibility[k];
  }
  return out;
}
function choicesOf(input) { return { hud: input?.hud === true, visual: input?.visual === true, profiles: input?.profiles === true, launcher: input?.launcher === true }; }
async function json(file, optional = false) {
  const stat = await tools.plain(file, optional);
  if (!stat) return {};
  if (!stat.isFile() || stat.size > MAX) throw new Error('Preference file must be a regular JSON file under 1 MB.');
  const text = await fs.readFile(file, 'utf8');
  if (Buffer.byteLength(text) > MAX) throw new Error('Preference file exceeds 1 MB.');
  const result = JSON.parse(text);
  if (!object(result)) throw new Error('Invalid preference document.');
  return result;
}
async function write(file, data) {
  await tools.plain(file, true);
  const tmp = file + '.' + crypto.randomUUID() + '.partial';
  try { await fs.writeFile(tmp, JSON.stringify(data, null, 2), { flag: 'wx' }); await fs.rename(tmp, file); }
  finally { await fs.unlink(tmp).catch(() => {}); }
}
class PreferenceSync {
  constructor(file) { this.file = file; this.folder = ''; this.plan = null; }
  async init() { const saved = await json(this.file, true); if (typeof saved.folder === 'string' && path.isAbsolute(saved.folder)) this.folder = saved.folder; }
  status() { return { folder: this.folder, enabled: Boolean(this.folder) }; }
  async choose(folder) {
    if (folder) { const stat = await tools.plain(folder); if (!stat.isDirectory() || !path.isAbsolute(folder)) throw new Error('Choose a regular folder.'); }
    await write(this.file, { folder }); this.folder = folder; this.plan = null; return this.status();
  }
  async document() {
    if (!this.folder) throw new Error('Choose a sync folder first.');
    return tools.guard(this.folder, path.join(this.folder, 'sloth-preferences-v1.json'), true);
  }
  async publish(root, settings, input) {
    const choices = choicesOf(input);
    if (!Object.values(choices).some(Boolean)) throw new Error('Select at least one preference group.');
    if (choices.profiles && !choices.hud && !choices.visual) throw new Error('Choose HUD or visual preferences to include in named profiles.');
    const dir = path.join(root, 'config', 'sloth-client'); await tools.guard(root, dir, true);
    const current = cleanSetup(await json(path.join(dir, 'modules.json'), true), choices);
    const profiles = [];
    if (choices.profiles) {
      const folder = path.join(dir, 'profiles'); await tools.guard(root, folder, true);
      const names = await fs.readdir(folder).catch(e => { if (e.code === 'ENOENT') return []; throw e; });
      for (const name of names.filter(n => n.endsWith('.json') && validName(n.slice(0, -5))).sort().slice(0, 30)) profiles.push({ name: name.slice(0, -5), setup: cleanSetup(await json(path.join(folder, name)), choices) });
    }
    const doc = { format: 'sloth-preferences', version: 1, publishedAt: new Date().toISOString(), current, profiles, launcher: choices.launcher ? cleanLauncher(settings) : {} };
    if (Buffer.byteLength(JSON.stringify(doc)) > MAX) throw new Error('Selected preferences exceed 1 MB.');
    await write(await this.document(), doc); this.plan = null;
    return { modules: Object.keys(current.modules).length, profiles: profiles.length };
  }
  async review(root, instanceId, input) {
    const file = await this.document(), choices = choicesOf(input);
    const stat = await tools.plain(file);
    if (!stat.isFile() || stat.size > MAX) throw new Error('Preference file must be a regular JSON file under 1 MB.');
    const bytes = await fs.readFile(file);
    if (bytes.length > MAX) throw new Error('Preference file exceeds 1 MB.');
    const doc = JSON.parse(bytes.toString('utf8'));
    if (!object(doc) || !Object.values(choices).some(Boolean)) throw new Error('Select preference groups and review a valid document.');
    if (choices.profiles && !choices.hud && !choices.visual) throw new Error('Choose HUD or visual preferences to include in named profiles.');
    if (doc.format !== 'sloth-preferences' || doc.version !== 1) throw new Error('This is not a supported Sloth preference document.');
    const current = cleanSetup(doc.current, choices), profiles = [];
    const seen = new Set();
    for (const p of (choices.profiles && Array.isArray(doc.profiles) ? doc.profiles : []).slice(0, 30)) {
      if (!object(p) || !validName(p.name) || seen.has(p.name.toLowerCase())) continue;
      seen.add(p.name.toLowerCase()); profiles.push({ name: p.name, setup: cleanSetup(p.setup, choices) });
    }
    const dir = path.join(root, 'config', 'sloth-client'); await tools.guard(root, dir, true);
    const profileFolder = path.join(dir, 'profiles'); await tools.guard(root, profileFolder, true);
    const existing = new Set((await fs.readdir(profileFolder).catch(e => { if (e.code === 'ENOENT') return []; throw e; })).map(n => n.toLowerCase()));
    const skipped = profiles.filter(p => existing.has((p.name + '.json').toLowerCase())).map(p => p.name);
    const fresh = profiles.filter(p => !existing.has((p.name + '.json').toLowerCase()));
    const token = crypto.randomUUID();
    this.plan = { token, root, instanceId, current, profiles: fresh, launcher: choices.launcher ? cleanLauncher(doc.launcher) : {}, hash: crypto.createHash('sha256').update(bytes).digest('hex'), created: Date.now() };
    const before=await json(path.join(dir,'modules.json'),true);this.plan.beforeHash=crypto.createHash('sha256').update(JSON.stringify(before)).digest('hex');
    const changes=[];let sequence=0;
    for(const [id,m] of Object.entries(current.modules)){for(const [key,v] of Object.entries(m)){if(key==='settings'){for(const [setting,value] of Object.entries(v))if(JSON.stringify(before.modules?.[id]?.settings?.[setting])!==JSON.stringify(value))changes.push({id:String(sequence++),type:'setting',module:id,key:setting,before:before.modules?.[id]?.settings?.[setting]??'unset',after:value,label:id+' / '+setting});}else if(JSON.stringify(before.modules?.[id]?.[key])!==JSON.stringify(v))changes.push({id:String(sequence++),type:'module',module:id,key,before:before.modules?.[id]?.[key]??'unset',after:v,label:id+' / '+key});}}
    for(const key of ['hudHidden','hudInF3'])if(Object.hasOwn(current,key)&&before[key]!==current[key])changes.push({id:String(sequence++),type:'root',key,before:before[key]??'unset',after:current[key],label:key});
    for(const p of fresh)changes.push({id:String(sequence++),type:'profile',key:p.name,before:'not saved',after:'new profile',label:'New profile: '+p.name});
    for(const [key,v] of Object.entries(this.plan.launcher))changes.push({id:String(sequence++),type:'launcher',key,before:'current launcher preferences',after:v,label:'Launcher / '+key});this.plan.changes=changes;
    return { token, changes:changes.map(({id,label,before,after})=>({id,label,before,after})), publishedAt: typeof doc.publishedAt === 'string' ? doc.publishedAt.slice(0, 40) : '', modules: Object.keys(current.modules).length, profileNames: fresh.map(p => p.name), skipped, launcher: Object.keys(this.plan.launcher), note: 'Existing profile names are skipped. Selected module values merge into your setup. Accounts, commands, keybinds, server associations, video options and capes are excluded.' };
  }
  async apply(root, instanceId, request) {
    const token=typeof request==='string'?request:request?.token;
    let plan = this.plan;
    if (!plan || token !== plan.token || root !== plan.root || instanceId !== plan.instanceId || Date.now() - plan.created > 10 * 60 * 1000) throw new Error('Review this instance’s preferences again.');
    const document = await this.document();
    const stat = await tools.plain(document);
    if (!stat.isFile() || stat.size > MAX) throw new Error('Preference document changed or exceeds the size limit. Review again.');
    const hash = crypto.createHash('sha256').update(await fs.readFile(document)).digest('hex');
    if (hash !== plan.hash) throw new Error('The sync document changed. Review it again before importing.');
    const dir = path.join(root, 'config', 'sloth-client'); await tools.guard(root, dir, true);
    const file = path.join(dir, 'modules.json'), before = await json(file, true);
    if(crypto.createHash('sha256').update(JSON.stringify(before)).digest('hex')!==plan.beforeHash)throw new Error('Your module setup changed after review. Review it again.');
    if(!Array.isArray(request?.ids)||request.ids.length>4096)throw new Error('Select a bounded list of reviewed changes.');
    const selected=new Set(request.ids);if(!selected.size||[...selected].some(id=>!plan.changes.some(c=>c.id===id)))throw new Error('Select valid reviewed preference changes.');
    const current={modules:{}},profiles=[],launcher={};for(const c of plan.changes.filter(c=>selected.has(c.id))){if(c.type==='profile'){profiles.push(plan.profiles.find(p=>p.name===c.key));continue;}if(c.type==='launcher'){launcher[c.key]=plan.launcher[c.key];continue;}if(c.type==='root'){current[c.key]=c.after;continue;}current.modules[c.module]??={settings:{}};if(c.type==='setting')current.modules[c.module].settings[c.key]=c.after;else current.modules[c.module][c.key]=c.after;}
    plan={...plan,current,profiles,launcher};
    const merged = { ...before, ...plan.current, modules: { ...(object(before.modules) ? before.modules : {}) } };
    for (const [id, m] of Object.entries(plan.current.modules)) merged.modules[id] = { ...merged.modules[id], ...m, settings: { ...(merged.modules[id]?.settings || {}), ...m.settings } };
    await fs.mkdir(dir, { recursive: true });
    const profileDir = path.join(dir, 'profiles'); await tools.guard(root, profileDir, true); await fs.mkdir(profileDir, { recursive: true });
    const created = [];
    try {
      // Never replace an existing named profile, even if it appeared after review.
      for (const p of plan.profiles) {
        const target = path.join(profileDir, p.name + '.json');
        await fs.writeFile(target, JSON.stringify(p.setup, null, 2), { flag: 'wx' }); created.push(target);
      }
      const snapshot = path.join(dir, 'sync-before-import.json'); await write(snapshot, before);
      await write(file, merged); this.plan = null;
    } catch (error) {
      for (const target of created) { await tools.guard(root, target); await fs.unlink(target); }
      throw error;
    }
    return { launcher: plan.launcher, modules: Object.keys(plan.current.modules).length, profiles: plan.profiles.length };
  }
  async restore(root) {
    const dir = path.join(root, 'config', 'sloth-client'); await tools.guard(root, dir);
    const before = await json(path.join(dir, 'sync-before-import.json'));
    await write(path.join(dir, 'modules.json'), before);
    return true;
  }
}
module.exports = { PreferenceSync };
