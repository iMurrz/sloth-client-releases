// Bounded offline menu-only run. Does not use accounts or open/join any world/server.
const fs=require('node:fs'),path=require('node:path');
const {prepareGame}=require('../src/lib/game/installer');
const {buildLaunchArgs,spawnGame}=require('../src/lib/game/launch');
const {defaultModSettings}=require('../src/lib/game/mods');
const config=require('../src/lib/config');
(async()=>{
  const root=path.join(process.env.APPDATA,'.sloth'),id='ui-review-'+(process.env.SLOTH_REVIEW_SINGLE||'20261001');
  const dir=path.join(root,'instances',id);fs.mkdirSync(path.join(dir,'config','sloth-client'),{recursive:true});
  fs.writeFileSync(path.join(dir,'options.txt'),'resourcePacks:["vanilla"]\nguiScale:2\nmaxFps:120\nenableVsync:false\npauseOnLostFocus:false\n');
  fs.writeFileSync(path.join(dir,'config/sloth-client/modules.json'),JSON.stringify({modules:{direction:{enabled:true,settings:{scale:1.4}},fps:{enabled:true},coordinates:{enabled:true}}}));
  const plan=await prepareGame({root,instanceId:id,gameVersion:config.game.version,loaderVersion:config.game.fabricLoader,modSettings:defaultModSettings(),bundledMods:[path.resolve('client-mod/build/libs/sloth-client-1.1.0.jar')],onProgress:p=>{if(p.stage!=='check')console.log(p.label);}});
  const args=buildLaunchArgs(plan,{session:{name:'SlothReview',uuid:'00000000000000000000000000000000',accessToken:'offline-menu-review'},memoryMb:1536,resolution:{width:1280,height:800},wrapperJar:path.resolve('launchwrapper/build/sloth-launchwrapper.jar'),launcherName:'sloth-ui-review',launcherVersion:require('../package.json').version,clientId:'review'});
  args.unshift('-Dsloth.devCheck=true');
  if(process.env.SLOTH_REVIEW_SINGLE)args.unshift('-Dsloth.devCheckSingle='+process.env.SLOTH_REVIEW_SINGLE);
  const output=path.resolve(process.env.SLOTH_REVIEW_OUTPUT||'snapshots/reference-0.0.36');fs.mkdirSync(output,{recursive:true});
  let timer,count=0,finished=false;
  const child=spawnGame(plan,args,{stdinSecret:'offline-menu-review',onLine:line=>{
    fs.appendFileSync(path.join(output,'game.log'),line+'\n');
    if(/DEVCHECK|ERROR|Exception|Sloth Client/.test(line))console.log(line.slice(0,240));
    if(line.includes('DEVCHECK screenshot '))count++;
    const finalShot=process.env.SLOTH_REVIEW_SINGLE|| (process.env.SLOTH_REVIEW_SHORT==='1'?'studio-home':'vanilla-servers');
    if(line.includes('DEVCHECK screenshot devcheck-'+finalShot+'.png')){finished=true;setTimeout(()=>child.kill(),1500);}
  },onExit:({code,error})=>{
    clearTimeout(timer);const shots=path.join(dir,'sloth-devcheck','screenshots');
    if(fs.existsSync(shots))for(const name of fs.readdirSync(shots))if(name.endsWith('.png'))fs.copyFileSync(path.join(shots,name),path.join(output,name));
    console.log(JSON.stringify({completed:finished,screenshots:count,code,error:error?.message,output}));process.exitCode=finished?0:1;
  }});
  timer=setTimeout(()=>{console.error('Menu review exceeded 210 seconds');child.kill();},210000);
})().catch(e=>{console.error(e);process.exitCode=1;});
