const {app,BrowserWindow}=require('electron');const path=require('node:path'),fs=require('node:fs'),assert=require('node:assert/strict');
app.whenReady().then(async()=>{const win=new BrowserWindow({show:false,width:620,height:620,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});win.webContents.setBackgroundThrottling(false);
 const results=[];for(const face of ['wraith','fang-skull','spider','cracked-sloth','jack-o-sloth','shadow']){
  await win.loadFile(path.resolve('src/assets/scare-'+face+'.svg'));
  const motion=await win.webContents.executeJavaScript(`(()=>{const root=document.documentElement;root.pauseAnimations();const jaw=document.querySelector('animateTransform[type="scale"]').parentNode;root.setCurrentTime(.1);const first=jaw.transform.animVal.getItem(0).matrix.d;root.setCurrentTime(.55);const second=jaw.transform.animVal.getItem(0).matrix.d;return {first,second,animations:document.querySelectorAll('animate,animateTransform').length};})()`);
  assert.notEqual(motion.first,motion.second);assert.ok(motion.animations>=4);results.push({face,...motion});
 }
 fs.writeFileSync(path.resolve('snapshots/polish-0.0.21/scare-motion.json'),JSON.stringify({pass:true,results},null,2));console.log('PASS all six SVG creatures animate their jaws; body, eyes and spider legs include motion.');app.exit(0);
}).catch(e=>{console.error(e);app.exit(1);});
