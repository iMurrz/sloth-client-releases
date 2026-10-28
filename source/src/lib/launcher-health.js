const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
/** A single startup marker, without logs, account data or session history. */
class LauncherHealth {
 constructor(root){this.file=path.join(path.resolve(root),'launcher-health.json');this.current=null;}
 guard(){for(let p=this.file;;p=path.dirname(p)){try{if(fs.lstatSync(p).isSymbolicLink())throw Error('Linked launcher health data is unsupported.');}catch(e){if(e.code!=='ENOENT')throw e;}if(p===path.dirname(p))break;}}
 read(){this.guard();try{if(fs.statSync(this.file).size>8192)throw Error('Oversized startup marker.');const s=JSON.parse(fs.readFileSync(this.file,'utf8'));if(s.schema!==1||!['starting','ready','failed'].includes(s.state)||!/^\d+\.\d+\.\d+(?:-beta\.\d+)?$/.test(s.version))throw Error('Invalid startup marker.');return s;}catch(e){if(e.code==='ENOENT')return null;throw e;}}
 write(){this.guard();fs.mkdirSync(path.dirname(this.file),{recursive:true});const tmp=this.file+'.'+crypto.randomUUID()+'.tmp';try{fs.writeFileSync(tmp,JSON.stringify(this.current),{flag:'wx',mode:0o600});fs.renameSync(tmp,this.file);}finally{if(fs.existsSync(tmp))fs.unlinkSync(tmp);}}
 begin(version){if(!/^\d+\.\d+\.\d+(?:-beta\.\d+)?$/.test(version))throw Error('Invalid launcher version.');const previous=this.read();this.current={schema:1,version,state:'starting',lastReadyVersion:previous?.state==='ready'?previous.version:previous?.lastReadyVersion||null};this.write();return previous;}
 ready(){if(!this.current)return;this.current.state='ready';this.current.lastReadyVersion=this.current.version;this.write();}
 fail(){if(!this.current)return;this.current.state='failed';this.write();}
}
module.exports={LauncherHealth};
