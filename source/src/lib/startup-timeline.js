const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
class StartupTimeline {
 constructor(root){this.file=path.join(root,'startup-timeline.json');this.current=null;}
 start(instanceId){this.current={id:crypto.randomUUID(),instanceId,startedAt:new Date().toISOString(),phases:[],status:'preparing'};this.mark('Setup checks');}
 mark(name){if(!this.current)return;const now=Date.now();const prev=this.current.phases.at(-1);if(prev)prev.ms=now-prev.started;this.current.phases.push({name,started:now,ms:null});}
 finish(status){if(!this.current)return;const now=Date.now(),prev=this.current.phases.at(-1);if(prev)prev.ms=now-prev.started;this.current.status=status;this.current.finishedAt=new Date(now).toISOString();this.persist();}
 ready(){if(this.current?.status!=='starting')return;this.finish('client-ready');}
 starting(){if(!this.current)return;this.mark('Minecraft startup');this.current.status='starting';this.persist();}
 persist(){try{const old=this.list();const row={...this.current,phases:this.current.phases.map(({name,ms})=>({name,ms}))};const rows=[row,...old.filter(x=>x.id!==row.id)].slice(0,30),tmp=this.file+'.'+crypto.randomUUID()+'.tmp';fs.writeFileSync(tmp,JSON.stringify({schema:1,rows}),{flag:'wx',mode:0o600});fs.renameSync(tmp,this.file);}catch{/* Timing must never prevent launching. */}}
 list(){try{if(fs.lstatSync(this.file).isSymbolicLink()||fs.statSync(this.file).size>262144)return [];const d=JSON.parse(fs.readFileSync(this.file,'utf8'));return d.schema===1&&Array.isArray(d.rows)?d.rows.slice(0,30):[];}catch{return [];}}
}
module.exports={StartupTimeline};
