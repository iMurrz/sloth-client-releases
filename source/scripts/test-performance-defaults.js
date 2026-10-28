const fs=require('fs/promises'),os=require('os'),path=require('path'),assert=require('assert/strict');
const {initializeFreshOptions}=require('../src/lib/game/fresh-options');
(async()=>{const root=await fs.mkdtemp(path.join(os.tmpdir(),'sloth-default-check-'));try{
 const dir=path.join(root,'fresh');assert.equal(await initializeFreshOptions(dir),true);assert.equal(await fs.readFile(path.join(dir,'options.txt'),'utf8'),'maxFps:260\nenableVsync:false\ninactivityFpsLimit:"minimized"\n');
 await fs.writeFile(path.join(dir,'options.txt'),'maxFps:144\nenableVsync:true\nresourcePacks:["custom"]\n');assert.equal(await initializeFreshOptions(dir),false);assert.equal(await fs.readFile(path.join(dir,'options.txt'),'utf8'),'maxFps:144\nenableVsync:true\nresourcePacks:["custom"]\n');
 assert.equal(await initializeFreshOptions(path.join(root,'modpack'),{standalone:true}),false);
 await assert.rejects(fs.stat(path.join(root,'modpack/options.txt')),e=>e.code==='ENOENT');
 const performance=require('../src/lib/game/mods').catalog().filter(m=>m.category==='performance');assert.ok(performance.length>=9);assert.ok(performance.every(m=>m.defaultEnabled));
 const broken=path.join(root,'broken');await fs.mkdir(path.join(broken,'mods'),{recursive:true});await fs.writeFile(path.join(broken,'mods/broken.jar'),'invalid ZIP');const inspected=await require('../src/lib/mod-manager').inspect(broken,'1.21.11','0.19.5');assert.equal(inspected.mods.length,1);assert.ok(inspected.mods[0].issues.some(i=>i.includes('Cannot read')));
 console.log('PASS fresh uncapped options, existing preferences preserved, modpack excluded, nine default performance mods, damaged-mod inspection');
}finally{if(path.dirname(root)===os.tmpdir()&&path.basename(root).startsWith('sloth-default-check-'))await fs.rm(root,{recursive:true,force:true});}})().catch(e=>{console.error(e);process.exitCode=1});
