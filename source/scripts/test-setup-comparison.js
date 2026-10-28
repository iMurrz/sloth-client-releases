const fs=require('fs/promises'),os=require('os'),path=require('path'),assert=require('assert/strict');
const {SessionPlanner}=require('../src/lib/session-planner');
const {compatibilitySummary}=require('../src/lib/mod-manager');
(async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'sloth-compare-'));
 try{
  const planner=new SessionPlanner(root),dir=path.join(root,'instance');await fs.mkdir(dir);
  const config=path.join(dir,'config/sloth-client');await fs.mkdir(config,{recursive:true});
  await fs.writeFile(path.join(config,'modules.json'),JSON.stringify({modules:{fps:{enabled:true,x:.1,y:.2,settings:{scale:1,secret:'DO_NOT_DISPLAY'}},auto_text:{settings:{message:'PRIVATE_COMMAND'}}}}));
  await fs.writeFile(path.join(dir,'options.txt'),'renderDistance:8\nkey_jump:key.keyboard.space\nserver:PRIVATE_SERVER\n');
  await planner.save(dir,{memoryMb:4096,mods:{sodium:true}},'First');
  await fs.writeFile(path.join(dir,'options.txt'),'renderDistance:12\nkey_jump:key.keyboard.space\n');
  await planner.save(dir,{memoryMb:6144,mods:{sodium:false}},'Second');
  const status=await planner.status(dir),request={left:status.profiles[0].id,right:status.profiles[1].id};
  const before=await fs.readFile(path.join(dir,'session-profiles.json'),'utf8'),result=await planner.compare(dir,request);
  assert.equal(result.total,3);assert.equal(result.changes.find(c=>c.field==='Minecraft / renderDistance').right,'12');
  assert.ok(!/DO_NOT_DISPLAY|PRIVATE_COMMAND|PRIVATE_SERVER/.test(JSON.stringify(result)));
  assert.equal(await fs.readFile(path.join(dir,'session-profiles.json'),'utf8'),before);
  assert.equal(planner.review,null);await assert.rejects(()=>planner.compare(dir,{left:request.left,right:request.left}),/different/);await assert.rejects(()=>planner.compare(dir,{left:'missing',right:request.right}),/different/);
  for(const [report,expected]of [[{mods:[],enabled:0,compatibility:{unresolved:0}},'good'],[{mods:[],enabled:1,compatibility:{unresolved:2}},'warn'],[{mods:[],enabled:1,compatibility:{truncated:true}},'warn'],[{mods:[{enabled:true,issues:['duplicate']}],enabled:1},'warn'],[{mods:[{enabled:false,issues:['damage']}],enabled:0},'good']])assert.equal(compatibilitySummary(report).level,expected);
  assert.match(compatibilitySummary({mods:[],enabled:1,compatibility:{unresolved:2}}).detail,/nested-library inspection/);
  console.log('PASS safe read-only setup comparison, secret exclusion, unchanged storage, invalid selections and consistent mod warning summaries.');
 }finally{if(path.dirname(root)===os.tmpdir()&&path.basename(root).startsWith('sloth-compare-'))await fs.rm(root,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
