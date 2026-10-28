// Exercises Java selection through the real renderer/preload in an isolated launcher profile.
const { app, dialog } = require('electron');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const runtime = process.argv.includes('--packaged') ? path.join(root, 'release/sloth-development/win-unpacked/resources/app.asar/src') : path.join(root, 'src');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'sloth-java-selection-'));
app.setPath('appData', profile);
app.getVersion = () => require('../package.json').version;
const dir = path.join(profile, '.sloth/instances/sloth/mods');
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'java-requirement.jar'), require('./fixtures/zip.cjs').archive([
  ['fabric.mod.json', JSON.stringify({schemaVersion:1,id:'java_requirement',version:'1.0.0',depends:{java:'>=21'}})]
]));
const executable = path.join(process.env.JAVA_HOME || 'C:/Program Files/Java/jdk-21.0.12.1', 'bin/java.exe');
let version = 17;
// The version probe is mocked; IPC, native picker handling, settings and mod inspection are real.
require(path.join(runtime, 'lib/health')).javaVersion = async () => version;
dialog.showOpenDialog = async () => ({ canceled:false, filePaths:[executable] });
dialog.showErrorBox = (title, detail) => { console.error(title, detail); app.exit(1); };
const timer = setTimeout(() => { console.error('Java selection check timed out'); app.exit(1); }, 60000);
app.on('browser-window-created', (_, win) => {
  win.show = () => {};
  win.webContents.once('did-finish-load', async () => {
    if (!win.webContents.getURL().includes('/index.html')) return;
    const run = script => win.webContents.executeJavaScript(script);
    try {
      const failure = await run('window.sloth.chooseJava().then(()=>null,error=>error.message)');
      assert.match(failure, /Java 17 cannot run/);
      assert.equal((await run('window.sloth.bootstrap()')).settings.javaPath, '');
      version = 21;
      assert.equal((await run('window.sloth.chooseJava()')).javaPath, executable);
      let mods = await run('window.sloth.modsInspect()');
      assert.equal(mods.mods[0].issues.length, 0);
      assert.equal((await run('window.sloth.launchReadiness()')).checks.find(check => check.title === 'Java').level, 'good');
      version = 17;
      mods = await run('window.sloth.modsInspect()');
      assert.ok(mods.mods[0].issues.some(issue => /Requires java/.test(issue)));
      const support = await run('window.sloth.supportPreview()');
      assert.ok(support.report.mods.mods[0].issues.some(issue => /Requires java/.test(issue)));
      const java = (await run('window.sloth.launchReadiness()')).checks.find(check => check.title === 'Java');
      assert.equal(java.level, 'blocked'); assert.match(java.detail, /Java 17 selected/);
      await run("window.sloth.saveSettings({javaPath:''})");
      assert.equal((await run('window.sloth.modsInspect()')).mods[0].issues.length, 0);
      console.log('PASS Java picker rejects old runtime without saving; Mod Manager, support and readiness use selected Java; bundled reset restores Java 21');
      clearTimeout(timer); app.exit(0);
    } catch (error) { console.error(error.stack); app.exit(1); }
  });
});
require(path.join(runtime, 'main'));
