const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const tools = require('./file-tools');
const { PROFILES, LABELS, display } = require('./performance');
const STYLES = {
  Mining: { video: 'balanced', hud: ['fps','coordinates','inventory','held_item_hud','cooldowns','direction'] },
  PvP: { video: 'performance', hud: ['fps','ping','cps','keystrokes','armor_status','potion_effects','saturation'] },
  Building: { video: 'visual', hud: ['fps','coordinates','looking_at','light_hud','held_item_hud','direction'] },
  Casual: { video: 'quiet', hud: ['fps','coordinates','clock','biome_hud'] }
};
const HUD = new Set(Object.values(STYLES).flatMap(s => s.hud).concat(['memory','server_address','speed','reach','combo','playtime','stopwatch','day_counter','pack_display','health_hud','hunger_hud','air_hud','xp_hud','offhand_hud','dimension_hud','movement_hud','item_count_hud','entities_hud']));
const VIDEO = ['maxFps','renderDistance','simulationDistance','particles','enableVsync','entityDistanceScaling'];
const NAME = /^[A-Za-z0-9 _-]{1,24}$/;
const digest = x => crypto.createHash('sha256').update(JSON.stringify(x)??'null').digest('hex');
class SessionPlanner {
  constructor(root) { this.root=root; this.review=null; }
  async read(file, fallback=null) {
    await tools.guard(this.root,file,true); const stat=await tools.plain(file,true);
    if (!stat) return fallback;
    if (!stat.isFile() || stat.size>2*1024**2) throw Error('Session configuration exceeds the safe read limit.');
    return fs.readFile(file,'utf8');
  }
  async write(file,text) {
    if(typeof text!=='string'||Buffer.byteLength(text)>2*1024**2)throw Error('Session configuration exceeds the safe storage limit.');
    await tools.guard(this.root,file,true); await fs.mkdir(path.dirname(file),{recursive:true});
    const tmp=file+'.'+crypto.randomUUID()+'.tmp';
    try { await fs.writeFile(tmp,text,{flag:'wx',mode:0o600}); await fs.rename(tmp,file); }
    finally { await fs.rm(tmp,{force:true}).catch(()=>{}); }
  }
  async stored(dir) { const text=await this.read(path.join(dir,'session-profiles.json'));const d=text?JSON.parse(text):{schema:1,profiles:[]};if(d.schema!==1||!Array.isArray(d.profiles)||d.profiles.length>30||d.profiles.some(p=>!p||typeof p.name!=='string'||!NAME.test(p.name)||typeof p.id!=='string'||!/^[-a-f0-9]{36}$/.test(p.id)||!p.setup||typeof p.setup!=='object'))throw Error('Invalid session profile library.');return d; }
  async status(dir) { const d=await this.stored(dir);return {styles:Object.keys(STYLES),profiles:d.profiles.map(p=>({id:p.id,name:p.name,createdAt:p.createdAt})),undoAvailable:!!await this.read(path.join(dir,'session-plan-undo.json'))}; }
  async capture(dir,current) {
    const modules=await this.read(path.join(dir,'config/sloth-client/modules.json'));
    const options=await this.read(path.join(dir,'options.txt'))||'';
    const values=Object.fromEntries(options.split(/\r?\n/).map(l=>[l.slice(0,l.indexOf(':')),l.slice(l.indexOf(':')+1)]).filter(([k])=>VIDEO.includes(k)||/^key_[A-Za-z0-9_.-]+$/.test(k)));
    return {launcher:{memoryMb:current.memoryMb,mods:current.mods},modules:modules?JSON.parse(modules):null,options:values};
  }
  async save(dir,current,name) {
    if(typeof name!=='string'||!NAME.test(name.trim()))throw Error('Use 1–24 letters, numbers, spaces, - or _.');
    name=name.trim();const d=await this.stored(dir);if(d.profiles.length>=30)throw Error('Keep up to 30 session profiles.');
    if(d.profiles.some(p=>p.name.toLowerCase()===name.toLowerCase()))throw Error('That session name already exists.');
    d.profiles.push({id:crypto.randomUUID(),name,createdAt:new Date().toISOString(),setup:await this.capture(dir,current)});
    await this.write(path.join(dir,'session-profiles.json'),JSON.stringify(d));return this.status(dir);
  }
  async remove(dir,id) {const d=await this.stored(dir);if(!d.profiles.some(p=>p.id===id))throw Error('Profile no longer exists.');d.profiles=d.profiles.filter(p=>p.id!==id);await this.write(path.join(dir,'session-profiles.json'),JSON.stringify(d));return this.status(dir);}
  async compare(dir,request) {
    const d=await this.stored(dir),left=d.profiles.find(p=>p.id===request?.left),right=d.profiles.find(p=>p.id===request?.right);
    if(!left||!right||left.id===right.id)throw Error('Choose two different saved setups.');
    // Compare only configuration fields safe to display; saved chat commands and arbitrary text are excluded.
    const fields=setup=>{
      const result=new Map(),put=(key,value)=>{if(typeof value==='boolean'||typeof value==='number'&&Number.isFinite(value))result.set(key,String(value));};
      put('Launcher / memory MB',setup.launcher?.memoryMb);
      for(const [id,value]of Object.entries(setup.launcher?.mods||{}).slice(0,100))if(/^[a-z0-9_-]{1,80}$/i.test(id))put('Managed mods / '+id,value);
      for(const [key,value]of Object.entries(setup.options||{}).slice(0,500))if((VIDEO.includes(key)||/^key_[A-Za-z0-9_.-]{1,100}$/.test(key))&&typeof value==='string'&&/^[A-Za-z0-9_.:+-]{1,128}$/.test(value))result.set('Minecraft / '+key,value);
      for(const [id,module]of Object.entries(setup.modules?.modules||{}).slice(0,300))if(/^[a-z0-9_-]{1,80}$/i.test(id)&&module&&typeof module==='object'){
        put('Client / '+id+' / enabled',module.enabled);
        for(const key of ['x','y'])put('Client / '+id+' / '+key,module[key]);
        for(const key of ['scale','background','shadow'])put('Client / '+id+' / '+key,module.settings?.[key]);
      }
      return result;
    };
    const a=fields(left.setup),b=fields(right.setup),changes=[];
    for(const key of [...new Set([...a.keys(),...b.keys()])].sort())if(a.get(key)!==b.get(key))changes.push({field:key,left:a.get(key)??'Not saved',right:b.get(key)??'Not saved'});
    return {left:left.name,right:right.name,total:changes.length,changes:changes.slice(0,500),limited:changes.length>500,note:'Read-only comparison of memory, managed mods, video, shortcuts and common client layout fields. Custom text, chat actions, accounts and worlds are excluded. Other module settings are not compared.'};
  }
  async baseline(dir,current) {return {instance:dir,launcher:{memoryMb:current.memoryMb,mods:current.mods,accessibility:current.accessibility},modules:await this.read(path.join(dir,'config/sloth-client/modules.json')),options:await this.read(path.join(dir,'options.txt'))};}
  async preview(dir,current,request) {
    const before=await this.baseline(dir,current);let target,label;
    if(request?.profile){const d=await this.stored(dir);const p=d.profiles.find(p=>p.id===request.profile);if(!p)throw Error('Profile no longer exists.');target=p.setup;label=p.name;}
    else {if(!Object.hasOwn(STYLES,request?.style))throw Error('Choose a session style.');const style=STYLES[request.style];label=request.style;
      const modules=before.modules?JSON.parse(before.modules):{modules:{}};modules.modules ||= {};
      let l=0,r=0;for(const id of HUD){const m=modules.modules[id]||{settings:{}};m.enabled=style.hud.includes(id);if(m.enabled){const compact=['fps','ping','cps','clock'].includes(id);m.x=compact?.02:.78;m.y=.06+(compact?l++:r++)*.16;m.settings={...m.settings,scale:1,hud_group:''};}modules.modules[id]=m;}
      if(request.style==='Mining')modules.modules.crosshair={...(modules.modules.crosshair||{}),enabled:true,settings:{...modules.modules.crosshair?.settings,ore_colors:true}};
      modules.hudHidden=false;target={launcher:{},modules,options:PROFILES[style.video]};
    }
    if(request?.accessibility&&!['keep','readable','contrast','calm'].includes(request.accessibility))throw Error('Unknown accessibility preset.');
    if(request?.accessibility&&request.accessibility!=='keep'){target=structuredClone(target);target.launcher={...target.launcher,accessibility:{textScale:request.accessibility==='readable'?1.3:1.15,reduceMotion:true,highContrast:request.accessibility==='contrast'}};
      target.modules ||= {modules:{}};target.modules.modules ||= {};
      for(const [id,values] of Object.entries({menu_theme:{animations:false},main_menu:{parallax:false,particles:false}}))target.modules.modules[id]={...target.modules.modules[id],enabled:true,settings:{...target.modules.modules[id]?.settings,...values}};
      for(const id of HUD){const m=target.modules.modules[id];if(!m)continue;m.settings ||= {};if(request.accessibility==='readable')m.settings.scale=1.3;if(request.accessibility==='contrast'){m.settings.background=true;m.settings.shadow=false;for(const key of ['text_color','background_color','border_color'])m.settings[key]={argb:key==='background_color'?'#FF14141A':'#FFFFFFFF',chroma:false};}}
    }
    const changes=[];
    const proposed={};
    if(target.modules){const copy=structuredClone(target.modules);delete copy.video;proposed.modules=JSON.stringify(copy,null,2);if(proposed.modules!==before.modules)changes.push({id:'modules',title:'HUD and client settings',detail:'Apply '+label+' module layout and options. Enabled HUDs: '+Object.entries(copy.modules||{}).filter(([id,m])=>HUD.has(id)&&m.enabled).map(([id])=>id.replaceAll('_',' ')).join(', ')+'. Core Sloth appearance stays enabled.',preview:copy});}
    if(Object.keys(target.options||{}).length){let text=before.options||'';for(const [k,v] of Object.entries(target.options)){if(!(VIDEO.includes(k)||/^key_[A-Za-z0-9_.-]+$/.test(k))||typeof v!=='string'||v.length>128||/[\r\n]/.test(v))continue;const safe=k.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),re=new RegExp('^'+safe+':[^\\r\\n]*','m');text=re.test(text)?text.replace(re,()=>k+':'+v):text+(text&&!text.endsWith('\n')?'\n':'')+k+':'+v+'\n';}
      proposed.options=text;if(text!==before.options)changes.push({id:'options',title:'Minecraft video and saved shortcuts',detail:Object.entries(target.options).filter(([k])=>VIDEO.includes(k)).map(([k,v])=>LABELS[k]+': '+display(k,v)).join(' · ')+(Object.keys(target.options).some(k=>k.startsWith('key_'))?' · saved keybinds included':''),preview:target.options});}
    proposed.launcher={};
    if(target.launcher&&typeof target.launcher==='object'){
      if(Number.isInteger(target.launcher.memoryMb)&&target.launcher.memoryMb>=2048&&target.launcher.memoryMb<=16384)proposed.launcher.memoryMb=target.launcher.memoryMb;
      if(target.launcher.mods&&typeof target.launcher.mods==='object')proposed.launcher.mods=Object.fromEntries(Object.entries(target.launcher.mods).filter(([id,v])=>Object.hasOwn(current.mods,id)&&typeof v==='boolean'));
      const a=target.launcher.accessibility;if(a&&[1,1.15,1.3,1.5].includes(a.textScale)&&typeof a.reduceMotion==='boolean'&&typeof a.highContrast==='boolean')proposed.launcher.accessibility={textScale:a.textScale,reduceMotion:a.reduceMotion,highContrast:a.highContrast};
    }
    if(Object.keys(proposed.launcher).length&&digest({...before.launcher,...proposed.launcher})!==digest(before.launcher))changes.push({id:'launcher',title:'Launcher preferences',detail:'Apply saved memory/mod choices or the selected accessibility preset. Accounts and worlds are excluded.',preview:proposed.launcher});
    this.review={token:crypto.randomUUID(),at:Date.now(),label,before,hash:digest(before),proposed,changes};
    return {token:this.review.token,label,changes,instanceId:path.basename(dir)};
  }
  async apply(dir,current,request,saveLauncher) {
    const p=this.review;if(!p||request?.token!==p.token||Date.now()-p.at>300000||p.before.instance!==dir)throw Error('Review the session again.');
    if(digest(await this.baseline(dir,current))!==p.hash)throw Error('Your setup changed. Review again before applying.');
    if(!Array.isArray(request.ids))throw Error('Choose reviewed changes.');const ids=new Set(request.ids);if(!ids.size||[...ids].some(id=>!p.changes.some(c=>c.id===id)))throw Error('Select valid reviewed changes.');
    const files=[['modules','config/sloth-client/modules.json'],['options','options.txt']].filter(([id])=>ids.has(id));
    const undo={schema:1,before:p.before,ids:[...ids],after:null};
    await this.write(path.join(dir,'session-plan-undo.json'),JSON.stringify(undo));
    try {for(const [id,file] of files)await this.write(path.join(dir,file),p.proposed[id]);if(ids.has('launcher'))saveLauncher(p.proposed.launcher);undo.after=await this.baseline(dir,saveLauncher(null));await this.write(path.join(dir,'session-plan-undo.json'),JSON.stringify(undo));}
    catch(e){for(const [id,file] of files){if(p.before[id]===null)await fs.rm(path.join(dir,file),{force:true});else await this.write(path.join(dir,file),p.before[id]);}if(ids.has('launcher'))saveLauncher(p.before.launcher);throw e;}
    this.review=null;return {settings:saveLauncher(null),label:p.label||'Session',status:await this.status(dir)};
  }
  async undo(dir,current,saveLauncher) {
    const file=path.join(dir,'session-plan-undo.json'),text=await this.read(file);if(!text)throw Error('No session plan to undo.');const u=JSON.parse(text);
    if(u.schema!==1||!u.after||u.before?.instance!==dir||!Array.isArray(u.ids)||u.ids.some(id=>!['modules','options','launcher'].includes(id)))throw Error('Incomplete session backup. Use Recovery to review it.');
    const now=await this.baseline(dir,current);for(const id of u.ids)if(digest(now[id])!==digest(u.after[id]))throw Error('These settings changed since applying. Undo cancelled to preserve newer edits.');
    const files=[['modules','config/sloth-client/modules.json'],['options','options.txt']].filter(([id])=>u.ids.includes(id));
    try{for(const [id,name] of files){if(u.before[id]===null)await fs.rm(path.join(dir,name),{force:true});else await this.write(path.join(dir,name),u.before[id]);}if(u.ids.includes('launcher'))saveLauncher(u.before.launcher);}
    catch(e){for(const [id,name] of files){if(now[id]===null)await fs.rm(path.join(dir,name),{force:true});else await this.write(path.join(dir,name),now[id]);}if(u.ids.includes('launcher'))saveLauncher(now.launcher);throw e;}
    await fs.unlink(file);return saveLauncher(null);
  }
}
module.exports={SessionPlanner};
