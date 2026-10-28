// Isolated Electron integration checks: synthetic files, no accounts or game launch.
const {app,nativeImage,safeStorage}=require('electron');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'sloth-trust-ui-'));
fs.mkdirSync(path.join(profile,'client'));app.setPath('appData',profile);app.setPath('userData',path.join(profile,'client'));
const instance=path.join(profile,'.sloth','instances','sloth');fs.mkdirSync(path.join(instance,'mods'),{recursive:true});fs.mkdirSync(path.join(instance,'screenshots'));
fs.writeFileSync(path.join(instance,'mods','synthetic.jar'),'synthetic mod bytes');
const original=path.join(instance,'screenshots','synthetic.png');fs.copyFileSync(path.join(__dirname,'../src/assets/icon.png'),original);
const originalBytes=fs.readFileSync(original),errors=[];let complete=false;
const timer=setTimeout(()=>{console.error('UI verification timed out');app.exit(1);},45000);
const wait=ms=>new Promise(r=>setTimeout(r,ms));
app.on('browser-window-created',(_event,win)=>{
  win.webContents.setBackgroundThrottling(false);
  win.webContents.on('console-message',event=>{if(event.level==='error')errors.push(event.message);});
  win.webContents.once('did-finish-load',async()=>{
    const run=code=>win.webContents.executeJavaScript(code);
    async function until(code){for(let i=0;i<100;i++){if(await run(code))return;await wait(80);}throw Error('Timed out: '+code);}
    try{
      await until("document.querySelector('#app-version').textContent.trim()!==''&&document.querySelector('#app-version').textContent!=='—'");
      assert.equal(await run('document.title'),'Sloth Client');
      await run("window.confirm=()=>true;document.querySelector('[data-toolbox-page=trust]').click()");
      await until("document.querySelector('#trust-instance').textContent==='Sloth Client'");
      await run("document.querySelector('#seal-review').click()");
      await until("!document.querySelector('#seal-review-content').hidden&&!document.querySelector('#seal-review').disabled");
      assert.equal(fs.existsSync(path.join(instance,'config','sloth-session-seal.json')),false);
      assert.ok((await run("document.querySelector('#seal-files').textContent")).includes('synthetic.jar'));
      await run("document.querySelector('#seal-approve').click()");
      await until("document.querySelector('#trust-seal-summary').textContent.includes('Launch protection enabled')");
      fs.writeFileSync(path.join(instance,'mods','synthetic.jar'),'changed synthetic mod');
      const {SessionSeal}=require('../src/lib/session-seal'),{sealKeyProvider}=require('../src/lib/seal-key');await assert.rejects(new SessionSeal({keyProvider:sealKeyProvider(path.join(app.getPath('userData'),'session-seal-key.bin'),safeStorage)}).check(instance),e=>e.code==='seal-changed');
      await run("document.querySelector('#seal-review').click()");await until("!document.querySelector('#seal-review-content').hidden&&!document.querySelector('#seal-review').disabled");
      assert.ok((await run("document.querySelector('#seal-files').textContent")).includes('changed'));
      const out=path.join(__dirname,'../snapshots/trust-center');fs.mkdirSync(out,{recursive:true});
      await wait(200);fs.writeFileSync(path.join(out,'session-seal.png'),(await win.webContents.capturePage()).toPNG());
      await run("document.querySelector('#seal-disable').click()");await until("document.querySelector('#trust-seal-summary').textContent.includes('Launch protection off')");
      await run("document.querySelector('[data-page=shots]').click()");await until("document.querySelector('#shots-grid figure')!==null");
      await run("Array.from(document.querySelectorAll('#shots-grid button')).find(b=>b.textContent==='Edit').click()");await until("document.querySelector('#shot-editor').open");
      assert.equal(await run("document.querySelector('#shot-edit-canvas').width"),nativeImage.createFromPath(original).getSize().width);
      await run("document.querySelector('#shot-crop-w').value=32;document.querySelector('#shot-crop-h').value=32;document.querySelector('#shot-crop-select').click();document.querySelector('#shot-edit-crop').click()");
      assert.equal(await run("document.querySelector('#shot-edit-canvas').width"),32);
      await run("document.querySelector('#shot-edit-undo').click()");await until("document.querySelector('#shot-edit-canvas').width>32");
      await run("document.querySelector('#shot-crop-select').click();document.querySelector('#shot-edit-crop').click();document.querySelector('#shot-edit-save').click()");
      await until("document.querySelector('#shot-edit-status').textContent.startsWith('Saved ')");
      assert.equal(fs.readFileSync(original).equals(originalBytes),true);assert.equal(fs.readdirSync(path.dirname(original)).filter(n=>n.endsWith('.png')).length,2);
      await run("document.querySelector('#shot-editor-close').click();Array.from(document.querySelectorAll('#shots-grid figure')).find(f=>f.querySelector('figcaption').textContent.startsWith('synthetic.png')).querySelector('button:nth-child(3)').click()");
      await until("document.querySelector('#shot-album-dialog').open");
      await run("document.querySelector('#shot-album-name').value='Synthetic album';document.querySelector('#shot-album-save').click()");await until("!document.querySelector('#shot-album-dialog').open");
      await until("document.querySelector('#shots-grid').textContent.includes('Album: Synthetic album')");
      assert.equal(JSON.parse(fs.readFileSync(path.join(instance,'screenshots','.sloth-albums.json')))['synthetic.png'],'Synthetic album');
      assert.deepEqual(errors,[]);console.log('Trust Center approval/change/disable and screenshot crop/undo/save/album UI checks passed.');complete=true;
    }catch(e){console.error(e.stack);}
    finally{clearTimeout(timer);win.destroy();await wait(100);try{fs.rmSync(profile,{recursive:true,force:true});}catch{}app.exit(complete?0:1);}
  });
});
require('../src/main');
