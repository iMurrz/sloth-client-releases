// Capture-only helper using an isolated launcher profile. Does not sign in or start Minecraft.
const {app}=require('electron'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'sloth-motion-capture-'));
app.setPath('appData',profile);app.setPath('userData',path.join(profile,'launcher'));
const out=path.resolve('snapshots/motion-0.0.22');fs.mkdirSync(out,{recursive:true});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
app.on('browser-window-created',(_event,win)=>{
 win.webContents.setBackgroundThrottling(false);
 win.webContents.once('did-finish-load',async()=>{try{
  const run=s=>win.webContents.executeJavaScript(s);await wait(1800);win.setSize(1280,820);win.focus();
  const shot=async name=>{await run('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');fs.writeFileSync(path.join(out,name+'.png'),(await win.webContents.capturePage()).toPNG());};
  await run("showPage('home')");await wait(600);await shot('regular-home');
  await run("(async()=>{state.settings=await api.saveSettings({seasonalTheme:'halloween',seasonalIntensity:'haunted',seasonalJumpscares:true});applySeasonalTheme(state.settings)})()");
  await wait(800);await shot('haunted-home');
  await run("(()=>{const r=motionHero.getBoundingClientRect();motionHero.dispatchEvent(new PointerEvent('pointermove',{clientX:r.right-20,clientY:r.top+20,bubbles:true}));})()");await wait(600);await shot('hero-depth');
  const visual=await run("({fog:getComputedStyle($('.fog-low')).opacity,middle:getComputedStyle($('.fog-middle')).display,top:getComputedStyle($('.fog-wisps')).display,hero:getComputedStyle($('.hero-sloth')).transform})");
  for(let i=0;i<6;i++){win.focus();await run('showScare(true)');await wait(250);if(i===0)await shot('omen');await wait(650);await shot('creature-'+i);if(i===0){await wait(1000);await shot('second-advance');}await run('clearScare()');}
  await run("showPage('settings')");await wait(500);await shot('settings');
  await run("document.body.classList.add('reduce-motion');syncHauntIdle();resetHeroMotion();");await wait(300);await shot('reduced-motion');
  fs.writeFileSync(path.join(out,'capture-notes.json'),JSON.stringify({version:'0.0.22',isolatedProfile:true,visual,screenshots:fs.readdirSync(out).filter(x=>x.endsWith('.png'))},null,2));
  console.log('Captured launcher motion and all six creature scenes: '+out);app.exit(0);
 }catch(e){console.error(e);app.exit(1);}});
});
require('../src/main');

