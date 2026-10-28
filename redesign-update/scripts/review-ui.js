// Isolated visual regression review. Never loads personal accounts or live instances.
const { app, dialog } = require('electron');
app.setName('Sloth Client UI Review');
app.getVersion = () => require('../package.json').version;
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const profile = fs.mkdtempSync(path.join(os.tmpdir(),'sloth-menu-review-'));
app.setPath('appData',profile);
const launcher = path.join(profile,'Sloth Launcher'); fs.mkdirSync(launcher);
fs.writeFileSync(path.join(launcher,'sloth-launcher-settings.json'), JSON.stringify({backups:{enabled:false},accessibility:{textScale:1,reduceMotion:true}}));
const instance = path.join(profile,'.sloth','instances','sloth');
fs.mkdirSync(path.join(instance,'mods'),{recursive:true});
fs.copyFileSync(path.join(__dirname,'../client-mod/build/libs/sloth-client-1.1.0.jar'),path.join(instance,'mods','A long named sample mod for layout checks.jar'));
const out = path.resolve(process.argv[2] || path.join(__dirname,'../snapshots/review-0.0.10'));
fs.mkdirSync(out,{recursive:true});
const errors=[], results=[], wait=ms=>new Promise(r=>setTimeout(r,ms));
let completed=false;
dialog.showErrorBox=(title,detail)=>{errors.push(title+': '+detail); console.error(title,detail); app.exit(1);};
const timeout=setTimeout(()=>{console.error('Review timed out');app.exit(1);},240000);
app.on('browser-window-created',(_,win)=>{
  win.webContents.setBackgroundThrottling(false);
  win.show = () => win.showInactive();
  win.webContents.on('console-message',event=>{if(event.level==='error')errors.push(event.message);});
  win.webContents.on('render-process-gone',(_,d)=>errors.push('Renderer exited: '+d.reason));
  win.webContents.once('did-finish-load',async()=>{
    win.showInactive();
    const run=code=>win.webContents.executeJavaScript(code);
    try {
      for(let i=0;i<100;i++){if(await run("document.querySelector('#app-version').textContent==='0.0.10'"))break;await wait(100);if(i===99)throw Error('Bootstrap did not finish.');}
      const routes=['home','appearance','friends','instances','downloads','browse','mods','packs','saved','toolbox','care','trust','recovery','workshop','experience','client','history','shots','settings','updates','log'];
      for(const [width,height,scale]of [[1240,800,1],[1040,700,1],[1040,700,1.3]]) {
        win.setContentSize(width,height);
        await run(`applyAccessibility({textScale:${scale},reduceMotion:true,highContrast:false})`);
        for(const route of routes) {
          await run(`showPage(${JSON.stringify(route)});document.querySelector('.main-area').scrollTop=0`);
          await wait(route==='browse'?2500:350);
          await run('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
          const metrics=await run(`(()=>{
            const page=document.querySelector('.page.active'), issues=[];
            for(const e of page.querySelectorAll('button,input,select,h1,h2,h3,p,label,code')) {
              if(!e.getClientRects().length)continue;
              const r=e.getBoundingClientRect(),s=getComputedStyle(e);
              if(r.width<1||r.height<1)continue;
              if(r.right>innerWidth+2)issues.push({kind:'outside-window',tag:e.tagName,text:e.textContent.slice(0,100),right:r.right});
              if(e.scrollWidth>e.clientWidth+3&&s.textOverflow!=='ellipsis'&&s.overflowX!=='auto'&&s.overflowX!=='scroll')issues.push({kind:'horizontal-text',id:e.id,tag:e.tagName,text:e.textContent.slice(0,100),client:e.clientWidth,scroll:e.scrollWidth});
              if(e.tagName==='BUTTON'&&e.scrollHeight>e.clientHeight+3)issues.push({kind:'vertical-button',text:e.textContent.slice(0,100),client:e.clientHeight,scroll:e.scrollHeight});
            }
            return {page:page.id,crumb:document.querySelector('.crumb').innerText,issues,documentWidth:document.documentElement.scrollWidth,viewport:innerWidth};
          })()`);
          const name=`${width}x${height}-scale${scale}-${route}`;
          fs.writeFileSync(path.join(out,name+'.png'),(await win.webContents.capturePage()).toPNG());
          results.push({name,...metrics});
          const scrollable=await run("document.querySelector('.main-area').scrollHeight>document.querySelector('.main-area').clientHeight+100");
          if(scrollable && width===1040 && scale===1.3){await run("document.querySelector('.main-area').scrollTop=document.querySelector('.main-area').scrollHeight");await wait(150);fs.writeFileSync(path.join(out,name+'-bottom.png'),(await win.webContents.capturePage()).toPNG());}
        }
      }
      fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({profile,errors,results},null,2));
      completed=true;clearTimeout(timeout);
      console.log(JSON.stringify({screenshots:fs.readdirSync(out).filter(n=>n.endsWith('.png')).length,errors,issues:results.filter(r=>r.issues.length).map(r=>({name:r.name,issues:r.issues}))}));
      app.exit(errors.length?1:0);
    }catch(e){errors.push(e.stack);fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({errors,results},null,2));console.error(e);app.exit(1);}
  });
});
require('../src/main');
