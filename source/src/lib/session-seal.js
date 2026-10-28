const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const tools = require('./file-tools');

const MAX_FILES=2000, MAX_BYTES=2*1024**3, MAX_FILE=512*1024**2;
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const fingerprint = files => hash(JSON.stringify(files));
const sealFile = root => path.join(root,'config','sloth-session-seal.json');
const scope = name => /^(mods|scripts|kubejs)\//.test(name)&&!name.split('/').some(p=>!p||p==='.'||p==='..')&&!/[\\\x00-\x1f]/.test(name)&&name.length<=260;

async function inventory(root) {
  const files=[];let visited=0,total=0;
  async function visit(relative,depth=0) {
    if(++visited>MAX_FILES*3||depth>12||relative.length>260)throw new Error('Session Seal reached its bounded folder limit.');
    const absolute=path.join(root,relative);await tools.guard(root,absolute,true);
    const stat=await tools.plain(absolute,true);if(!stat)return;
    if(stat.isDirectory()){
      const names=(await fs.readdir(absolute)).sort();
      for(const name of names){if(relative==='mods'&&!/\.jar$/i.test(name))continue;await visit(path.join(relative,name),depth+1);}
      return;
    }
    if(!stat.isFile())throw new Error('Session Seal only supports regular files.');
    if(files.length>=MAX_FILES||stat.size>MAX_FILE||(total+=stat.size)>MAX_BYTES)throw new Error('Session Seal supports up to 2,000 files, 512 MB per file and 2 GB total.');
    const handle=await fs.open(absolute,'r');let size=0,digest=crypto.createHash('sha256');
    try {
      const opened=await handle.stat();
      if(opened.size!==stat.size||opened.mtimeMs!==stat.mtimeMs)throw new Error('Files changed during inspection. Review again.');
      for await(const chunk of handle.createReadStream({autoClose:false})){
        size+=chunk.length;if(size>stat.size)throw new Error('Files changed during inspection. Review again.');digest.update(chunk);
      }
      const after=await handle.stat(),named=await fs.lstat(absolute);
      if(named.isSymbolicLink()||named.ino!==after.ino||named.dev!==after.dev||size!==stat.size||after.size!==stat.size||after.mtimeMs!==stat.mtimeMs||after.ctimeMs!==stat.ctimeMs)throw new Error('Files changed during inspection. Review again.');
    }finally{await handle.close();}
    const name=relative.split(path.sep).join('/');if(!scope(name))throw new Error('Unsupported file path in the seal scope.');
    files.push({name,bytes:stat.size,sha256:digest.digest('hex')});
  }
  for(const name of ['mods','scripts','kubejs'])await visit(name);
  files.sort((a,b)=>a.name.localeCompare(b.name,'en'));
  return {files,fingerprint:fingerprint(files),bytes:total};
}
async function baseline(root) {
  const file=sealFile(root);await tools.guard(root,file,true);
  const stat=await tools.plain(file,true);if(!stat)return null;
  if(!stat.isFile()||stat.size>1024*1024)throw new Error('Session Seal is damaged. Review or disable it from Trust Center.');
  try {
    const bytes=await fs.readFile(file);if(bytes.length>1024*1024)throw Error();
    const value=JSON.parse(bytes.toString('utf8'));
    if(value.schema!==1||typeof value.protect!=='boolean'||!Array.isArray(value.files)||value.files.length>MAX_FILES||!Number.isFinite(value.at))throw Error();
    const names=new Set();
    for(const f of value.files){if(!f||typeof f.name!=='string'||!scope(f.name)||names.has(f.name)||!Number.isSafeInteger(f.bytes)||f.bytes<0||f.bytes>MAX_FILE||!/^[a-f0-9]{64}$/.test(f.sha256))throw Error();names.add(f.name);}
    if(value.fingerprint!==fingerprint(value.files))throw Error();
    return value;
  }catch{throw new Error('Session Seal is damaged. Review or disable it from Trust Center.');}
}
function differences(before,after) {
  const old=new Map((before?.files||[]).map(f=>[f.name,f])),fresh=new Map(after.files.map(f=>[f.name,f])),changes=[];
  for(const [name,file] of fresh){const previous=old.get(name);if(!previous)changes.push({name,kind:'added'});else if(previous.sha256!==file.sha256||previous.bytes!==file.bytes)changes.push({name,kind:'changed'});}
  for(const name of old.keys())if(!fresh.has(name))changes.push({name,kind:'removed'});
  return changes;
}
async function write(root,value) {
  const file=sealFile(root);await tools.guard(root,file,true);await fs.mkdir(path.dirname(file),{recursive:true});
  const tmp=file+'.'+crypto.randomUUID()+'.partial';
  try{await fs.writeFile(tmp,JSON.stringify(value),{flag:'wx',mode:0o600});await fs.rename(tmp,file);}finally{await fs.unlink(tmp).catch(()=>{});}
}
class SessionSeal {
  constructor({keyProvider}={}){this.pending=new Map();const ephemeral=crypto.randomBytes(32);this.keyProvider=keyProvider||(()=>Promise.resolve(ephemeral));}
  async mac(root,value){
    const key=await this.keyProvider(),resolved=path.resolve(root);
    const location=process.platform==='win32'?resolved.toLowerCase():resolved;
    return crypto.createHmac('sha256',key).update(JSON.stringify({location,schema:value.schema,protect:value.protect,at:value.at,files:value.files,fingerprint:value.fingerprint})).digest('hex');
  }
  async saved(root){
    const value=await baseline(root);if(!value)return null;
    const expected=await this.mac(root,value);
    if(typeof value.mac!=='string'||!/^[a-f0-9]{64}$/.test(value.mac)||!crypto.timingSafeEqual(Buffer.from(value.mac,'hex'),Buffer.from(expected,'hex')))throw new Error('This seal was not locally approved for this instance, or it was altered. Review it in Trust Center.');
    return value;
  }
  async persist(root,value){value.mac=await this.mac(root,value);await write(root,value);}
  async status(root){const saved=await this.saved(root);return {enrolled:Boolean(saved),protect:Boolean(saved?.protect),at:saved?.at||null,fingerprint:saved?.fingerprint||null,count:saved?.files.length||0};}
  async review(root,instanceId){
    const current=await inventory(root);let saved=null,warning='';try{saved=await this.saved(root);}catch(e){warning=e.message;}
    const token=crypto.randomUUID();this.pending.clear();this.pending.set(token,{root:path.resolve(root),instanceId,expires:Date.now()+10*60*1000,fingerprint:current.fingerprint});
    return {token,instanceId,...current,changes:differences(saved,current),protect:Boolean(saved?.protect),warning,baseline:saved?.fingerprint||null};
  }
  async approve(root,instanceId,token,protect){
    const review=this.pending.get(token);this.pending.delete(token);
    if(!review||review.root!==path.resolve(root)||review.instanceId!==instanceId||review.expires<Date.now()||typeof protect!=='boolean')throw new Error('Review this instance again before approving a seal.');
    const current=await inventory(root);if(current.fingerprint!==review.fingerprint)throw new Error('Files changed since your review. Review again.');
    const value={schema:1,protect,at:Date.now(),files:current.files,fingerprint:current.fingerprint};await this.persist(root,value);return this.status(root);
  }
  async check(root){
    const saved=await this.saved(root);if(!saved?.protect)return {protected:false};
    const current=await inventory(root),changes=differences(saved,current);
    if(changes.length){const error=new Error(`Session Seal paused launch: ${changes.length} mod/script files differ. Open Trust Center, review the changes and approve your intended setup.`);error.code='seal-changed';throw error;}
    return {protected:true,fingerprint:current.fingerprint,count:current.files.length};
  }
  async disable(root){
    // Keep the baseline and files; only turn off the launch gate. Corrupt baselines need explicit recovery.
    let saved;try{saved=await this.saved(root);}catch{
      const file=sealFile(root),backup=file+'.damaged-backup';await tools.guard(root,backup,true);await fs.copyFile(file,backup);await fs.unlink(file);saved=null;
    }
    if(saved){saved.protect=false;await this.persist(root,saved);}
    this.pending.clear();return this.status(root);
  }
}
module.exports={SessionSeal,inventory,differences};
