const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const os = require('node:os');
function importLunarSettings(target) {
const source = path.join(os.homedir(), '.lunarclient');
const config = path.join(target, 'config/sloth-client');
function readText(file) {
  const resolved=path.resolve(file),roots=[path.resolve(source),path.resolve(target)];
  const base=roots.find(root=>resolved.startsWith(root+path.sep));
  if(!base)throw Error('Unsupported settings source.');
  let check=resolved;
  while(check!==path.dirname(base)){if(fs.existsSync(check)&&fs.lstatSync(check).isSymbolicLink())throw Error('Linked settings files are unsupported.');check=path.dirname(check);}
  const stat=fs.statSync(resolved);if(!stat.isFile()||stat.size>4*1024*1024)throw Error('Settings file exceeds import size limit.');
  return fs.readFileSync(resolved,'utf8');
}

const manager = JSON.parse(readText(path.join(source, 'settings/game/profile_manager.json')));
const active = manager.find(p => p.active);
if (!active || !/^[A-Za-z0-9 _-]{1,64}$/.test(active.name || '')) throw Error('Lunar active profile name is unsupported.');
const profile = path.join(source, 'settings/game', active.name);
const lunarMods = JSON.parse(readText(path.join(profile, 'mods.json')));
const lunarOptions = JSON.parse(readText(path.join(source, 'profiles/main/optionsLC.txt')));
const general = JSON.parse(readText(path.join(profile, 'general.json')));
const modules = JSON.parse(readText(path.join(config, 'modules.json')));
const report = { sourceProfile: active.name, minecraftOptions: [], moduleChanges: [], skipped: [], notes: [] };
const backup = path.join(target, 'settings-backups', 'before-lunar-import-' + new Date().toISOString().replace(/[:.]/g, '-'));
const updates = new Map();
function guard(file) {
  let check = path.resolve(file);
  const root = path.resolve(target);
  if (!check.startsWith(root + path.sep)) throw Error('Import destination is outside the Sloth instance.');
  while (check !== path.dirname(root)) {
    if (fs.existsSync(check) && fs.lstatSync(check).isSymbolicLink()) throw Error('Linked settings paths are unsupported.');
    check = path.dirname(check);
  }
}
const optionsFile = path.join(target, 'options.txt');
const options = new Map(readText(optionsFile, 'utf8').split(/\r?\n/).filter(Boolean).map(l => {const i=l.indexOf(':'); return [l.slice(0,i),l.slice(i+1)];}));
const bindings = new Set(['mod_menu','zoom','freelook','toggle_hud','stopwatch',...Array.from({length:6},(_,i)=>'hotkey_'+(i+1))]);
for(const [key,value]of [...options]){const match=/^key_key\.([^.]+)\.([^.]+)$/.exec(key);if(match&&match[1].endsWith('-client')&&match[1]!=='sloth-client'&&bindings.has(match[2])){options.delete(key);options.set('key_key.sloth-client.'+match[2],value);}}
const exclude = new Set(['version','resourcePacks','incompatibleResourcePacks','lastServer','lastMpIp','soundDevice']);
for (const [key, original] of options) {
  if (exclude.has(key) || lunarOptions[key] === undefined || (!key.startsWith('key_key.') && key.startsWith('key_'))) continue;
  let value = String(lunarOptions[key]);
  if (key.startsWith('key_') && !/^key\.(keyboard|mouse)\.[a-z0-9.]+$/.test(value)) { report.skipped.push(key); continue; }
  // Minecraft 1.21.11's Options.java codec stores FOV as (degrees - 70) / 40.
  if (key === 'fov') { const degrees=Number(value); if (!Number.isFinite(degrees)||degrees<30||degrees>110) throw Error('Invalid Lunar FOV'); value=String((degrees-70)/40); }
  else if (original.startsWith('"')) value = JSON.stringify(value);
  else if (original === 'true' || original === 'false') { if (!['true','false'].includes(value)) {report.skipped.push(key);continue;} }
  else if (Number.isFinite(Number(original))) { if (!Number.isFinite(Number(value))) {report.skipped.push(key);continue;} }
  if (value !== original) {options.set(key,value);report.minecraftOptions.push(key);}
}
const bindMap={'key_Mod Menu':'mod_menu','key_Zoom Key':'zoom','key_Freelook':'freelook'};
for (const [lunar, sloth] of Object.entries(bindMap)) if (/^key\.(keyboard|mouse)\.[a-z0-9.]+$/.test(lunarOptions[lunar] || '')) options.set('key_key.sloth-client.' + sloth,lunarOptions[lunar]);
const mapping={FPS:'fps',CPS:'cps',ZOOM:'zoom',ARMORSTATUS:'armor_status',KEYSTROKES:'keystrokes',COORDINATES:'coordinates',DAY_COUNTER:'day_counter',CROSSHAIR:'crosshair',POTION_EFFECTS:'potion_effects',DIRECTION_HUD:'direction',ITEM_COUNTER:'item_count_hud',PING:'ping',PARTICLE_CHANGER:'particles',COOLDOWNS:'cooldowns',CLOCK:'clock',STOPWATCH:'stopwatch',PLAYTIME:'playtime',MEMORY:'memory',COMBO:'combo',REACH_DISPLAY:'reach',TIME_CHANGER:'time_changer',SERVER_ADDRESS:'server_address',SATURATION:'saturation',AUTO_TEXT_HOTKEY:'hotkeys',AUTO_TEXT_ACTIONS:'auto_text_actions',FREELOOK:'freelook',PACK_DISPLAY:'pack_display',WEATHER_CHANGER:'weather_changer',WAILA:'looking_at'};
for (const [lunar,sloth] of Object.entries(mapping)) {
  const from=lunarMods[lunar],to=modules.modules[sloth]; if(!from||!to)continue;
  if(typeof from.enabled==='boolean'){to.enabled=from.enabled;report.moduleChanges.push(sloth+': enabled='+from.enabled);}
  if(typeof from.options?.scale==='number' && typeof to.settings.scale==='number'){to.settings.scale=Math.max(.5,Math.min(2.5,from.options.scale));report.moduleChanges.push(sloth+': scale='+to.settings.scale);}
  if(from.x!==undefined||from.y!==undefined||from.position) report.skipped.push(lunar+': HUD anchoring/position uses a different coordinate system');
}
if(lunarMods.TOGGLE_SNEAK?.enabled===false){modules.modules.sprint.enabled=false;modules.modules.sneak.enabled=false;report.moduleChanges.push('sprint/sneak: disabled to match Lunar');}
const facing=lunarMods.COORDINATES?.COORDINATES_DIRECTION_CHILD?.enabled;
if(typeof facing==='boolean') modules.modules.coordinates.settings.facing=facing;
const text=lunarMods.AUTO_TEXT_HOTKEY?.options?.['1hotkey'];
if(typeof text?.value==='string' && text.value.length<=256){
  modules.modules.hotkeys.settings.text_1=text.value;
  const key=text['1hotkey']?.value;
  if(/^KEY_[A-Z0-9]$/.test(key||'')) {
    const binding='key.keyboard.'+key.slice(4).toLowerCase();options.set('key_key.sloth-client.hotkey_1',binding);
    report.moduleChanges.push('hotkeys: slot 1 command and binding imported');
  }
}
for(const [key,value]of Object.entries(lunarMods))if(value&&typeof value==='object'&&!mapping[key]&&key!=='TOGGLE_SNEAK'&&(value.enabled!==undefined||value.options))report.skipped.push(key+': no exact Sloth module/settings conversion');
if(lunarMods.CROSSHAIR?.CROSSHAIR_NORMAL?.customCrosshair) report.skipped.push('CROSSHAIR: custom LCCH bitmap design is not converted; existing Sloth design preserved');
modules.activeProfile='Lunar Import';
modules.video={renderDistance:Number(options.get('renderDistance')),simulationDistance:Number(options.get('simulationDistance')),fpsLimit:Number(options.get('maxFps')),vsync:options.get('enableVsync')==='true',shadows:options.get('entityShadows')==='true',entityDistance:Number(options.get('entityDistanceScaling'))};
const prefsFile=path.join(config,'experience.json');
const prefs=fs.existsSync(prefsFile)?JSON.parse(readText(prefsFile)):{};
if(typeof general.compactMenu==='boolean') prefs.compact=general.compactMenu;
updates.set(optionsFile,[...options].map(([k,v])=>k+':'+v).join('\n')+'\n');
updates.set(path.join(config,'modules.json'),JSON.stringify(modules,null,2)+'\n');
updates.set(prefsFile,JSON.stringify(prefs,null,2)+'\n');
updates.set(path.join(config,'profiles/Lunar Import.json'),JSON.stringify(modules,null,2)+'\n');
report.notes.push('Resource-pack selections and Sloth theme preserved. Unstored Lunar defaults are not guessed.');
report.notes.push('Audio levels, including mute values, match available Lunar options.');
report.notes.push('Render/simulation distances imported at '+options.get('renderDistance')+'/'+options.get('simulationDistance')+' chunks; higher distances may cost performance.');
const inventory=[];
for(const file of updates.keys()) guard(file);
guard(backup);
fs.mkdirSync(backup, { recursive: true });
for(const [file,text]of updates){guard(file);const existed=fs.existsSync(file);const relative=path.relative(target,file);if(existed){const dest=path.join(backup,relative);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(file,dest,fs.constants.COPYFILE_EXCL);}inventory.push({file:relative,existed});}
fs.writeFileSync(path.join(backup,'restore-files.json'),JSON.stringify(inventory,null,2));
try {
  for(const [file,text]of updates){guard(file);fs.mkdirSync(path.dirname(file),{recursive:true});const temp=file+'.'+crypto.randomUUID()+'.tmp';try{fs.writeFileSync(temp,text,{flag:'wx'});fs.renameSync(temp,file);if(readText(file,'utf8')!==text)throw Error('Imported file did not match planned settings.');}finally{if(fs.existsSync(temp))fs.unlinkSync(temp);}}
} catch(error) {
  for(const item of inventory){const file=path.join(target,item.file);guard(file);if(item.existed)fs.copyFileSync(path.join(backup,item.file),file);else if(fs.existsSync(file))fs.unlinkSync(file);}
  throw Error('Settings import failed; previous files restored. Backup: '+backup);
}
report.backup=backup;report.changedFiles=[...updates.keys()].map(file=>path.relative(target,file));
fs.writeFileSync(path.join(backup,'import-report.json'),JSON.stringify(report,null,2));
return report;
}
module.exports = { importLunarSettings };
