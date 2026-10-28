const fs = require('node:fs');
const path = require('node:path');

function restore(saved, displays) {
  const valid = saved && ['x','y','width','height'].every(k => Number.isFinite(saved[k]));
  const fallback = displays[0].workArea;
  const area = valid ? displays.find(d => {
    const a=d.workArea;
    return Math.min(saved.x+saved.width,a.x+a.width)-Math.max(saved.x,a.x)>=80 && Math.min(saved.y+saved.height,a.y+a.height)-Math.max(saved.y,a.y)>=80;
  })?.workArea || fallback : fallback;
  const width=Math.min(area.width,Math.max(Math.min(960,area.width),valid?saved.width:1080));
  const height=Math.min(area.height,Math.max(Math.min(640,area.height),valid?saved.height:700));
  return {width:Math.round(width),height:Math.round(height),x:Math.round(Math.max(area.x,Math.min(valid?saved.x:area.x+(area.width-width)/2,area.x+area.width-width))),y:Math.round(Math.max(area.y,Math.min(valid?saved.y:area.y+(area.height-height)/2,area.y+area.height-height))),minWidth:Math.min(960,area.width),minHeight:Math.min(640,area.height),maximized:valid&&saved.maximized===true};
}
function load(file,displays){let saved;try{saved=JSON.parse(fs.readFileSync(file,'utf8'));}catch{}return restore(saved,displays);}
function attach(win,file){
  let timer;
  const save=()=>{clearTimeout(timer);if(win.isDestroyed())return;try{const value={...win.getNormalBounds(),maximized:win.isMaximized()};fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file+'.tmp',JSON.stringify(value));fs.renameSync(file+'.tmp',file);}catch{}};
  const schedule=()=>{clearTimeout(timer);timer=setTimeout(save,350);timer.unref();};
  for(const event of ['resize','move','maximize','unmaximize'])win.on(event,schedule);
  win.on('close',save);win.on('closed',()=>clearTimeout(timer));
}
module.exports={restore,load,attach};
