const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {guard}=require('./file-tools');
async function apply(dir, setup) {
  const base=path.join(dir,'config','sloth-client'),profile=await guard(dir,path.join(base,'profiles',setup.profile+'.json'));
  const stat=await fs.stat(profile);if(!stat.isFile()||stat.size>512000)throw Error('Saved client profile is missing or exceeds its limit.');
  const data=JSON.parse(await fs.readFile(profile));if(!data.modules||typeof data.modules!=='object')throw Error('Saved client profile cannot be read.');
  const file=await guard(dir,path.join(base,'studio.json'),true);let studio={};try{if((await fs.stat(file)).size>131072)throw Error('Server settings exceed limit.');studio=JSON.parse(await fs.readFile(file));}catch(e){if(e.code!=='ENOENT')throw e;}
  if(!studio.servers||Array.isArray(studio.servers)||typeof studio.servers!=='object')studio.servers={};
  if(Object.keys(studio.servers).length>=100&&!Object.hasOwn(studio.servers,setup.address))throw Error('Client server association limit reached.');
  studio.servers[setup.address]=setup.profile;
  const tmp=file+'.'+crypto.randomUUID()+'.tmp';try{await fs.writeFile(tmp,JSON.stringify(studio),{flag:'wx',mode:0o600});await fs.rename(tmp,file);}finally{await fs.rm(tmp,{force:true});}
}
module.exports={apply};
