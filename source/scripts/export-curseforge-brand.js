// Export the existing Sloth vector identity for CurseForge's application slots.
const fs = require('node:fs');
const path = require('node:path');
const { app, BrowserWindow } = require('electron');
const out = path.join(__dirname, '..', 'brand', 'curseforge-application');
const defs = `<defs>
 <linearGradient id="flame" x1="0.2" y1="0" x2="0.85" y2="1"><stop stop-color="#ffd176"/><stop offset="1" stop-color="#ff5a24"/></linearGradient>
 <linearGradient id="bg" x2="1" y2="1"><stop stop-color="#141318"/><stop offset="1" stop-color="#261819"/></linearGradient>
 <radialGradient id="halo"><stop stop-color="#ff7435" stop-opacity=".2"/><stop offset="1" stop-color="#ff7435" stop-opacity="0"/></radialGradient>
 </defs>`;
const mark = (x,y,size) => `<g transform="translate(${x} ${y}) scale(${size/512})"><path d="M256 92 L420 404 L92 404 Z" fill="url(#flame)"/><path fill-rule="evenodd" d="M256 196 L318 338 L286 338 L274 310 L238 310 L226 338 L194 338 Z M246 286 L266 286 L256 258 Z" fill="#1a1216"/></g>`;
const text = (x,y,size,value,extra='') => `<text x="${x}" y="${y}" font-family="Segoe UI,Arial,sans-serif" font-size="${size}" fill="#fff7ed" ${extra}>${value}</text>`;
const wrap = (w,h,body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${defs}${body}</svg>`;
const targets = [
 ['Sloth-Logo-104x40',104,40,wrap(104,40,`${mark(-4,-1,43)}${text(36,20,14,'SLOTH','font-weight="800"')}${text(37,30,7,'LAUNCHER','letter-spacing="1.25"')}`)],
 ['Sloth-Icon-128x128',128,128,wrap(128,128,`<rect x="4" y="4" width="120" height="120" rx="26" fill="url(#bg)" stroke="#3a2a27"/>${mark(0,0,128)}`)],
 ['Sloth-Title-Art-285x380',285,380,wrap(285,380,`<rect width="285" height="380" fill="url(#bg)"/><ellipse cx="142" cy="160" rx="185" ry="185" fill="url(#halo)"/><path d="M-40 350 L142 -10 L325 350 M0 390 L142 110 L285 390" fill="none" stroke="#ff9760" stroke-opacity=".1"/><rect x="18" y="18" width="249" height="344" rx="2" fill="none" stroke="#ffd176" stroke-opacity=".18"/>${text(142,50,9,'YOUR NEXT ADVENTURE','text-anchor="middle" letter-spacing="2" fill-opacity=".65"')}${mark(30,62,225)}${text(142,272,36,'SLOTH','text-anchor="middle" font-weight="800" letter-spacing="3"')}${text(142,299,17,'LAUNCHER','text-anchor="middle" letter-spacing="4" fill-opacity=".8"')}<path d="M112 320 H173" stroke="#ff9760" stroke-width="2"/>${text(142,344,9,'BUILT FOR MINECRAFT','text-anchor="middle" letter-spacing="1.8" fill-opacity=".55"')}`)],
 ['Sloth-Cover-Art-1920x282',1920,282,wrap(1920,282,`<rect width="1920" height="282" fill="url(#bg)"/><ellipse cx="380" cy="141" rx="590" ry="340" fill="url(#halo)"/><path d="M1150 360 L1410 -120 L1670 360 M1350 380 L1590 -70 L1830 380 M1530 420 L1790 -65 L2050 420" fill="none" stroke="#ffa06a" stroke-opacity=".12" stroke-width="2"/><path d="M0 280 H1920" stroke="#ff7435" stroke-opacity=".55" stroke-width="3"/>${mark(92,15,252)}${text(370,138,57,'SLOTH','font-weight="800" letter-spacing="5"')}${text(635,138,57,'LAUNCHER','font-weight="300" letter-spacing="3"')}${text(373,182,18,'YOUR MINECRAFT. YOUR NEXT ADVENTURE.','letter-spacing="3" fill-opacity=".62"')}<path d="M370 207 H452" stroke="#ff9760" stroke-width="3"/>`)]
];
app.on('window-all-closed', () => {});
app.whenReady().then(async () => {
 fs.mkdirSync(out,{recursive:true});
 for (const [name,w,h,svg] of targets) {
  fs.writeFileSync(path.join(out,`${name}.svg`),svg);
  const win = new BrowserWindow({width:w,height:h,show:false,frame:false,transparent:true,useContentSize:true,webPreferences:{offscreen:true}});
  await win.loadURL(`data:text/html,${encodeURIComponent(`<html><body style="margin:0;background:transparent;overflow:hidden">${svg}</body></html>`)}`);
  await new Promise(resolve => setTimeout(resolve,200));
  const png = await win.webContents.capturePage({x:0,y:0,width:w,height:h});
  const result = png.resize({width:w,height:h,quality:'best'});
  fs.writeFileSync(path.join(out,`${name}.png`),result.toPNG());
  console.log(`${name}.png: ${JSON.stringify(result.getSize())}`);
  win.destroy();
 }
 app.quit();
}).catch(error => {console.error(error);app.exit(1);});
