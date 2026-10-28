const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
function address(value) {
  if(typeof value!=='string'||value.length>255||/[\s/\\?#@]/.test(value)||!value.trim())throw Error('Enter a server host and optional port.');
  let url;try{url=new URL('https://'+value);}catch{throw Error('Invalid server address.');}
  const host=url.hostname.toLowerCase();
  // URL uses 443 as HTTPS default, while Minecraft uses 25565.
  const explicit=/\]:\d+$/.test(value)||(!value.startsWith('[')&&/:\d+$/.test(value));
  const selected=explicit?Number(value.slice(value.lastIndexOf(':')+1)):25565;
  if(!host||!Number.isInteger(selected)||selected<1||selected>65535||url.pathname!=='/')throw Error('Invalid server host or port.');
  return host+':'+selected;
}
class ServerProfiles {
  constructor(root){this.root=path.resolve(root);this.file=path.join(this.root,'server-launch-profiles.json');}
  guard(){for(let p=this.file;;p=path.dirname(p)){try{if(fs.lstatSync(p).isSymbolicLink())throw Error('Linked server profiles are unsupported.');}catch(e){if(e.code!=='ENOENT')throw e;}if(p===path.dirname(p))break;}}
  read(){this.guard();try{if(fs.statSync(this.file).size>131072)throw Error('Server profiles exceed limit.');const value=JSON.parse(fs.readFileSync(this.file));if(!Array.isArray(value)||value.length>100||value.some(v=>address(v.address)!==v.address||!/^[-a-z0-9]{1,32}$/.test(v.instanceId)||typeof v.profile!=='string'||v.profile&&!/^[A-Za-z0-9 _-]{1,24}$/.test(v.profile)))throw Error('Invalid server profiles.');return value;}catch(e){if(e.code==='ENOENT')return [];throw e;}}
  save(request, manager){const host=address(request.address),instance=manager.get(request.instanceId);const profile=request.profile||'';if(typeof profile!=='string'||profile&&!/^[A-Za-z0-9 _-]{1,24}$/.test(profile))throw Error('Use a saved client profile name.');const list=this.read(),index=list.findIndex(v=>v.address===host),entry={address:host,instanceId:instance.id,profile};if(index>=0)list[index]=entry;else{if(list.length>=100)throw Error('Server profile limit reached.');list.push(entry);}this.write(list);return list;}
  remove(value){const host=address(value);this.write(this.read().filter(v=>v.address!==host));return this.read();}
  write(list){this.guard();fs.mkdirSync(this.root,{recursive:true});const tmp=this.file+'.'+crypto.randomUUID()+'.tmp';try{fs.writeFileSync(tmp,JSON.stringify(list),{flag:'wx',mode:0o600});fs.renameSync(tmp,this.file);}finally{if(fs.existsSync(tmp))fs.unlinkSync(tmp);}}
  find(value,manager){const host=address(value),entry=this.read().find(v=>v.address===host);if(!entry)throw Error('Save a server setup first.');manager.get(entry.instanceId);return entry;}
}
module.exports={ServerProfiles,address};
