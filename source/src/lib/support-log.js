const fs=require('node:fs/promises'),path=require('node:path');
const {guard}=require('./file-tools'),{scrub}=require('./report-privacy');
function excerpt(text) {
  // Chat, commands, addresses and player session identities are excluded before review.
  return scrub(String(text).split(/\r?\n/).filter(line=>!/(?:\[CHAT\]|\[System\]|chat message|command:|Connecting to |joined the game|left the game|logged in with entity|UUID of player|Setting user:)/i.test(line)).slice(-200).map(line=>line.slice(0,1000)).join('\n')).slice(-100000);
}
async function read(dir, lines=[]) {
  if(lines.length)return {source:'Captured game output',text:excerpt(lines.join('\n')),limited:true};
  const candidates=[];for(const relative of ['logs/latest.log',...await fs.readdir(await guard(dir,path.join(dir,'crash-reports'),true)).catch(e=>{if(e.code==='ENOENT')return [];throw e;}).then(names=>names.filter(n=>/^crash-[A-Za-z0-9_.-]+\.txt$/.test(n)).slice(-100).map(n=>'crash-reports/'+n))]){
    const file=await guard(dir,path.join(dir,relative),true);const stat=await fs.stat(file).catch(e=>{if(e.code==='ENOENT')return null;throw e;});if(stat?.isFile())candidates.push({file,stat,relative});
  }
  const newest=candidates.sort((a,b)=>b.stat.mtimeMs-a.stat.mtimeMs)[0];if(!newest)return {source:'No game output yet',text:'',limited:false};
  const file=await fs.open(newest.file,'r');try{const size=(await file.stat()).size,count=Math.min(size,262144),buffer=Buffer.alloc(count);await file.read(buffer,0,count,size-count);return {source:newest.relative,modifiedAt:new Date(newest.stat.mtimeMs).toISOString(),text:excerpt(buffer.toString()),limited:true};}finally{await file.close();}
}
module.exports={read,excerpt};
