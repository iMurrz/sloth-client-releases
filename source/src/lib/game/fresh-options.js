const fs=require('node:fs/promises'),path=require('node:path');
/** Fresh Sloth installations start uncapped. Existing and modpack options remain authoritative. */
async function initializeFreshOptions(instanceDir,{standalone=false}={}){
 if(standalone)return false;
 for(let p=path.resolve(instanceDir);p!==path.dirname(p);p=path.dirname(p)){
  const s=await fs.lstat(p).catch(e=>{if(e.code==='ENOENT')return null;throw e});if(s?.isSymbolicLink())throw Error('Linked game options directory is unsupported.');
 }
 await fs.mkdir(instanceDir,{recursive:true});
 try{await fs.writeFile(path.join(instanceDir,'options.txt'),'maxFps:260\nenableVsync:false\ninactivityFpsLimit:"minimized"\n',{flag:'wx'});return true;}
 catch(e){if(e.code==='EEXIST')return false;throw e;}
}
module.exports={initializeFreshOptions};
