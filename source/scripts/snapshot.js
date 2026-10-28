// Developer helper: `npm run snapshot` starts the app with SLOTH_SNAPSHOT_DIR set; this captures each page
// to PNG and quits. Wired from main.js only when the app is not packaged.
const fs = require('node:fs');
const path = require('node:path');
const { app } = require('electron');

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

function attach(win, dir) {
  fs.mkdirSync(dir, { recursive: true });
  // A window hidden behind others is throttled and captures stale frames; keep it painting.
  win.webContents.setBackgroundThrottling(false);
  win.webContents.once('did-finish-load', async () => {
    try {
      await wait(2500);
      const shots = [
        ['home', "document.querySelector('[data-page=home]').click()"],
        ['downloads', "document.querySelector('[data-page=downloads]').click()"],
        ['account', "document.querySelector('[data-page=appearance]').click()"],
        ['settings', "document.querySelector('[data-page=settings]').click()"],
        ['updates', "document.querySelector('[data-page=updates]').click()"],
        ['help', "document.querySelector('[data-page=toolbox]').click()"],
        ['client', "document.querySelector('[data-go=client]').click()"],
        ['log', "document.querySelector('[data-go=log]').click()"],
        // Live Modrinth search (read-only).
        ['browse', "document.querySelector('[data-download-page=browse]').click()", 4000],
        ['browse-shaders', "{ const t = document.querySelector('#browse-type'); t.value = 'shader'; t.dispatchEvent(new Event('change')); }", 4000],
        ['browse-installed', "document.querySelector('#browse-installed-toggle').click()", 1500],
        ['shots', "document.querySelector('[data-page=shots]').click()", 2500],
        // Scans (never imports) the first detected launcher.
        ['import', "document.querySelector('[data-page=settings]').click(); { const s = document.querySelector('#import-source'); if (s.options.length > 1) { s.selectedIndex = 1; s.dispatchEvent(new Event('change')); } } document.querySelector('#import-card').scrollIntoView()", 3500],
        ['accounts', "document.querySelector('[data-page=home]').click(); document.querySelector('#account-button').click()"],
        // Requests a real (unused, self-expiring) device code from Microsoft to show the sign-in panel.
        ['signin', "document.querySelector('#add-account').click()", 3500]
      ];
      for (const [name, script, delay = 500] of shots) {
        try {
          await win.webContents.executeJavaScript(script);
          await wait(delay);
          // Let page transitions finish and two fresh frames paint before capturing.
          await win.webContents.executeJavaScript('new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))');
          await wait(250);
          const image = await win.webContents.capturePage();
          fs.writeFileSync(path.join(dir, `${name}.png`), image.toPNG());
        } catch (error) {
          console.warn(`Snapshot ${name} skipped: ${error.message}`);
        }
      }
      await win.webContents.executeJavaScript("document.querySelector('#cancel-signin')?.click()");
      await wait(300);
    } finally {
      app.quit();
    }
  });
}

module.exports = { attach };
