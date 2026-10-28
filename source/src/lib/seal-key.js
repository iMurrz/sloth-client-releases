const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {securePersistence}=require('./secret-storage');
const {plain}=require('./file-tools');
function sealKeyProvider(file,safe){
  let pending;
  return ()=>pending||(pending=(async()=>{
    if(!securePersistence(safe))return crypto.randomBytes(32);
    await plain(path.dirname(file));
    const stat=await plain(file,true);
    if(stat){
      if(!stat.isFile()||stat.size>4096)throw new Error('Local seal key cannot be read. Reinstalling does not replace its trust history.');
      const text=safe.decryptString(await fs.readFile(file));
      if(!/^[a-f0-9]{64}$/.test(text))throw new Error('Local seal key is invalid.');
      return Buffer.from(text,'hex');
    }
    const key=crypto.randomBytes(32),encrypted=safe.encryptString(key.toString('hex'));
    await fs.writeFile(file,encrypted,{flag:'wx',mode:0o600});return key;
  })().catch(e=>{pending=null;throw e;}));
}
module.exports={sealKeyProvider};
