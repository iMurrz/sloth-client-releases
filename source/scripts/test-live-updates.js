// Downloads the public release with the real updater and Sloth signature hook.
// An isolated adapter simulates an older installed version. Installation is disabled.
const { app } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.join(__dirname, '..');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'sloth-update-audit-'));
app.setPath('userData', profile);
Object.defineProperty(app, 'isPackaged', { value: true });
const updaterModule = require('electron-updater');
const adapter = {
  version: '0.2.10', name: 'SlothUpdateAudit', isPackaged: true,
  appUpdateConfigPath: path.join(root, 'release', 'win-unpacked', 'resources', 'app-update.yml'),
  userDataPath: profile, baseCachePath: profile,
  whenReady: () => app.whenReady(),
  onQuit: () => {}, quit: () => { throw new Error('Audit cannot quit to install.'); }, relaunch: () => { throw new Error('Audit cannot relaunch.'); }
};
const client = new updaterModule.NsisUpdater(undefined, adapter);
const { ElectronHttpExecutor } = require('electron-updater/out/electronHttpExecutor');
client.httpExecutor = new ElectronHttpExecutor(() => {});
client.doInstall = () => { throw new Error('Audit cannot run an installer.'); };
require.cache[require.resolve('electron-updater')].exports = { autoUpdater: client };
const states = [];
let signatureVerified = false;
const controller = require('../src/lib/updater').createUpdater({
  send: state => { states.push(state); if (state.state !== 'downloading' || state.percent === 0 || state.percent === 100) console.log(`Update state: ${state.state}${state.version ? ' ' + state.version : ''}`); },
  log: message => { if (String(message).includes('signature verified')) signatureVerified = true; }
});
client.autoInstallOnAppQuit = false;
client.disableDifferentialDownload = true;
app.whenReady().then(async () => {
  try {
    const result = await controller.check();
    assert.ok(result?.downloadPromise, 'Public feed should offer an update to the simulated older version.');
    const files = await result.downloadPromise;
    assert.equal(signatureVerified, true, 'Sloth must verify the downloaded release signature.');
    assert.ok(states.some(state => state.state === 'ready' && state.version === require('../package.json').version));
    assert.ok(files.some(file => file.endsWith('.exe')));
    assert.equal(client.autoInstallOnAppQuit, false);
    fs.writeFileSync(path.join(root, 'release', 'live-update-audit.json'), JSON.stringify({ version: result.updateInfo.version, checkedAt: new Date().toISOString(), sha512VerifiedByUpdater: true, slothSignatureVerified: true, readyEventReceived: true, installerExecuted: false }, null, 2));
    console.log('PASS public update discovery, full installer download, SHA-512 verification, Sloth signature verification and ready-to-install event. Installer was not executed.');
    // The exact temporary directory belongs to this audit process.
    if (path.dirname(profile) === path.resolve(os.tmpdir()) && path.basename(profile).startsWith('sloth-update-audit-')) {
      try { fs.rmSync(profile, { recursive: true, force: true }); }
      catch { console.log('Temporary Chromium profile remains locked until this audit process exits.'); }
    }
    app.exit(0);
  } catch (error) { console.error(error); app.exit(1); }
});
