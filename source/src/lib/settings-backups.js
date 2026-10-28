const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const KEYS = ['accent','seasonalTheme','seasonalAnimations','seasonalIntensity','seasonalJumpscares','updateChannel','memoryMb','onLaunch','resolution','backups','performancePreset','reminderMinutes','accessibility','mods'];
const snapshot = value => Object.fromEntries(KEYS.filter(k=>Object.hasOwn(value,k)).map(k=>[k,structuredClone(value[k])]));
class SettingsBackups {
  constructor(file) { this.file = file + '.history.json'; }
  guard() { for(let p=this.file;;p=path.dirname(p)){try{if(fs.lstatSync(p).isSymbolicLink())throw Error('Linked settings history is unsupported.');}catch(e){if(e.code!=='ENOENT')throw e;}if(p===path.dirname(p))break;} }
  read() { this.guard();try{if(fs.statSync(this.file).size>1048576)throw Error('Settings history exceeds limit.');const data=JSON.parse(fs.readFileSync(this.file));if(!Array.isArray(data)||data.length>24||data.some(e=>!/^[-a-f0-9]{36}$/.test(e.id)||!e.setup||typeof e.setup!=='object'))throw Error('Invalid settings history.');return data;}catch(e){if(e.code==='ENOENT')return [];throw e;} }
  record(before, after, instanceId = '') {
    const setup=snapshot(before);if(JSON.stringify(setup)===JSON.stringify(snapshot(after)))return;
    const entries=this.read();entries.unshift({id:crypto.randomUUID(),createdAt:new Date().toISOString(),instanceId,setup});entries.length=Math.min(entries.length,24);
    fs.mkdirSync(path.dirname(this.file),{recursive:true});const tmp=this.file+'.'+crypto.randomUUID()+'.tmp';try{fs.writeFileSync(tmp,JSON.stringify(entries),{flag:'wx',mode:0o600});fs.renameSync(tmp,this.file);}finally{if(fs.existsSync(tmp))fs.unlinkSync(tmp);}
  }
  list() { return this.read().map(({setup,...entry})=>entry); }
  get(id) { const entry=this.read().find(e=>e.id===id);if(!entry)throw Error('Settings backup no longer exists.');return snapshot(entry.setup); }
}
module.exports={SettingsBackups,snapshot};
