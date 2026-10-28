// Renders the Sloth mark to PNG icons with Electron's own renderer (no image tooling needed).
// Usage: npx electron scripts/make-icons.js
const fs = require('node:fs');
const path = require('node:path');
const { app, BrowserWindow } = require('electron');

const root = path.join(__dirname, '..');

const sloth = `<defs><linearGradient id="rose" x2="1" y2="1"><stop stop-color="#ffc7e5"/><stop offset="1" stop-color="#f34f9b"/></linearGradient></defs>
<rect x="20" y="20" width="472" height="472" rx="136" fill="#19161f"/>
<path d="M104 260C94 120 170 77 256 88C342 77 418 120 408 260C399 378 339 428 256 429C173 428 113 378 104 260Z" fill="url(#rose)"/>
<path d="M138 245C139 157 200 141 256 167C312 141 373 157 374 245C375 341 314 392 256 392C198 392 137 341 138 245Z" fill="#ffecf3"/>
<path d="M150 223C173 193 207 196 230 226L209 286C179 278 159 256 150 223Z M362 223C339 193 305 196 282 226L303 286C333 278 353 256 362 223Z" fill="#4a2c41"/>
<path d="M172 235Q191 250 210 235 M302 235Q321 250 340 235" fill="none" stroke="#ffecf3" stroke-width="12" stroke-linecap="round"/>
<ellipse cx="256" cy="278" rx="22" ry="16" fill="#4a2c41"/>
<path d="M221 313Q256 343 291 313" fill="none" stroke="#4a2c41" stroke-width="12" stroke-linecap="round"/>
<circle cx="174" cy="295" r="13" fill="#f6a1c7"/><circle cx="338" cy="295" r="13" fill="#f6a1c7"/>`;
const svg = size => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">${sloth}</svg>`;

const targets = [
  [512, path.join(root, 'build', 'icon.png')],
  [256, path.join(root, 'src', 'assets', 'icon.png')],
  [128, path.join(root, 'client-mod', 'src', 'main', 'resources', 'assets', 'sloth-client', 'icon.png')]
];

app.whenReady().then(async () => {
  // Render once at full size, then downscale for the smaller targets.
  const win = new BrowserWindow({ width: 512, height: 512, show: false, frame: false, transparent: true, useContentSize: true, webPreferences: { offscreen: true } });
  await win.loadURL(`data:text/html,${encodeURIComponent(`<html><body style="margin:0;background:transparent;overflow:hidden">${svg(512)}</body></html>`)}`);
  await new Promise(resolve => setTimeout(resolve, 400));
  const full = await win.webContents.capturePage({ x: 0, y: 0, width: 512, height: 512 });
  const base = full.resize({ width: 512, height: 512 });
  for (const [size, out] of targets) {
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, (size === 512 ? base : base.resize({ width: size, height: size, quality: 'best' })).toPNG());
    console.log(`wrote ${path.relative(root, out)} (${size}px)`);
  }
  fs.writeFileSync(path.join(root, 'src', 'assets', 'sloth-logo.svg'), svg(512));
  win.setContentSize(1024, 256);
  const banner = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="256" viewBox="0 0 1024 256"><g transform="translate(0,2) scale(.49)">${sloth}</g><text x="272" y="142" fill="#fff1f8" font-family="Arial,sans-serif" font-size="99" font-weight="800" letter-spacing="5">SLOTH</text><text x="280" y="204" fill="#f69bc7" font-family="Arial,sans-serif" font-size="34" font-weight="600" letter-spacing="17">CLIENT</text></svg>`;
  await win.loadURL(`data:text/html,${encodeURIComponent(`<html><body style="margin:0;background:transparent">${banner}</body></html>`)}`);
  await new Promise(resolve => setTimeout(resolve, 400));
  const logo = await win.webContents.capturePage({ x:0, y:0, width:1024, height:256 });
  fs.writeFileSync(path.join(root, 'client-mod/src/main/resources/assets/sloth-client/textures/gui/logo.png'), logo.toPNG());
  fs.writeFileSync(path.join(root, 'src/assets/sloth-wordmark.png'), logo.toPNG());
  win.destroy();
  app.quit();
});
