const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {openZip}=require('./zip');
const {safeJoin}=require('./game/paths');
const {download,hashFile}=require('./http');
const modrinth=require('./modrinth'),config=require('./config');
const {compareVersions}=require('./game/fabric-versions');
const {parallelJobs}=require('./parallel-jobs');
const HOSTS=['cdn.modrinth.com','github.com','raw.githubusercontent.com','gitlab.com'];
const REDIRECTS=[...HOSTS,'release-assets.githubusercontent.com','objects.githubusercontent.com'];
const ROOTS=new Set(['mods','config','defaultconfigs','resourcepacks','shaderpacks','kubejs','scripts','options.txt']);
function safePath(name){
  if(typeof name!=='string'||name.includes('\\')||name.includes('//')||!ROOTS.has(name.split('/')[0])||name.length>240||/\.(exe|dll|bat|cmd|ps1|com|scr|msi)$/i.test(name))throw Error('Unsupported or unsafe pack file path.');
  safeJoin(path.resolve('pack-validation'),name);return name;
}
function safeUrl(value){const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||u.port||!HOSTS.includes(u.hostname))throw Error('This pack uses an unsupported download host.');return u.toString();}
async function inspect(file){
  const zip=await openZip(file);
  try{
    const indexes=zip.entries.filter(e=>e.name==='modrinth.index.json');
    if(indexes.length!==1||indexes[0].uncompressedSize>1024**2)throw Error('Choose a Modrinth .mrpack containing modrinth.index.json.');
    const index=JSON.parse((await zip.read(indexes[0])).toString('utf8'));
    if(index.formatVersion!==1||index.game!=='minecraft'||typeof index.name!=='string'||!index.name.trim()||!Array.isArray(index.files)||index.files.length>3000)throw Error('Unsupported Modrinth pack manifest.');
    const dependencies=index.dependencies||{},requestedLoader=dependencies['fabric-loader'];
    const compatible=dependencies.minecraft===config.game.version&&/^\d+\.\d+\.\d+$/.test(requestedLoader||'')&&compareVersions(config.game.fabricLoader,requestedLoader)>=0&&Object.keys(dependencies).every(k=>['minecraft','fabric-loader'].includes(k));
    const names=new Set();let total=0;
    const files=index.files.map(f=>{
      const name=safePath(f.path),key=name.toLowerCase();if(names.has(key))throw Error('Duplicate pack download path.');names.add(key);
      if(!/^[a-f0-9]{128}$/i.test(f.hashes?.sha512||'')||!/^[a-f0-9]{40}$/i.test(f.hashes?.sha1||'')||!Number.isSafeInteger(f.fileSize)||f.fileSize<0||f.fileSize>512*1024**2||!Array.isArray(f.downloads)||!f.downloads.length||f.downloads.length>8)throw Error('Invalid pack download metadata.');
      for(const side of ['client','server'])if(f.env?.[side]&&!['required','optional','unsupported'].includes(f.env[side]))throw Error('Invalid pack environment.');
      const urls=f.downloads.map(safeUrl);total+=f.fileSize;
      return {path:name,sha512:f.hashes.sha512,sha1:f.hashes.sha1,size:f.fileSize,urls,client:f.env?.client||'required'};
    });
    const overrides={base:[],client:[]};let overrideBytes=0;
    for(const prefix of ['overrides/','client-overrides/']){
      const seen=new Set();
      for(const e of zip.entries.filter(e=>!e.directory&&e.name.startsWith(prefix))){const name=safePath(e.name.slice(prefix.length)),key=name.toLowerCase();if(seen.has(key))throw Error('Duplicate pack override path.');seen.add(key);if(e.uncompressedSize>64*1024**2)throw Error('Pack override exceeds the file limit.');overrideBytes+=e.uncompressedSize;overrides[prefix==='overrides/'?'base':'client'].push({entry:e.name,path:name});}
    }
    if(total>8*1024**3||overrideBytes>2*1024**3||overrides.base.length+overrides.client.length>30000)throw Error('Pack exceeds the installation size limit.');
    return {name:index.name.slice(0,100),version:String(index.versionId||'').slice(0,80),gameVersion:String(dependencies.minecraft||'unknown'),requestedLoader:String(requestedLoader||''),compatible,reason:compatible?`Ready for Minecraft ${config.game.version} · Fabric. Creates a separate instance with the pack’s own mods.`:`Needs Minecraft ${dependencies.minecraft||'unknown'} / ${requestedLoader?'Fabric '+requestedLoader:Object.keys(dependencies).filter(k=>k!=='minecraft').join(', ')||'an unknown loader'}. Sloth supports Minecraft ${config.game.version} with Fabric ${config.game.fabricLoader}.`,files,overrides,totalBytes:total+overrideBytes,optionalFiles:files.filter(f=>f.client==='optional').length,clientFiles:files.filter(f=>f.client!=='unsupported').length};
  }finally{await zip.close();}
}
async function cleanup(stage,root){const target=path.resolve(stage),base=path.resolve(root,'pack-staging');if(path.dirname(target)!==base||!/^[a-f0-9-]{36}$/.test(path.basename(target)))throw Error('Invalid pack staging target.');try{if((await fs.realpath(target)).toLowerCase()!==target.toLowerCase())throw Error('Linked staging folders cannot be removed.');await fs.rm(target,{recursive:true,force:true});}catch(e){if(e.code!=='ENOENT')throw e;}}
async function createStage(root){const base=path.resolve(root,'pack-staging');await fs.mkdir(base,{recursive:true});if((await fs.realpath(base)).toLowerCase()!==base.toLowerCase())throw Error('Linked staging folder.');const stage=path.join(base,crypto.randomUUID());await fs.mkdir(stage);return stage;}
async function fetchPack(id,root){
  if(!/^[a-zA-Z0-9]{8}$/.test(id))throw Error('Invalid Modrinth project.');
  const [project]=await modrinth.projects([id]);if(project?.project_type!=='modpack')throw Error('Choose a Modrinth modpack.');
  const version=await modrinth.compatibleVersion(id,config.game.version,'fabric',{preferRelease:true});if(!version)throw Error('No Fabric pack version is available for '+config.game.version+'.');
  const archive=version.files.find(f=>f.primary&&f.filename.endsWith('.mrpack'))||version.files.find(f=>f.filename.endsWith('.mrpack'));
  if(!archive||!Number.isSafeInteger(archive.size)||archive.size>512*1024**2||!/^[a-f0-9]{128}$/i.test(archive.hashes?.sha512||''))throw Error('Pack archive metadata is invalid.');
  const url=safeUrl(archive.url);if(new URL(url).hostname!=='cdn.modrinth.com')throw Error('Pack archive must come from Modrinth.');
  const stage=await createStage(root),file=path.join(stage,'pack.mrpack');
  try{await download(url,file,{sha512:archive.hashes.sha512,size:archive.size});return {stage,file,sha512:archive.hashes.sha512,pack:await inspect(file)};}catch(e){await cleanup(stage,root);throw e;}
}
async function prepare(source,{includeOptional=true,progress=()=>{},signal}={}){
  if((await hashFile(source.file,'sha512'))!==source.sha512)throw Error('Pack archive changed since review. Review it again.');
  const pack=await inspect(source.file);if(!pack.compatible)throw Error(pack.reason);
  const disk=await fs.statfs(source.stage);if(disk.bavail*disk.bsize<pack.totalBytes+1024**3)throw Error('Not enough free space: the pack needs an additional 1 GB for setup.');
  const data=path.join(source.stage,'data');await fs.mkdir(data);
  const files=pack.files.filter(f=>f.client!=='unsupported'&&(includeOptional||f.client!=='optional'));
  let completed=0;
  try {
  progress({label:`Downloading 0 of ${files.length}`,done:0,total:files.length});
  await parallelJobs(files,4,async(f,i,downloadSignal)=>{
    downloadSignal.throwIfAborted();
    const dest=safeJoin(data,f.path);let failure;
    for(const url of f.urls){try{await download(url,dest,{sha512:f.sha512,size:f.size,signal:downloadSignal,redirectHosts:REDIRECTS,retries:1});failure=null;break;}catch(e){failure=e;if(downloadSignal.aborted)throw e;}}
    if(failure)throw failure;
    progress({label:`Downloaded ${++completed} of ${files.length}`,done:completed,total:files.length});
  },signal);
  const zip=await openZip(source.file);
  const entries=new Map(zip.entries.map(e=>[e.name,e]));
  try{for(const layer of [pack.overrides.base,pack.overrides.client])for(const item of layer){signal?.throwIfAborted();const e=entries.get(item.entry),dest=safeJoin(data,item.path);await fs.mkdir(path.dirname(dest),{recursive:true});await fs.writeFile(dest,await zip.read(e));}}finally{await zip.close();}
  const profile={provider:'modrinth',name:pack.name,version:pack.version,requestedLoader:'fabric-'+pack.requestedLoader};
  await fs.mkdir(path.join(data,'mods'),{recursive:true});
  await fs.writeFile(path.join(data,'.sloth-modpack.json'),JSON.stringify({schema:1,...profile}));
  progress({label:'Creating your modpack instance',done:files.length,total:files.length});return {data,profile,name:pack.name};
  } catch(error) { await fs.rm(data,{recursive:true,force:true}); throw error; }
}
function preview(pack){const {files,overrides,...publicData}=pack;return publicData;}
module.exports={inspect,prepare,fetchPack,preview,cleanup,createStage,safePath,safeUrl};
