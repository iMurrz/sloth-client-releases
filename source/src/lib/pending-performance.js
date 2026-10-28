const fs=require('node:fs'),path=require('node:path');
const {execFileSync}=require('node:child_process');
const {randomUUID}=require('node:crypto');
const semver=require('semver');
const {resolveEnabled,archiveStaleMods}=require('./game/mods');

// Owner-requested settings are local queue files; installers contain no request and no automatic FPS override.
async function applyPendingPerformance(root,version,bundled=[]) {
  const pending=path.join(root,'pending-performance.json');if(!fs.existsSync(pending))return null;
  const guard=file=>{for(let p=file;;p=path.dirname(p)){if(fs.existsSync(p)&&fs.lstatSync(p).isSymbolicLink())throw Error('Linked performance settings are unsupported.');if(p===path.dirname(root))break;}};
  guard(pending);if(fs.statSync(pending).size>2048)throw Error('Oversized performance request.');
  const request=JSON.parse(fs.readFileSync(pending,'utf8'));
  if(request.schema!==1||request.instanceId!=='sloth'||request.minimumVersion!=='0.0.27'||request.uncap!==true||request.cleanup!==true)throw Error('Unsupported performance request.');
  if(!semver.gte(version,request.minimumVersion))return {deferred:true};
  if(process.platform!=='win32')return {deferred:true};
  const count=execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',"@(Get-CimInstance Win32_Process | Where-Object { $_.Name -match '^javaw?\\.exe$' -and $_.CommandLine -match 'TokenWrapper|KnotClient|net.minecraft.client.main.Main' }).Count"],{encoding:'utf8',timeout:15000,windowsHide:true}).trim();
  if(!/^\d+$/.test(count)||Number(count))return {deferred:true};
  const index=path.join(root,'instances.json');guard(index);if(fs.statSync(index).size>1024*1024)throw Error('Oversized instance index.');
  const instance=JSON.parse(fs.readFileSync(index,'utf8')).instances?.find(x=>x.id===request.instanceId);if(!instance||instance.pack)throw Error('Requested standalone instance unavailable.');
  const dir=path.join(root,'instances',request.instanceId),options=path.join(dir,'options.txt');guard(options);if(fs.statSync(options).size>1024*1024)throw Error('Oversized game options.');
  let text=fs.readFileSync(options,'utf8');const original=text;
  for(const [key,value] of [['maxFps','260'],['enableVsync','false']]){const re=new RegExp('^'+key+':.*$','m');text=re.test(text)?text.replace(re,key+':'+value):text+'\n'+key+':'+value+'\n';}
  let backup=null;
  if(text!==original){backup=options+'.before-performance-'+Date.now();fs.copyFileSync(options,backup,fs.constants.COPYFILE_EXCL);const tmp=options+'.'+randomUUID()+'.tmp';try{fs.writeFileSync(tmp,text,{flag:'wx'});fs.renameSync(tmp,options);}finally{if(fs.existsSync(tmp))fs.unlinkSync(tmp);}}
  const wanted=new Set([...resolveEnabled(instance.mods).filter(x=>(x.kind||'mod')==='mod').map(x=>x.file.filename),...bundled.map(x=>path.basename(x))]);
  const cleanup=await archiveStaleMods(dir,wanted,{includeUnselectedCatalog:true});
  const receipt=path.join(root,'completed-performance.json');guard(receipt);const tmp=receipt+'.'+randomUUID()+'.tmp';try{fs.writeFileSync(tmp,JSON.stringify({schema:1,version,completedAt:new Date().toISOString(),optionsBackup:backup,...cleanup},null,2),{flag:'wx'});fs.renameSync(tmp,receipt);}finally{if(fs.existsSync(tmp))fs.unlinkSync(tmp);}
  fs.unlinkSync(pending);return {applied:true,...cleanup,optionsBackup:backup};
}
module.exports={applyPendingPerformance};
