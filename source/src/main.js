const { app, BrowserWindow, ipcMain, clipboard, shell, safeStorage, session, dialog, nativeImage, Notification, screen } = require('electron');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const crypto = require('node:crypto');
const os = require('node:os');
const path = require('node:path');
const config = require('./lib/config');
const { setUserAgent, observeDownloads } = require('./lib/http');
const windowState = require('./lib/window-state');
const modrinthPacks = require('./lib/modrinth-packs');
const { Settings, ACCENTS } = require('./lib/settings');
const { InstanceManager, cleanLaunch } = require('./lib/instances');
const { Recovery, diagnose } = require('./lib/recovery');
const workshop = require('./lib/workshop');
const health = require('./lib/health');
const resourcePacks = require('./lib/resource-packs');
const automaticBackups = require('./lib/automatic-backups');
const performance = require('./lib/performance');
const { LauncherRecovery } = require('./lib/launcher-recovery');
const { scrub } = require('./lib/report-privacy');
const { Shelf } = require('./lib/shelf');
const { Appearance } = require('./lib/appearance');
const { LocalCapes } = require('./lib/local-capes');
const instanceCompare = require('./lib/instance-compare');
const portable = require('./lib/portable');
const connections = require('./lib/connection-check');
const { Maintenance } = require('./lib/maintenance');
const { ModUpdates } = require('./lib/mod-updates');
const { DownloadCenter } = require('./lib/download-center');
const modManager = require('./lib/mod-manager');
const { LaunchHistory } = require('./lib/launch-history');
const { AccountStore } = require('./lib/auth/accounts');
const { SessionManager, AuthError } = require('./lib/auth/session');
const { prepareGame } = require('./lib/game/installer');
const { buildLaunchArgs, redactArgs, spawnGame } = require('./lib/game/launch');
const { catalog } = require('./lib/game/mods');
const { createUpdater } = require('./lib/updater');
const { PreferenceSync } = require('./lib/preference-sync');
const importer = require('./lib/importer');
const library = require('./lib/library');
const captureStudio=require('./lib/capture-studio');
const {SessionSeal}=require('./lib/session-seal');
const {sealKeyProvider}=require('./lib/seal-key');
const sessionSeal=new SessionSeal({keyProvider:()=>localSealKey()});
let localSealKey;
const lock = require('./lib/game/mods-lock.json');
const { Friends } = require('./lib/friends');
const officialFriends = new (require('./lib/minecraft-friends').MinecraftFriends)();
let friends;

// Retain the established profile path across the product rename.
const legacyProfile = ['Sloth Launcher', 'sloth-launcher'].map(name => path.join(app.getPath('appData'), name));
app.setPath('userData', legacyProfile.find(folder => fs.existsSync(folder)) || legacyProfile[0]);
if (!app.requestSingleInstanceLock()) app.quit();
app.setAppUserModelId('com.sloth.launcher');
// Every renderer (launcher UI and the Microsoft sign-in window) runs in Chromium's OS-level sandbox.
app.enableSandbox();

// No window may embed <webview>s, and new windows are denied unless a specific handler allows them.
app.on('web-contents-created', (_event, contents) => {
  contents.on('will-attach-webview', event => event.preventDefault());
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
});

let win;
let settings;
let instances;
let accounts;
let sessions;
let updater;
let preferenceSync;
let activeUpdateChannel = 'stable';
let launcherLog;
const gameRoot = path.join(app.getPath('appData'), '.sloth');
const recovery = new Recovery(gameRoot);
const appearance = new Appearance(gameRoot, nativeImage);
const localCapes = new LocalCapes(gameRoot, nativeImage);
const launcherRecovery = new LauncherRecovery(gameRoot);
const launcherHealth = new (require('./lib/launcher-health').LauncherHealth)(gameRoot);
let previousStartup, launcherReady=false, startupWatchdog, recoveryPrompt=false;
async function offerLauncherRecovery(reason){
 if(!app.isPackaged||recoveryPrompt||game.child||game.busy)return;recoveryPrompt=true;
 try{const saved=await launcherRecovery.status();if(!saved.available)return;const choice=await dialog.showMessageBox({type:'warning',title:'Sloth startup check',message:reason,detail:'You can keep this version or open the preserved launcher after its files are checked. Your accounts, settings and worlds remain in your profile. An interrupted startup alone does not confirm a crash.',buttons:['Keep current version','Open previous version'],defaultId:0,cancelId:0,noLink:true});if(choice.response===1){if(game.child||game.busy)throw Error('Close Minecraft and wait for downloads before recovery.');const execPath=await launcherRecovery.executable();app.relaunch({execPath,args:['--sloth-recovery']});app.exit(0);}}
 catch(e){log('Startup recovery unavailable: '+e.message);}finally{recoveryPrompt=false;}
}
const shelf = new Shelf(gameRoot);
const maintenance = new Maintenance(gameRoot);
const modUpdates = new ModUpdates();
const downloads = new DownloadCenter(gameRoot, value => send('sloth:downloads', value), () => instances?.value.activeId || 'sloth');
observeDownloads(event => downloads.record(event));
let backupStatus = { message: 'Backups run while the launcher is open and Minecraft is closed.' };
const launchHistory = new LaunchHistory(gameRoot);
const sessionPlanner=new (require('./lib/session-planner').SessionPlanner)(gameRoot);
const startupTimeline=new (require('./lib/startup-timeline').StartupTimeline)(gameRoot);
let supportReview=null;
const serverProfiles=new (require('./lib/server-profiles').ServerProfiles)(gameRoot);

let dataOperation = false;
const DATA_CHANNELS = new Set(['sloth:recovery-create', 'sloth:recovery-restore', 'sloth:instances-create', 'sloth:instances-select', 'sloth:instances-edit', 'sloth:instances-testing', 'sloth:workshop-preset', 'sloth:browse-install', 'sloth:modpack-install', 'sloth:browse-remove', 'sloth:import-run', 'sloth:save-settings', 'sloth:mods-toggle', 'sloth:mods-import']);
for(const channel of ['sloth:server-profile-save','sloth:server-profile-remove','sloth:settings-history-restore'])DATA_CHANNELS.add(channel);
for (const channel of ['sloth:care-repair', 'sloth:resource-change', 'sloth:backup-now', 'sloth:launcher-rollback', 'sloth:install-update']) DATA_CHANNELS.add(channel);
for (const channel of ['sloth:portable-export', 'sloth:portable-import', 'sloth:cleanup-run', 'sloth:mod-updates-apply', 'sloth:download-retry']) DATA_CHANNELS.add(channel);
for (const channel of ['sloth:appearance-import', 'sloth:appearance-save', 'sloth:appearance-remove', 'sloth:appearance-apply', 'sloth:appearance-cape', 'sloth:switch-account', 'sloth:sign-out']) DATA_CHANNELS.add(channel);
for(const c of ['sloth:session-save','sloth:session-remove','sloth:session-apply','sloth:session-undo'])DATA_CHANNELS.add(c);
const activeInstanceDir = () => instances.instancePath();
async function inspectInstanceMods(instance = instances.get()) {
  const dir = instances.instancePath(instance.id), current = settings.get();
  const javaVersion = current.javaPath ? String(await health.javaVersion(current.javaPath)) : '21';
  return modManager.inspect(dir, config.game.version, config.game.fabricLoader, { standalone: Boolean(instance.pack), javaVersion });
}
DATA_CHANNELS.add('sloth:local-cape-select');
for (const channel of ['sloth:sync-choose', 'sloth:sync-disable', 'sloth:sync-publish', 'sloth:sync-review', 'sloth:sync-apply', 'sloth:sync-restore']) DATA_CHANNELS.add(channel);
for(const channel of ['sloth:shot-album','sloth:shot-edit-save','sloth:seal-review','sloth:seal-approve','sloth:seal-disable'])DATA_CHANNELS.add(channel);
const totalMemoryMb = Math.floor(os.totalmem() / 1024 / 1024);
const maxMemoryMb = Math.max(2048, Math.min(16384, Math.floor((totalMemoryMb - 2048) / 512) * 512));
const game = { child: null, busy: false, controller: null, lines: [], pending: [], flushTimer: null, stopping: false, lastUpdate: null };
game.startedAt = null; game.reminderTimer = null;
const signIn = { controller: null, pageUrl: null };

// ---------- logging ----------
function log(message) {
  const line = `[${new Date().toISOString()}] ${redactSecrets(String(message))}\n`;
  try { launcherLog?.write(line); } catch { /* ignore */ }
  if (!app.isPackaged) process.stdout.write(line);
}

function send(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

// Minecraft access tokens are JWTs; nothing that looks like one is kept from game output.
const JWT_PATTERN = /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g;

/** Strips the live session token (and anything JWT-shaped) from game output before it's shown, copied or kept. */
function redactSecrets(text) {
  let out = text.replace(JWT_PATTERN, '<redacted>');
  out = out.replace(/((?:access[_-]?token|refresh[_-]?token|authorization|client[_-]?secret|api[_-]?key)\s*[=:]\s*)(?:Bearer\s+)?[^\s,;]+/gi, '$1<redacted>');
  if (game.secret && game.secret.length >= 16) out = out.split(game.secret).join('<redacted>');
  return out;
}

function pushGameLine(line) {
  const clean = redactSecrets(line.replace(/\u001b\[[0-9;]*m/g, '')).slice(0, 2000);
  if(clean.includes('Sloth settings initialized after Minecraft startup'))startupTimeline.ready();
  game.lines.push(clean);
  if (game.lines.length > 3000) game.lines.splice(0, game.lines.length - 3000);
  game.pending.push(clean);
  game.flushTimer ??= setTimeout(() => {
    game.flushTimer = null;
    send('sloth:log', game.pending.splice(0));
  }, 250);
}

// ---------- helpers ----------

function bundledMods() {
  const dir = app.isPackaged ? path.join(process.resourcesPath, 'mods') : path.join(__dirname, '..', 'client-mod', 'build', 'libs');
  try {
    return fs.readdirSync(dir).filter(f => /^sloth-client-[\w.+-]+\.jar$/.test(f) && !/-(sources|dev)\.jar$/.test(f)).map(f => path.join(dir, f));
  } catch {
    return [];
  }
}

/** Tiny Java entry point that reads the access token from stdin, so it never appears on the command line. */
function launchWrapperJar() {
  const jar = app.isPackaged
    ? path.join(process.resourcesPath, 'launchwrapper', 'sloth-launchwrapper.jar')
    : path.join(__dirname, '..', 'launchwrapper', 'build', 'sloth-launchwrapper.jar');
  if (!fs.existsSync(jar)) throw new Error('Launcher files are incomplete (launch wrapper missing). Reinstall Sloth Client.');
  return jar;
}

/** Jars in the mods folder that the player added themselves (not managed or bundled by the launcher). */
function userMods() {
  const dir = path.join(activeInstanceDir(), 'mods');
  let managed = [];
  try { managed = JSON.parse(fs.readFileSync(path.join(dir, '.sloth-managed.json'), 'utf8')).files || []; } catch { /* none yet */ }
  try {
    return fs.readdirSync(dir).filter(f => f.toLowerCase().endsWith('.jar') && !managed.includes(f)).sort();
  } catch {
    return [];
  }
}

function gameState(extra = {}) {
  return { running: Boolean(game.child), busy: game.busy, startedAt: game.child ? game.startedAt : null, ...extra };
}
function activateLaunch(item) {
  const saved = settings.update({ ...(item.launch || {}), mods: item.mods });
  settings.instanceId = item.id;
  instances.setLaunch(item.id, saved);
  return saved;
}
function sessionInsights() {
  const sessions = launchHistory.list(); const cutoff = Date.now() - 7 * 86400000;
  const tracked = sessions.filter(s => Number.isFinite(s.durationSeconds) && s.durationSeconds >= 0);
  return { launches: sessions.length, tracked: tracked.length, totalSeconds: tracked.reduce((n, s) => n + s.durationSeconds, 0), weekSeconds: tracked.filter(s => Date.parse(s.startedAt) >= cutoff).reduce((n, s) => n + s.durationSeconds, 0), crashes: sessions.filter(s => s.status === 'crashed').length };
}

function publicState() {
  return {
    appVersion: app.getVersion(),
    gameVersion: config.game.version,
    instances: instances.list(),
    activeInstanceId: instances.value.activeId,
    settings: settings.get(),
    accents: ACCENTS,
    accounts: accounts.list(),
    canPersistAccounts: accounts.canPersist,
    catalog: catalog(),
    requiredMods: lock.mods.filter(m => m.category === 'required').map(m => m.slug),
    memory: { totalMb: totalMemoryMb, maxMb: maxMemoryMb },
    game: gameState(),
    update: game.lastUpdate,
    activeUpdateChannel,
    hasClientMod: bundledMods().length > 0
  };
}

// ---------- play ----------
async function play({ repair = false, server = null } = {}) {
  if (dataOperation) throw new Error('Wait for the current instance operation to finish.');
  if (game.child) throw new Error('Minecraft is already running.');
  if (game.busy) throw new Error('Already getting the game ready.');
  const account = accounts.active();
  if (!account) throw new AuthError('Sign in with Microsoft to play.', 'signin');
  let serverSetup;
  if(server){serverSetup=serverProfiles.find(server,instances);instances.setActive(serverSetup.instanceId);activateLaunch(instances.get());}
  const current = settings.get();
  game.busy = true;
  game.controller = new AbortController();
  send('sloth:game-state', gameState());
  try {
    startupTimeline.start(instances.value.activeId);
    send('sloth:progress', { stage: 'health', label: 'Checking your setup before launch' });
    const before = await inspectHealth();
    send('sloth:health', before);
    if (before.blocked) throw new Error('Launch paused: ' + before.checks.filter(x => x.level === 'error').map(x => `${x.title}: ${x.detail}`).join(' '));
    await sessionSeal.check(activeInstanceDir());
    await runAutomaticBackup(false, true);
    startupTimeline.mark('Account renewal');
    send('sloth:progress', { stage: 'auth', label: `Signing in as ${account.name}` });
    const session = await sessions.launchSession(account.uuid);
    send('sloth:accounts', accounts.list());

    startupTimeline.mark('Game verification and downloads');
    const preparationStarted = Date.now();
    const plan = await prepareGame({
      root: gameRoot,
      instanceId: instances.value.activeId,
      gameVersion: config.game.version,
      loaderVersion: config.game.fabricLoader,
      modSettings: current.mods,
      standalone: Boolean(instances.get().pack),
      bundledMods: bundledMods(),
      
      javaPath: current.javaPath || undefined,
      deep: repair,
      signal: game.controller.signal,
      onProgress: progress => send('sloth:progress', progress)
    });
    log(`Game preparation completed in ${((Date.now() - preparationStarted) / 1000).toFixed(2)} seconds`);
    if (plan.downloaded.files) log(`Downloaded ${plan.downloaded.files} files (${(plan.downloaded.bytes / 1e6).toFixed(1)} MB)`);
    startupTimeline.mark('Final setup checks');
    const modReport=await modManager.inspect(plan.gameDir,config.game.version,config.game.fabricLoader,{standalone:Boolean(instances.get().pack),javaVersion:current.javaPath?String(await health.javaVersion(plan.javaPath)):"21"});
    const blockers=modReport.mods.flatMap(m=>(m.blockers||[]).map(detail=>m.name+': '+detail));
    if(blockers.length)throw Error('Launch paused: '+blockers.join(' ')+' Open Mod Manager; your mod files are preserved.');
    if(serverSetup?.profile)await require('./lib/server-profile-link').apply(plan.gameDir,serverSetup);
    if (!instances.get().pack) await friends.publish(plan.gameDir).catch(() => log('Friends list could not be synchronized; open Friends to review it.'));
    send('sloth:progress', { stage: 'seal', label: 'Checking your reviewed Session Seal' });
    await sessionSeal.check(plan.gameDir);
    const prepared = await inspectHealth();
    send('sloth:health', prepared);
    if (prepared.blocked) throw new Error('Launch paused after preparation. Open Game Care to resolve the reported errors.');
    const args = buildLaunchArgs(plan, {
      session,
      memoryMb: current.memoryMb,
      quickPlay: serverSetup?.address,
      resolution: current.resolution,
      accentHue: ACCENTS[current.accent],
      wrapperJar: launchWrapperJar(),
      launcherName: config.launcherName,
      launcherVersion: app.getVersion(),
      clientId: current.clientId
    });
    const extraMods = userMods();
    log(`Launching ${plan.profileId} (${instances.get().name}) as ${session.name} with mods: ${plan.enabledMods.join(', ')}${extraMods.length ? `; player-added: ${extraMods.join(', ')}` : ''}`);
    log(`Command: ${plan.javaPath} ${redactArgs(args).filter(a => !a.includes(path.delimiter)).join(' ')}`);

    send('sloth:progress', { stage: 'launch', label: 'Starting Minecraft' });
    startupTimeline.starting();
    game.lines = []; game.linesInstanceId = instances.value.activeId;
    game.secret = session.accessToken;
    const capture = current.onLaunch !== 'close';
    let journalId;
    const child = spawnGame(plan, args, {
      capture,
      // Deliver the token over a pipe to reduce command-line exposure; it still exists in game memory.
      stdinSecret: session.accessToken,
      onLine: pushGameLine,
      onExit: ({ code, signal, error }) => {
        if (game.child !== child) return;
        game.child = null;
        clearInterval(game.reminderTimer); game.reminderTimer = null; game.startedAt = null;
        game.secret = null;
        const crashed = !game.stopping && (Boolean(error) || (code !== 0 && code !== null));
        if(startupTimeline.current?.status==='starting')startupTimeline.finish(crashed?'failed-before-ready':'client-marker-not-observed');
        try { launchHistory.finish(journalId, { code, crashed, stopped: game.stopping }); } catch (err) { log(`Could not save launch history: ${err.message}`); }
        game.stopping = false;
        log(`Game exited: ${error ? error.message : `code ${code}${signal ? ` (${signal})` : ''}`}`);
        send('sloth:game-state', gameState({ exitCode: code, crashed, error: error?.message }));
        fs.promises.writeFile(path.join(gameRoot, 'last-launch-findings.json'), JSON.stringify({ at: new Date().toISOString(), instanceId: instances.value.activeId, findings: diagnose(game.lines) })).catch(() => {});
        setTimeout(() => runAutomaticBackup(), 3000).unref();
        if (win && !win.isDestroyed()) {
          if (win.isMinimized()) win.restore();
          if (crashed) win.focus();
        }
      }
    });
    try { journalId = launchHistory.start(instances.get(), { version: config.game.version, memoryMb: current.memoryMb, capture }); } catch (err) { log(`Could not save launch history: ${err.message}`); }
    if (!capture) {
      child.secretSent.then(() => setTimeout(() => app.quit(), 1500));
      return { launched: true };
    }
    game.child = child;
    game.startedAt = new Date().toISOString();
    if (current.reminderMinutes > 0) {
      const started = Date.now(); let next = current.reminderMinutes;
      game.reminderTimer = setInterval(() => {
        if (!game.child) return;
        const elapsed = Math.floor((Date.now() - started) / 60000);
        if (elapsed < next) return;
        next = (Math.floor(elapsed / current.reminderMinutes) + 1) * current.reminderMinutes;
        const message = `You have been playing for ${elapsed} minutes. A quick stretch or break might feel good.`;
        send('sloth:session-reminder', { message });
        if (Notification.isSupported()) new Notification({ title: 'Sloth · Time for a breather', body: message, silent: true }).show();
      }, 30000).unref();
    }
    send('sloth:game-state', gameState());
    if (current.onLaunch === 'minimize') setTimeout(() => win?.minimize(), 1200);
    return { launched: true };
  } catch (err) {
    if (game.controller?.signal.aborted) throw new Error('Cancelled.');
    startupTimeline.finish(game.controller?.signal.aborted?'cancelled':'failed');
    log(`Play failed: ${err.stack || err.message}`);
    if (err instanceof AuthError) send('sloth:accounts', accounts.list());
    throw err;
  } finally {
    game.busy = false;
    game.controller = null;
    send('sloth:game-state', gameState());
  }
}

async function inspectHealth() {
  const wrapper = app.isPackaged ? path.join(process.resourcesPath, 'launchwrapper', 'sloth-launchwrapper.jar') : path.join(__dirname, '..', 'launchwrapper', 'build', 'sloth-launchwrapper.jar');
  return health.inspect({ root: gameRoot, dir: activeInstanceDir(), instance: instances.get(), settings: settings.get(), totalMb: totalMemoryMb, wrapper, bundled: bundledMods() });
}
async function runAutomaticBackup(force = false, launchOwned = false) {
  if (!launchOwned && (dataOperation || game.busy || game.child)) return { skipped: true, message: 'Backup deferred until Minecraft and other operations finish.' };
  if (!launchOwned) dataOperation = true;
  try {
    const result = await automaticBackups.run({ recovery, manager: instances, policy: settings.get().backups, force, signal: launchOwned ? game.controller?.signal : undefined, progress: p => {
      send('sloth:recovery-progress', p);
      send('sloth:backup-status', { message: p.label + (p.total ? ` · ${p.done} / ${p.total} files` : '…') });
      if (game.busy) send('sloth:progress', { stage: 'backup', ...p });
    } });
    backupStatus = { ...result, at: new Date().toISOString() }; send('sloth:backup-status', backupStatus); return result;
  } catch (e) {
    backupStatus = { message: e.message, at: new Date().toISOString(), error: true }; send('sloth:backup-status', backupStatus);
    if (force) throw e;
    return backupStatus;
  } finally { if (!launchOwned) dataOperation = false; }
}
async function launchFindings() {
  if (game.lines.length && game.linesInstanceId === instances.value.activeId) return { findings: diagnose(game.lines), hasOutput: true, source: 'Captured output for the active instance' };
  const { guard } = require('./lib/file-tools');
  const root = activeInstanceDir(), candidates = [];
  const add = async (relative, source) => {
    const file = await guard(root, path.join(root, relative), true);
    const stat = await fs.promises.stat(file).catch(e => { if (e.code === 'ENOENT') return null; throw e; });
    if (stat?.isFile()) candidates.push({ file, stat, source });
  };
  try {
    await add(path.join('logs', 'latest.log'), 'Latest Minecraft log');
    const reports = await guard(root, path.join(root, 'crash-reports'), true);
    const names = await fs.promises.readdir(reports).catch(e => { if (e.code === 'ENOENT') return []; throw e; });
    if (names.length > 1000) throw new Error('Too many crash reports. Archive older reports before scanning.');
    for (const name of names.filter(n => /^crash-[A-Za-z0-9_.-]+\.txt$/.test(n))) await add(path.join('crash-reports', name), 'Minecraft crash report');
    const newest = candidates.sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs)[0];
    if (!newest) return { findings: [], hasOutput: false };
    const handle = await fs.promises.open(newest.file, 'r');
    try {
      const stat = await handle.stat(), size = Math.min(stat.size, 1024 * 1024), buffer = Buffer.alloc(size);
      await handle.read(buffer, 0, size, stat.size - size);
      return { findings: diagnose(redactSecrets(buffer.toString()).split('\n')), hasOutput: size > 0, source: `${newest.source} · ${new Date(stat.mtimeMs).toISOString()}`, truncated: stat.size > size };
    } finally { await handle.close(); }
  } catch (e) { if (e.code !== 'ENOENT') throw e; return { findings: [], hasOutput: false }; }
}

// ---------- IPC ----------
function handle(channel, fn) {
  ipcMain.handle(channel, async (event, ...args) => {
    if (!win || event.sender !== win.webContents || event.senderFrame !== event.sender.mainFrame) {
      return { ok: false, error: { message: 'Untrusted sender' } };
    }
    const changesData = DATA_CHANNELS.has(channel);
    if (changesData && (dataOperation || game.busy || game.child)) return { ok: false, error: { message: 'Close Minecraft and wait for the current operation to finish before changing instance data.' } };
    if (changesData) dataOperation = true;
    try {
      return { ok: true, value: await fn(...args) };
    } catch (err) {
      return { ok: false, error: { message: redactSecrets(err?.message || String(err)), code: err?.code } };
    } finally {
      if (changesData) dataOperation = false;
    }
  });
}

const FOLDERS = { game: '', mods: 'mods', logs: 'logs', screenshots: 'screenshots', resourcepacks: 'resourcepacks', shaderpacks: 'shaderpacks', crash: 'crash-reports' };

function registerIpc() {
  handle('sloth:server-profiles',()=>serverProfiles.read());
  handle('sloth:server-profile-save',request=>serverProfiles.save(request,instances));
  handle('sloth:server-profile-remove',address=>serverProfiles.remove(address));
  handle('sloth:server-play',async address=>{const result=await play({server:address});return {...publicState(),...result};});
  handle('sloth:settings-history',()=>settings.history.list());
  handle('sloth:settings-history-preview',id=>settings.history.get(id));
  handle('sloth:settings-history-restore',id=>{const entry=settings.history.read().find(v=>v.id===id);if(!entry)throw Error('Settings backup no longer exists.');if(entry.instanceId&&entry.instanceId!==instances.get().id)throw Error('Select the original instance before restoring its settings.');const value=settings.update(settings.history.get(id));instances.setMods(instances.get().id,value.mods);instances.setLaunch(instances.get().id,value);return publicState();});
  handle('sloth:minecraft-friends', async request => {
    const account=accounts.active();
    if(!account||account.uuid!==request?.uuid)throw new Error('Select a signed-in Minecraft account first.');
    const result=await officialFriends.load(account.uuid,()=>sessions.launchSession(account.uuid));
    if(accounts.active()?.uuid!==account.uuid)throw new Error('Account changed. Refresh the selected account.');
    return result;
  });
  handle('sloth:friends-list', async () => ({ ...await friends.list(activeInstanceDir(), Boolean(game.child)), instanceName: instances.get().name }));
  handle('sloth:friends-change', async request => { await friends.change(activeInstanceDir(), request); return true; });
  handle('sloth:trust-status',async()=>{
    const prefs=win.webContents.getLastWebPreferences();let seal,sealError='';
    try{seal=await sessionSeal.status(activeInstanceDir());}catch(e){seal={enrolled:false,protect:false};sealError=e.message;}
    return {instanceId:instances.get().id,instanceName:instances.get().name,seal,sealError,
      encryptionAvailable:accounts.canPersist,sandbox:prefs.sandbox===true,isolated:prefs.contextIsolation===true,nodeDisabled:prefs.nodeIntegration===false,
      packaged:app.isPackaged,version:app.getVersion()};
  });
  handle('sloth:seal-review',()=>sessionSeal.review(activeInstanceDir(),instances.get().id));
  handle('sloth:seal-approve',request=>sessionSeal.approve(activeInstanceDir(),instances.get().id,request?.token,request?.protect));
  handle('sloth:seal-disable',request=>{
    if(request?.instanceId!==instances.get().id)throw new Error('The active instance changed. Reopen Trust Center.');
    return sessionSeal.disable(activeInstanceDir());
  });
  handle('sloth:pack-asset',asset=>resourcePacks.inspectAsset(activeInstanceDir(),asset));
  handle('sloth:shot-albums',()=>captureStudio.albums(activeInstanceDir()));
  handle('sloth:shot-album',request=>{
    if(request?.instanceId!==instances.get().id)throw new Error('The active instance changed. Reopen this screenshot.');
    return captureStudio.assign(activeInstanceDir(),request?.name,request?.album);
  });
  handle('sloth:shot-edit-load',async name=>{
    const instanceId=instances.get().id,root=activeInstanceDir();
    return {...await captureStudio.load(root,name,nativeImage),instanceId};
  });
  handle('sloth:shot-edit-save',request=>{
    if(request?.instanceId!==instances.get().id)throw new Error('The active instance changed. Reopen this screenshot.');
    return captureStudio.save(activeInstanceDir(),request?.name,request?.data,nativeImage);
  });
  handle('sloth:sync-status', () => preferenceSync.status());
  handle('sloth:sync-choose', async () => {
    const result = await dialog.showOpenDialog(win, { title: 'Choose a folder for optional preference sync', properties: ['openDirectory', 'createDirectory'] });
    return result.canceled ? preferenceSync.status() : preferenceSync.choose(result.filePaths[0]);
  });
  handle('sloth:sync-disable', () => preferenceSync.choose(''));
  handle('sloth:sync-publish', choices => {
    if (instances.get().pack) throw new Error('Preference sync currently supports Sloth client instances only.');
    return preferenceSync.publish(activeInstanceDir(), settings.get(), choices);
  });
  handle('sloth:sync-review', choices => {
    if (instances.get().pack) throw new Error('Preference sync currently supports Sloth client instances only.');
    return preferenceSync.review(activeInstanceDir(), instances.get().id, choices);
  });
  handle('sloth:sync-apply', async token => {
    const result = await preferenceSync.apply(activeInstanceDir(), instances.get().id, token);
    return { ...result, settings: settings.update(result.launcher) };
  });
  handle('sloth:sync-restore', () => preferenceSync.restore(activeInstanceDir()));
  handle('sloth:capture-folder', async () => {
    const folder = path.join(activeInstanceDir(), 'replay_recordings');
    await require('./lib/file-tools').guard(activeInstanceDir(), folder, true);
    await fs.promises.mkdir(folder, { recursive: true });
    const error = await shell.openPath(folder); if (error) throw new Error(error);
  });
  function appearanceAccount(request) {
    const account = accounts.active();
    if (!account || account.uuid !== request?.uuid) throw new Error('Select this account again before changing its appearance.');
    return account;
  }
  async function appearanceProfile(uuid, token) {
    const profile = await appearance.profile(token, uuid);
    accounts.updateProfile(uuid, { name: profile.name, skin: profile.skin, variant: profile.variant });
    send('sloth:accounts', accounts.list());
    return { profile, loadouts: await appearance.list(uuid) };
  }
  async function authenticatedAppearance(uuid) {
    let session = await sessions.launchSession(uuid);
    let profile;
    try { profile = await appearance.profile(session.accessToken, uuid); }
    catch (error) {
      if (error.code !== 'profile-session-expired') throw error;
      session = await sessions.refreshSession(uuid);
      profile = await appearance.profile(session.accessToken, uuid);
    }
    return { session, profile };
  }
  handle('sloth:appearance-refresh', async request => {
    const account = appearanceAccount(request);
    let profile;
    try {
      profile = (await authenticatedAppearance(account.uuid)).profile;
    } catch (error) {
      const reason = error?.message || 'Authenticated profile access is unavailable.';
      try {
        profile = await appearance.publicProfile(account.uuid);
        profile.warnings.push(`Current skin loaded from Mojang. Owned cape choices unavailable: ${reason}`);
      } catch {
        if (!account.skin) throw new Error(`${reason} The public skin preview is also unavailable.`);
        profile = { uuid: account.uuid, name: account.name, skin: account.skin, variant: account.skinVariant || 'classic', capes: [], capeId: '', ownedCapesLoaded: false, source: 'Saved preview · not refreshed', warnings: [`Showing the last saved skin. ${reason} Public skin lookup is unavailable; try Refresh again.`] };
      }
    }
    accounts.updateProfile(account.uuid, { name: profile.name, skin: profile.skin, variant: profile.variant });
    send('sloth:accounts', accounts.list());
    return { profile, loadouts: await appearance.list(account.uuid) };
  });
  handle('sloth:appearance-list', request => appearance.list(appearanceAccount(request).uuid));
  handle('sloth:local-capes-list', async request => ({ ...await localCapes.list(activeInstanceDir(), appearanceAccount(request).uuid), supported: !instances.get().pack, instanceId: instances.get().id, instanceName: instances.get().name }));
  handle('sloth:local-cape-preview', request => { appearanceAccount(request); return localCapes.preview(request.id); });
  handle('sloth:local-cape-select', async request => {
    const uuid = appearanceAccount(request).uuid;
    if (instances.get().pack || instances.get().id !== request.instanceId) throw new Error('Choose the same Sloth client instance again. Local capes require the Sloth client mod.');
    return { ...await localCapes.select(activeInstanceDir(), uuid, request.id), supported: true, instanceId: instances.get().id, instanceName: instances.get().name };
  });
  handle('sloth:appearance-import', async request => {
    appearanceAccount(request);
    const picked = await dialog.showOpenDialog(win, { title: 'Choose a Minecraft skin PNG', properties: ['openFile', 'dontAddToRecent'], filters: [{ name: 'Minecraft skin', extensions: ['png'] }] });
    if (picked.canceled || !picked.filePaths[0]) return null;
    return appearance.importFile(picked.filePaths[0]);
  });
  handle('sloth:appearance-save', request => appearance.save(appearanceAccount(request).uuid, request.loadout || {}));
  handle('sloth:appearance-remove', request => appearance.remove(appearanceAccount(request).uuid, request.id));
  handle('sloth:appearance-cape', async request => {
    const account = appearanceAccount(request), { session, profile } = await authenticatedAppearance(account.uuid);
    await appearance.cape(session.accessToken, profile, request.cape);
    try { return await appearanceProfile(account.uuid, session.accessToken); }
    catch { throw new Error('Cape change was accepted, but its refreshed preview is unavailable. Refresh before trying again.'); }
  });
  handle('sloth:appearance-apply', async request => {
    const account = appearanceAccount(request), { session } = await authenticatedAppearance(account.uuid);
    await appearance.apply(session.accessToken, account.uuid, request.id);
    try { return await appearanceProfile(account.uuid, session.accessToken); }
    catch { throw new Error('Loadout changes were accepted, but its refreshed preview is unavailable. Refresh before trying again.'); }
  });

  let comparing = false;
  handle('sloth:instances-compare', async request => {
    if (comparing || game.child || game.busy || dataOperation) throw new Error('Close Minecraft and wait for other operations before comparing.');
    comparing = true; dataOperation = true;
    try { return await instanceCompare.compare(instances, request); }
    finally { comparing = false; dataOperation = false; }
  });
  const toolsProgress = value => send('sloth:tools-progress', value);
  async function exportPortable(choices) {
    const result = await dialog.showSaveDialog(win, { title: 'Export personal Sloth instance', defaultPath: `${instances.get().id}-Sloth.zip`, filters: [{ name: 'Sloth personal archive', extensions: ['zip'] }] });
    if (result.canceled || !result.filePath) return null;
    const destination = path.resolve(result.filePath);
    if (destination === path.resolve(activeInstanceDir()) || destination.startsWith(path.resolve(activeInstanceDir()) + path.sep)) throw new Error('Choose an export location outside this instance.');
    return portable.exportArchive({ root: activeInstanceDir(), instance: instances.get(), file: destination, choices: choices && typeof choices === 'object' ? choices : {}, progress: toolsProgress });
  }
  handle('sloth:portable-export', choices => exportPortable(choices));
  handle('sloth:portable-import', async () => {
    const picked = await dialog.showOpenDialog(win, { title: 'Import a personal Sloth archive as a new instance', properties: ['openFile', 'dontAddToRecent'], filters: [{ name: 'Sloth personal archive', extensions: ['zip'] }] });
    if (picked.canceled || !picked.filePaths[0]) return null;
    const item = await portable.importArchive(picked.filePaths[0], instances, toolsProgress); activateLaunch(item);
    return { instances: instances.list(), activeInstanceId: item.id, settings: settings.get() };
  });
  handle('sloth:cleanup-preview', () => maintenance.scan());
  handle('sloth:cleanup-run', request => maintenance.clean(request, file => shell.trashItem(file)));
  handle('sloth:mod-updates-review', () => modUpdates.review(activeInstanceDir(), config.game.version, instances.get().id, catalogSlugs));
  handle('sloth:mod-updates-apply', request => modUpdates.apply(request || {}, { manager: instances, recovery, catalogSlugs, progress: toolsProgress }));
  handle('sloth:connection-check', connections.inspect);
  handle('sloth:session-status',()=>sessionPlanner.status(activeInstanceDir()));
  handle('sloth:session-compare',request=>sessionPlanner.compare(activeInstanceDir(),request));
  const sessionSaveLauncher=patch=>{if(!patch)return settings.get();const saved=settings.update(patch);instances.setMods(instances.value.activeId,saved.mods);instances.setLaunch(instances.value.activeId,saved);return saved;};
  handle('sloth:session-save',name=>sessionPlanner.save(activeInstanceDir(),settings.get(),name));
  handle('sloth:session-remove',id=>sessionPlanner.remove(activeInstanceDir(),id));
  handle('sloth:session-preview',request=>{if(instances.get().pack)throw Error('Session Planner requires a Sloth client instance. Modpacks keep their own configuration.');return sessionPlanner.preview(activeInstanceDir(),settings.get(),request);});
  handle('sloth:session-apply',request=>sessionPlanner.apply(activeInstanceDir(),settings.get(),request,sessionSaveLauncher));
  handle('sloth:session-undo',()=>sessionPlanner.undo(activeInstanceDir(),settings.get(),sessionSaveLauncher));
  handle('sloth:startup-timeline',()=>startupTimeline.list());
  handle('sloth:download-cancel',id=>id==='launcher-update'?updater.cancel():downloads.cancel(id));
  handle('sloth:downloads-list', () => downloads.list());
  handle('sloth:download-retry', id => downloads.retry(id));
  handle('sloth:shelf-list', () => shelf.list());
  handle('sloth:shelf-toggle', value => shelf.toggle(value));
  handle('sloth:session-insights', sessionInsights);
  handle('sloth:care-health', inspectHealth);
  handle('sloth:resource-inspect', () => resourcePacks.inspect(activeInstanceDir()));
  handle('sloth:resource-change', request => resourcePacks.change(activeInstanceDir(), request));
  handle('sloth:backup-status', () => ({ ...backupStatus, policy: settings.get().backups }));
  handle('sloth:backup-now', () => runAutomaticBackup(true, true));
  handle('sloth:launcher-recovery', () => launcherRecovery.status());
  handle('sloth:renderer-ready',()=>{revealLauncher();if(!launcherReady){launcherReady=true;clearTimeout(startupWatchdog);try{launcherHealth.ready();}catch(e){log('Startup check could not be saved: '+e.message);}}return true;});
  handle('sloth:launcher-recovery-verify',async()=>{await launcherRecovery.executable();return {verified:true,...await launcherRecovery.status()};});
  handle('sloth:launcher-rollback', async () => {
    if (!app.isPackaged) throw new Error('Previous-launcher recovery is available in installed builds.');
    const execPath = await launcherRecovery.executable();
    app.relaunch({ execPath, args: ['--sloth-recovery'] }); app.exit(0);
  });
  handle('sloth:care-repair', async () => {
    const current = settings.get(); const instance = instances.get();
    for (const folder of [gameRoot, path.dirname(activeInstanceDir()), activeInstanceDir(), ...['mods', 'config', 'resourcepacks', 'shaderpacks'].map(x => path.join(activeInstanceDir(), x))]) {
      const stat = await fs.promises.lstat(folder).catch(e => { if (e.code === 'ENOENT') return null; throw e; });
      if (stat?.isSymbolicLink()) throw new Error('Repair does not modify linked instance data.');
    }
    game.busy = true; game.controller = new AbortController(); send('sloth:game-state', gameState());
    try {
      if (fs.existsSync(activeInstanceDir())) {
        try { await recovery.create(activeInstanceDir(), instance, 'Before game repair', p => send('sloth:progress', { stage: 'backup', ...p }), { signal: game.controller.signal }); }
        catch (e) { if (e.code !== 'NO_GAME_DATA') throw e; }
      }
      const plan = await prepareGame({ root: gameRoot, instanceId: instance.id, gameVersion: config.game.version, loaderVersion: config.game.fabricLoader, modSettings: current.mods, standalone: Boolean(instance.pack), bundledMods: bundledMods(),  javaPath: current.javaPath || undefined, deep: true, signal: game.controller.signal, onProgress: p => send('sloth:progress', p) });
      return { downloaded: plan.downloaded, health: await inspectHealth() };
    } finally { game.busy = false; game.controller = null; send('sloth:game-state', gameState()); }
  });
  handle('sloth:bootstrap', () => publicState());
  handle('sloth:launch-readiness', async () => {
    const instance=instances.get(),current=settings.get(),account=accounts.active();const checks=[];
    checks.push({title:'Account',level:!account||account.needsReauth?'blocked':'good',detail:!account?'Sign in with Microsoft to play.':account.needsReauth?'Sign in again; the saved session needs renewal.':account.name+' selected. Online ownership is checked during launch.'});
    checks.push({title:'Instance',level:'good',detail:instance.name+' · Minecraft '+config.game.version+' · '+(instance.pack?'modpack':'Sloth client')});
    if(game.child||game.busy)checks.push({title:'Game session',level:'blocked',detail:game.child?'Minecraft is already running.':'Launch preparation is already in progress.'});
    const tools=require('./lib/file-tools');
    try { const disk=await fs.promises.statfs(gameRoot);const free=disk.bavail*disk.bsize;checks.push({title:'Storage',level:free<256*1024**2?'blocked':free<2*1024**3?'warn':'good',detail:(free/1024**3).toFixed(1)+' GB free. Required download space depends on the selected setup.'}); }catch(e){checks.push({title:'Storage',level:'warn',detail:'Storage could not be checked. Game preparation will report any access problem.'});}
    if(current.javaPath){try{await tools.plain(current.javaPath);const version=await health.javaVersion(current.javaPath);checks.push({title:'Java',level:version<21?'blocked':'good',detail:`Java ${version} selected; Minecraft requires Java 21 or newer.`});}catch(e){checks.push({title:'Java',level:'blocked',detail:'The selected Java runtime could not be checked. Choose Java again or use the bundled runtime.'});}}
    else checks.push({title:'Java',level:'info',detail:'Bundled Java is prepared automatically when needed.'});
    try { const file=path.join(gameRoot,'versions',config.game.version,config.game.version+'.jar');const stat=await tools.plain(file,true);checks.push({title:'Game download',level:'info',detail:stat?'Main game archive is cached. Launch still verifies required files and downloads anything missing.':'Main game archive is not cached. Play will download the required game files.'}); }catch(e){checks.push({title:'Game download',level:'warn',detail:'Cached game files need review in Game Care.'});}
    try { const report=await inspectInstanceMods(instance);checks.push({title:'Mods',...modManager.compatibilitySummary(report)}); }catch(e){checks.push({title:'Mods',level:'warn',detail:'Mod inspection failed. Open Mod Manager for details.'});}
    return {instanceId:instance.id,checks,blocked:checks.some(c=>c.level==='blocked'),checkedAt:new Date().toISOString()};
  });
  handle('sloth:mods-inspect', () => inspectInstanceMods());
  handle('sloth:mods-toggle', async ({ filename, enabled } = {}) => {
    await modManager.toggle(activeInstanceDir(), filename, enabled, { standalone: Boolean(instances.get().pack) });
    return inspectInstanceMods();
  });
  handle('sloth:mods-fingerprint', filename => modManager.fingerprint(activeInstanceDir(), filename));
  handle('sloth:launch-history', () => launchHistory.list());
  handle('sloth:support-preview', async () => {
    const instance = instances.get();
    const mods = await inspectInstanceMods(instance);
    const setup = await workshop.inspect(gameRoot, instance, settings.get(), totalMemoryMb);
    const report = {
      schema: 1, generatedAt: new Date().toISOString(), launcherVersion: app.getVersion(),
      system: { platform: process.platform, architecture: process.arch, memoryMb: totalMemoryMb },
      minecraft: { version: config.game.version, fabricLoader: config.game.fabricLoader },
      setup: { checks: setup.checks, storage: setup.groups, freeBytes: setup.freeBytes },
      logExcerpt: await require('./lib/support-log').read(activeInstanceDir(), game.linesInstanceId===instance.id?game.lines:[]),
      mods, health: await inspectHealth(), launchFindings: (await launchFindings()).findings,
      privacy: 'Account records are excluded. Optional bounded log excerpts exclude recognized chat/session lines; recognized credentials, emails, addresses and local paths are scrubbed. Mod filenames, metadata and diagnostic messages are included; review selected content before sharing.'
    };
    const token=crypto.randomUUID();supportReview={token,at:Date.now(),instanceId:instance.id,report:scrub(report)};
    return {token,report:supportReview.report};
  });
  handle('sloth:support-export',async request=>{
    if(!supportReview||request?.token!==supportReview.token||Date.now()-supportReview.at>300000||supportReview.instanceId!==instances.get().id)throw Error('Preview the support report again.');
    if(!Array.isArray(request.sections))throw Error('Choose report sections.');const allowed=['system','minecraft','setup','mods','health','launchFindings','logExcerpt'],selected=new Set(request.sections);
    if(!selected.size||[...selected].some(k=>!allowed.includes(k)))throw Error('Choose valid report sections.');
    const report={schema:1,generatedAt:supportReview.report.generatedAt,launcherVersion:app.getVersion(),privacy:supportReview.report.privacy};for(const k of selected)report[k]=supportReview.report[k];
    const result=await dialog.showSaveDialog(win,{title:'Save reviewed Sloth support report',defaultPath:'Sloth-support.json',filters:[{name:'Support report',extensions:['json']}]});
    if(result.canceled||!result.filePath)return false;await fs.promises.writeFile(result.filePath,JSON.stringify(report,null,2),{mode:0o600});supportReview=null;return true;
  });
  handle('sloth:mods-import', async () => {
    const result = await dialog.showOpenDialog(win, { title: 'Add Fabric mods to this instance', properties: ['openFile', 'multiSelections', 'dontAddToRecent'], filters: [{ name: 'Fabric mod archives', extensions: ['jar'] }] });
    if (result.canceled) return null;
    return modManager.importFiles(activeInstanceDir(), result.filePaths);
  });
  handle('sloth:workshop-inspect', () => workshop.inspect(gameRoot, instances.get(), settings.get(), totalMemoryMb));
  let presetReview=null;
  DATA_CHANNELS.add('sloth:workshop-undo');
  handle('sloth:workshop-preview', async id => {
    if(instances.get().pack)throw new Error('Managed presets apply to Sloth instances only.');
    const before=settings.get(),patch=workshop.preset(id,totalMemoryMb,maxMemoryMb),video=performance.PROFILES[id];if(!video)throw new Error('Unknown preset.');
    const changes=[];for(const [slug,value] of Object.entries(patch.mods))if(before.mods[slug]!==value)changes.push({id:'mod:'+slug,label:slug,before:before.mods[slug],after:value});
    if(before.memoryMb!==patch.memoryMb)changes.push({id:'memory',label:'Memory allocation (MB)',before:before.memoryMb,after:patch.memoryMb});
    const tools=require('./lib/file-tools'),file=path.join(activeInstanceDir(),'options.txt');await tools.guard(activeInstanceDir(),file,true);const text=await fs.promises.readFile(file,'utf8').catch(e=>{if(e.code==='ENOENT')return '';throw e;});
    for(const [key,value] of Object.entries(video)){const old=text.split(/\r?\n/).find(l=>l.startsWith(key+':'))?.slice(key.length+1);if(old!==value)changes.push({id:'video:'+key,label:performance.LABELS[key]||key,before:performance.display(key,old),after:performance.display(key,value)});}
    presetReview={token:crypto.randomUUID(),id,instanceId:instances.get().id,created:Date.now(),before,patch,changes,optionsHash:crypto.createHash('sha256').update(text).digest('hex')};return {token:presetReview.token,changes};
  });
  handle('sloth:workshop-preset', async request => {
    const plan=presetReview;if(!plan||request?.token!==plan.token||plan.instanceId!==instances.get().id||Date.now()-plan.created>600000)throw new Error('Review this preset again.');
    if(JSON.stringify(settings.get())!==JSON.stringify(plan.before))throw new Error('Settings changed. Review this preset again.');
    if(!Array.isArray(request.ids)||request.ids.length>4096)throw new Error('Select reviewed preset changes.');
    const selected=new Set(request.ids);if(!selected.size||[...selected].some(id=>!plan.changes.some(c=>c.id===id)))throw new Error('Select valid reviewed changes.');
    const optionsFile=path.join(activeInstanceDir(),'options.txt');const text=await fs.promises.readFile(optionsFile,'utf8').catch(e=>{if(e.code==='ENOENT')return '';throw e;});if(crypto.createHash('sha256').update(text).digest('hex')!==plan.optionsHash)throw new Error('Minecraft options changed. Review again.');
    const id=plan.id,patch={mods:{}};for(const key of selected){if(key.startsWith('mod:'))patch.mods[key.slice(4)]=plan.patch.mods[key.slice(4)];if(key==='memory')patch.memoryMb=plan.patch.memoryMb;}
    const backup=path.join(activeInstanceDir(),'settings-preset-before.json');await require('./lib/file-tools').guard(activeInstanceDir(),backup,true);await fs.promises.writeFile(backup,JSON.stringify({version:2,before:{mods:Object.fromEntries(Object.keys(patch.mods).map(k=>[k,plan.before.mods[k]])),...(selected.has('memory')?{memoryMb:plan.before.memoryMb}:{})},after:patch}));
    await performance.apply(activeInstanceDir(),id,[...selected].filter(k=>k.startsWith('video:')).map(k=>k.slice(6)));
    const saved=settings.update(patch);instances.setMods(instances.value.activeId,saved.mods);instances.setLaunch(instances.value.activeId,saved);presetReview=null;return saved;
  });
  handle('sloth:workshop-undo', async () => {
    const file=path.join(activeInstanceDir(),'settings-preset-before.json');await require('./lib/file-tools').guard(activeInstanceDir(),file);
    if((await fs.promises.stat(file)).size>1048576)throw new Error('Preset backup exceeds the size limit.');
    const backup=JSON.parse(await fs.promises.readFile(file,'utf8'));
    if(backup.version!==2||!backup.before||!backup.after)throw new Error('This older preset cannot be safely undone. Apply a reviewed preset first.');
    const current=settings.get();
    for(const [slug,value] of Object.entries(backup.after.mods||{}))if(current.mods[slug]!==value)throw new Error('A preset mod changed afterward. Undo cancelled to preserve your newer settings.');
    if(Object.hasOwn(backup.after,'memoryMb')&&current.memoryMb!==backup.after.memoryMb)throw new Error('Memory allocation changed afterward. Undo cancelled to preserve it.');
    const options=await performance.prepareRestore(activeInstanceDir());
    await performance.restore(activeInstanceDir(),options);
    const patch={mods:backup.before.mods||{}};if(Object.hasOwn(backup.before,'memoryMb'))patch.memoryMb=backup.before.memoryMb;
    const saved=settings.update(patch);instances.setMods(instances.value.activeId,saved.mods);instances.setLaunch(instances.value.activeId,saved);await fs.promises.unlink(file);return saved;
  });
  handle('sloth:instances-edit', ({ id, name, favorite, notes, tags } = {}) => {
    instances.edit(id, { name, favorite, notes, tags });
    return instances.list();
  });
  handle('sloth:instances-testing', async () => {
    const item = await instances.create(`${instances.get().name.slice(0, 24)} testing`, { duplicate: true, testing: true });
    activateLaunch(item);
    return { instances: instances.list(), activeInstanceId: item.id, settings: settings.get() };
  });
  handle('sloth:recovery-list', () => recovery.list());
  handle('sloth:recovery-create', label => recovery.create(activeInstanceDir(), instances.get(), label, progress => send('sloth:recovery-progress', progress)));
  handle('sloth:recovery-restore', async id => {
    const item = await recovery.restore(id, instances, progress => send('sloth:recovery-progress', progress));
    activateLaunch(item);
    return { instances: instances.list(), activeInstanceId: item.id, settings: settings.get() };
  });
  handle('sloth:diagnose', launchFindings);
  handle('sloth:recovery-folder', async () => {
    await recovery.init();
    const failure = await shell.openPath(recovery.root);
    if (failure) throw new Error(failure);
  });
  const saveSettings = patch => {
    const saved = settings.update(patch);
    if (patch?.mods) instances.setMods(instances.value.activeId, saved.mods);
    instances.setLaunch(instances.value.activeId, saved);
    return saved;
  };
  handle('sloth:save-settings', saveSettings);
  handle('sloth:instances-create', async ({ name, duplicate } = {}) => {
    if (game.child || game.busy) throw new Error('Close Minecraft before creating an instance.');
    const item = await instances.create(name, { duplicate: duplicate === true });
    activateLaunch(item);
    return { instances: instances.list(), activeInstanceId: item.id, settings: settings.get() };
  });
  handle('sloth:instances-select', id => {
    if (game.child || game.busy) throw new Error('Close Minecraft before switching instances.');
    const item = instances.setActive(String(id));
    activateLaunch(item);
    return { instances: instances.list(), activeInstanceId: item.id, settings: settings.get() };
  });
  // The renderer can't name an executable; a custom Java is only ever picked in the native file dialog.
  handle('sloth:choose-java', async () => {
    const result = await dialog.showOpenDialog(win, {
      title: 'Choose javaw.exe (Java 21 or newer)',
      properties: ['openFile', 'dontAddToRecent'],
      filters: process.platform === 'win32' ? [{ name: 'Java', extensions: ['exe'] }] : []
    });
    if (result.canceled || !result.filePaths[0]) return settings.get();
    const picked = result.filePaths[0];
    if (!/^javaw?(\.exe)?$/i.test(path.basename(picked))) throw new Error('Pick java.exe or javaw.exe from a Java 21+ installation.');
    await require('./lib/file-tools').plain(picked);
    const version = await health.javaVersion(picked);
    if (version < 21) throw new Error(`Java ${version} cannot run this Minecraft version. Choose Java 21 or newer, or use the bundled runtime.`);
    log(`Custom Java selected: ${picked}`);
    return settings.setJavaPath(picked);
  });
  handle('sloth:sign-in', async () => {
    if (signIn.controller) throw new Error('A sign-in is already in progress.');
    const { authMode, authClientId } = settings.get();
    signIn.controller = new AbortController();
    try {
      await sessions.signIn({ mode: authMode, clientId: authClientId }, {
        signal: signIn.controller.signal,
        onPrompt: prompt => {
          signIn.pageUrl = prompt.verificationUri || null;
          send('sloth:signin-prompt', prompt);
        }
      });
      return accounts.list();
    } catch (err) {
      if (err.code !== 'cancelled') log(`Sign-in failed: ${err.message}`);
      throw err;
    } finally {
      signIn.controller = null;
      signIn.pageUrl = null;
      send('sloth:signin-prompt', null);
    }
  });
  handle('sloth:cancel-sign-in', () => { signIn.controller?.abort(); return true; });
  // Re-open Microsoft's device-login page; the URL comes from Microsoft via the main process, never the UI.
  handle('sloth:open-sign-in-page', async () => { if (signIn.pageUrl) await shell.openExternal(signIn.pageUrl); return true; });
  handle('sloth:user-mods', () => userMods());
  handle('sloth:sign-out', uuid => { accounts.remove(String(uuid)); return accounts.list(); });
  handle('sloth:switch-account', uuid => { accounts.setActive(String(uuid)); return accounts.list(); });
  handle('sloth:play', opts => play({ repair: Boolean(opts?.repair) }));
  handle('sloth:cancel', () => { game.controller?.abort(new Error('Cancelled')); return true; });
  handle('sloth:stop-game', () => {
    if (!game.child) return false;
    game.stopping = true;
    game.child.kill();
    return true;
  });
  handle('sloth:game-log', () => game.lines.slice(-1500));
  handle('sloth:open-folder', async which => {
    if (typeof which !== 'string' || !Object.hasOwn(FOLDERS, which)) throw new Error('Unknown folder');
    const dir = path.join(activeInstanceDir(), FOLDERS[which]);
    fs.mkdirSync(dir, { recursive: true });
    const failure = await shell.openPath(dir);
    if (failure) throw new Error(failure);
    return true;
  });
  // ---------- Browse Mods (Modrinth) ----------
  const instanceDir = () => activeInstanceDir();
  const catalogSlugs = new Set(lock.mods.map(m => m.slug));
  const enableCatalog = slugs => {
    const valid = slugs.filter(slug => settings.get().mods[slug] !== undefined);
    if (valid.length) saveSettings({ mods: Object.fromEntries(valid.map(slug => [slug, true])) });
    return settings.get();
  };
  handle('sloth:browse-search', opts => library.search(opts || {}, config.game.version));
  handle('sloth:browse-categories', type => library.categories(String(type)));
  handle('sloth:browse-install', async project => {
    const result = await library.install(project || {}, { instanceDir: instanceDir(), gameVersion: config.game.version, catalogSlugs:instances.get().pack?new Set():catalogSlugs });
    log(`Installed from Modrinth: ${result.installed.join(', ') || '-'}`);
    return { ...result, settings: enableCatalog(result.enableCatalog) };
  });
  const packReviews=new Map();let installingPack=false;
  async function rememberPack(source){for(const [token,r]of packReviews){if(r.expires<Date.now()){await modrinthPacks.cleanup(r.stage,gameRoot);packReviews.delete(token);}}if(packReviews.size>=5){await modrinthPacks.cleanup(source.stage,gameRoot);throw Error('Close an existing pack review before opening another.');}const token=crypto.randomUUID();packReviews.set(token,{...source,expires:Date.now()+30*60*1000});return {token,...modrinthPacks.preview(source.pack)};}
  handle('sloth:modpack-review', async id=>rememberPack(await modrinthPacks.fetchPack(id,gameRoot)));
  handle('sloth:modpack-local', async()=>{
    const selected=await dialog.showOpenDialog(win,{title:'Import Modrinth modpack',properties:['openFile','dontAddToRecent'],filters:[{name:'Modrinth pack',extensions:['mrpack']}]});if(selected.canceled)return null;
    const file=selected.filePaths[0];const stat=await require('./lib/file-tools').plain(file);if(!stat.isFile()||stat.size>512*1024**2)throw Error('Pack archive exceeds the file limit.');
    const stage=await modrinthPacks.createStage(gameRoot),copy=path.join(stage,'pack.mrpack');try{await fs.promises.copyFile(file,copy);return await rememberPack({stage,file:copy,sha512:await require('./lib/http').hashFile(copy,'sha512'),pack:await modrinthPacks.inspect(copy)});}catch(e){await modrinthPacks.cleanup(stage,gameRoot);throw e;}
  });
  handle('sloth:modpack-discard',async token=>{const review=packReviews.get(token);if(!review)return true;if(review.controller){review.controller.abort(new Error('Modpack installation cancelled.'));return true;}await modrinthPacks.cleanup(review.stage,gameRoot);packReviews.delete(token);return true;});
  handle('sloth:modpack-install',async ({token,includeOptional=true}={})=>{
    if(installingPack||game.child||game.busy)throw Error('Finish the current installation or close Minecraft first.');const source=packReviews.get(token);if(!source||source.expires<Date.now())throw Error('Pack review expired. Review the pack again.');
    installingPack=true;source.controller=new AbortController();
    try{const prepared=await modrinthPacks.prepare(source,{includeOptional:includeOptional===true,signal:source.controller.signal,progress:progress=>send('sloth:modpack-progress',progress)});source.controller.signal.throwIfAborted();const item=await instances.create(prepared.name,{sourceDir:prepared.data,pack:prepared.profile});activateLaunch(item);return {instances:instances.list(),activeInstanceId:item.id,settings:settings.get()};}
    finally{installingPack=false;packReviews.delete(token);await modrinthPacks.cleanup(source.stage,gameRoot);}
  });
  handle('sloth:browse-installed', () => library.installed(instanceDir()));
  handle('sloth:browse-remove', id => library.remove(String(id), instanceDir()));
  handle('sloth:open-project', ({ slug, type } = {}) => {
    const kind = { mod: 'mod', resourcepack: 'resourcepack', shader: 'shader', modpack: 'modpack', datapack: 'datapack' }[type];
    if (!kind || !library.SLUG.test(String(slug))) throw new Error('Invalid project');
    return shell.openExternal(`https://modrinth.com/${kind}/${slug}`);
  });

  // ---------- Import from another launcher ----------
  // The renderer only ever sees tokens; real paths stay in the main process.
  const importSources = new Map();
  const remember = source => { const token = crypto.randomUUID(); importSources.set(token, source); return token; };
  handle('sloth:import-sources', () => importer.detectSources().map(s => ({ token: remember({ path: s.path }), name: s.name, kind: s.kind })));
  handle('sloth:import-pick', async kind => {
    const zip = kind === 'zip';
    const result = await dialog.showOpenDialog(win, zip
      ? { title: 'Choose a zipped game folder', properties: ['openFile'], filters: [{ name: 'Zip', extensions: ['zip'] }] }
      : { title: 'Choose a Minecraft game folder (the one with mods, saves, screenshots...)', properties: ['openDirectory'] });
    if (result.canceled || !result.filePaths[0]) return null;
    return { token: remember({ path: result.filePaths[0], zip }), name: path.basename(result.filePaths[0]) };
  });
  // A zip is unpacked into temp on first use (and again after an import), and the copy is removed when done or on quit.
  const sourceOf = async token => {
    const source = importSources.get(String(token));
    if (!source) throw new Error('Pick a source first');
    if (source.zip && !source.extracted) source.extracted = await importer.extractZip(source.path, app.getPath('temp'));
    return source;
  };
  app.on('will-quit', () => { for (const source of importSources.values()) if (source.extracted) fs.rmSync(source.extracted, { recursive: true, force: true }); });
  handle('sloth:import-scan', async token => {
    const source = await sourceOf(token);
    return importer.scan(source.extracted || source.path, { gameRoot, gameVersion: config.game.version });
  });
  handle('sloth:import-run', async ({ token, choices } = {}) => {
    const source = await sourceOf(token);
    const dir = source.extracted || source.path;
    // Only worlds a fresh scan finds and judges loadable on this game version can be imported.
    const scan = await importer.scan(dir, { gameRoot, gameVersion: config.game.version });
    const loadable = new Set(scan.worlds.filter(w => w.compatible).map(w => w.folder));
    const clean = {
      screenshots: Boolean(choices?.screenshots), resourcepacks: Boolean(choices?.resourcepacks), shaderpacks: Boolean(choices?.shaderpacks),
      mods: Boolean(choices?.mods), worlds: Array.isArray(choices?.worlds) ? choices.worlds.filter(w => loadable.has(w)) : []
    };
    try {
      const report = await importer.importFrom(dir, clean, { instanceDir: instanceDir(), gameVersion: config.game.version, onProgress: msg => send('sloth:import-progress', msg) });
      log(`Imported ${report.screenshots} screenshots, ${report.mods.length} mods, ${report.worlds.length} worlds`);
      return { ...report, settings: enableCatalog(report.enableCatalog) };
    } finally {
      if (source.extracted) { await fs.promises.rm(source.extracted, { recursive: true, force: true }).catch(() => {}); delete source.extracted; }
    }
  });

  // ---------- Screenshots ----------
  handle('sloth:screenshots', async request => {
    const root=instanceDir(), input=request&&typeof request==='object'?request:{};
    const album=typeof input.album==='string'?input.album.slice(0,40):'';
    const index=album?await captureStudio.albums(root):{};
    const allowed=album?new Set(Object.keys(index).filter(name=>index[name]===album)):null;
    return library.screenshotPage(root,nativeImage,{...input,albumNames:allowed?[...allowed]:null});
  });
  handle('sloth:screenshot-export', async name => {
    const file = library.screenshotPath(instanceDir(), name);
    const result = await dialog.showSaveDialog(win, { title: 'Export screenshot', defaultPath: name, filters: [{ name: 'Screenshot', extensions: [path.extname(name).slice(1)] }] });
    if (result.canceled || !result.filePath) return false;
    if (path.resolve(file).toLowerCase() === path.resolve(result.filePath).toLowerCase()) throw new Error('Choose a different location for the exported copy.');
    await fs.promises.copyFile(file, result.filePath); return true;
  });
  handle('sloth:screenshot-open', async name => { const failure = await shell.openPath(library.screenshotPath(instanceDir(), name)); if (failure) throw new Error(failure); return true; });
  handle('sloth:screenshot-delete', async name => { await shell.trashItem(library.screenshotPath(instanceDir(), name)); return true; });

  handle('sloth:check-update', () => updater.check());
  handle('sloth:install-update', () => updater.install());
}

// ---------- window ----------
let splashWindow=null,splashStarted=0,splashClosing=false,splashFallback;
function closeSplash() {
  clearTimeout(splashFallback);
  if(splashWindow&&!splashWindow.isDestroyed()){splashClosing=true;splashWindow.close();}
  splashWindow=null;
}
function revealLauncher() {
  const delay=splashWindow?Math.max(0,6000-(Date.now()-splashStarted)):0;
  if(delay){setTimeout(revealLauncher,delay);return;}
  if(win&&!win.isDestroyed())win.show();
  closeSplash();
}
function createSplash(preferences) {
  splashStarted=Date.now();splashClosing=false;
  splashWindow=new BrowserWindow({width:420,height:350,resizable:false,frame:false,show:false,backgroundColor:'#101014',title:'Starting Sloth Client',autoHideMenuBar:true,icon:path.join(__dirname,'assets','icon.png'),webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true,devTools:false}});
  const splash=splashWindow;
  splash.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  splash.webContents.on('will-navigate',e=>e.preventDefault());
  splash.once('ready-to-show',()=>{if(preferences?.accessibility?.reduceMotion)splash.webContents.insertCSS('.loading i{animation:none!important;width:100%;opacity:.6}');splashStarted=Date.now();splash.show();});
  splash.on('closed',()=>{if(!splashClosing){splashWindow=null;app.quit();}});
  splash.webContents.once('did-fail-load',()=>closeSplash());
  splash.loadFile(path.join(__dirname,'splash.html'));
}

function createWindow() {
  const windowFile=path.join(app.getPath('userData'),'launcher-window.json');
  const restored=windowState.load(windowFile,[screen.getPrimaryDisplay(),...screen.getAllDisplays().filter(d=>d.id!==screen.getPrimaryDisplay().id)]);
  win = new BrowserWindow({
    ...restored,
    backgroundColor: '#12060f', title: 'Sloth Client', show: false,
    // No title-bar box: the app fills the window and Windows 11 rounds its corners. Native minimize/maximize/close stay as an overlay.
    titleBarStyle: 'hidden', titleBarOverlay: { color: '#12060f', symbolColor: '#ffb3d9', height: 44 },
    icon: path.join(__dirname, 'assets', 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: false,
      navigateOnDragDrop: false,
      // No DevTools in release builds: nothing to paste "free rank" scripts into.
      devTools: !app.isPackaged
    }
  });
  win.setBounds({x:restored.x,y:restored.y,width:restored.width,height:restored.height});
  windowState.attach(win,windowFile);
  if(restored.maximized)win.maximize();
  win.once('ready-to-show', () => { if(!splashWindow)win.show();else{splashFallback=setTimeout(revealLauncher,8000);splashFallback.unref();} });
  win.webContents.on('render-process-gone',()=>{launcherReady=false;try{launcherHealth.fail();}catch{}offerLauncherRecovery('The launcher interface stopped unexpectedly.');});
  win.webContents.on('did-fail-load',(event,code,description,url,isMainFrame)=>{if(isMainFrame){try{launcherHealth.fail();}catch{}offerLauncherRecovery('The launcher interface could not load.');}});
  startupWatchdog=setTimeout(()=>{if(!launcherReady){try{launcherHealth.fail();}catch{}offerLauncherRecovery('The launcher interface has not finished starting.');}},90000);startupWatchdog.unref();
  if(previousStartup&&previousStartup.state!=='ready')setTimeout(()=>offerLauncherRecovery('The previous startup did not finish its interface check.'),2000).unref();
  win.webContents.on('will-navigate', event => event.preventDefault());
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.loadFile(path.join(__dirname, 'index.html'));
  // Developer-only UI screenshots (npm run snapshot); never active in packaged builds.
  if (!app.isPackaged && process.env.SLOTH_SNAPSHOT_DIR) require('../scripts/snapshot').attach(win, process.env.SLOTH_SNAPSHOT_DIR);
}

app.on('second-instance', () => {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.focus();
});

app.whenReady().then(async () => {
  try{previousStartup=launcherHealth.begin(app.getVersion());}catch(e){log('Startup check unavailable: '+e.message);}
  // The UI only ever needs to write to the clipboard (Copy log); every other permission is refused,
  // and nothing may be downloaded through Chromium (game files go through the verified installer).
  const allowed = new Set(['clipboard-sanitized-write']);
  session.defaultSession.setPermissionRequestHandler((wc, permission, callback) => callback(wc === win?.webContents && allowed.has(permission)));
  session.defaultSession.setPermissionCheckHandler((wc, permission) => wc === win?.webContents && allowed.has(permission));
  session.defaultSession.on('will-download', event => event.preventDefault());

  const userData = app.getPath('userData');
  friends = new Friends(userData);
  localSealKey=sealKeyProvider(path.join(userData,'session-seal-key.bin'),safeStorage);
  const logDir = path.join(userData, 'logs');
  const logFile = path.join(logDir, 'launcher.log');
  fs.mkdirSync(logDir, { recursive: true });
  try { if (fs.statSync(logFile).size > 2 * 1024 * 1024) fs.renameSync(logFile, `${logFile}.old`); } catch { /* no log yet */ }
  launcherLog = fs.createWriteStream(logFile, { flags: 'a' });
  log(`Sloth Client ${app.getVersion()} starting (Electron ${process.versions.electron}, ${os.platform()} ${os.release()})`);
  setUserAgent(`SlothClient/${app.getVersion()} (unofficial community launcher)`);

  settings = new Settings(path.join(userData, 'sloth-launcher-settings.json'), { maxMemoryMb });
  createSplash(settings.get());
  preferenceSync = new PreferenceSync(path.join(userData, 'preference-sync.json'));
  await preferenceSync.init().catch(() => log('Could not load optional preference sync folder.'));
  activeUpdateChannel = settings.get().updateChannel;
  try { launchHistory.reconcile(); } catch (err) { log(`Could not recover launch history: ${err.message}`); }
  instances = new InstanceManager(gameRoot, settings.get().mods, config.game.version);
  for (const item of instances.value.instances) if (!item.launch) item.launch = cleanLaunch(settings.get());
  instances.save();
  activateLaunch(instances.get());
  await friends.publish(activeInstanceDir()).catch(() => log('Friends list could not be synchronized; open Friends to review it.'));
  instances.setMods(instances.value.activeId, settings.get().mods);
  try { require('./lib/independent-migration').migrateIndependent(gameRoot); } catch (error) { log(`Independent server-list cleanup deferred: ${error.message}`); }
  let importedLunarSettings = null;
  try { importedLunarSettings = require('./lib/pending-settings-import').runPendingSettingsImport(gameRoot, app.getVersion()); }
  catch (error) { log(`Queued Lunar settings import postponed: ${error.message}`); }
  try { const controls = require('./lib/pending-controls').applyPendingControls(gameRoot); if (controls) log(controls.applied ? 'Requested Freelook controls applied with backups.' : 'Requested Freelook controls deferred until Minecraft closes.'); } catch (error) { log(`Requested controls postponed: ${error.message}`); }
  accounts = new AccountStore(path.join(userData, 'accounts.json'), safeStorage);
  try { const performance=await require('./lib/pending-performance').applyPendingPerformance(gameRoot,app.getVersion(),bundledMods());if(performance)log(performance.applied?'Requested FPS limit and managed-mod cleanup applied with backups.':'Requested performance changes deferred until Minecraft closes.'); }catch(error){log(`Requested performance changes postponed: ${error.message}`);}
  const snapshotMode = !app.isPackaged && Boolean(process.env.SLOTH_SNAPSHOT_DIR);
  sessions = new SessionManager(accounts, { openExternal: url => (snapshotMode ? Promise.resolve() : shell.openExternal(url)), log });
  require('./lib/development-update').pruneDevelopmentUpdates(app.getPath('userData')).catch(() => {});
  updater = createUpdater({
    openManual: url => shell.openExternal(url),
    confirmDevelopmentInstall: async version => {
      if (game.child || game.busy) throw new Error('Close Minecraft and wait for current downloads before updating.');
      const choice = await dialog.showMessageBox({ type: 'warning', title: 'Update Sloth Client', message: `Install Sloth Client ${version} and restart?`, detail: 'This download passed Sloth release signature verification. Windows trusted publisher signing is still pending for this development release. Sloth will preserve the current launcher, install the update, and restart.', buttons: ['Cancel', 'Install and restart'], defaultId: 0, cancelId: 0, noLink: true });
      return choice.response === 1;
    },
    launchDevelopmentInstaller: file => new Promise((resolve, reject) => {
      if (game.child || game.busy) return reject(new Error('Close Minecraft before updating.'));
      const installer = spawn(file, ['--updated', '/S', '--force-run', '/D=' + path.dirname(process.execPath)], { detached: true, stdio: 'ignore', windowsHide: true });
      installer.once('error', reject);
      installer.once('spawn', () => { installer.unref(); resolve(); app.quit(); });
    }),
    channel: activeUpdateChannel, send: payload => { downloads.recordUpdate(payload);game.lastUpdate = payload; send('sloth:update', payload); }, log,
    beforeInstall: async () => {
      if(!launcherReady||launcherHealth.read()?.state!=='ready')throw Error('Let the launcher finish its startup check before updating. The previous recovery copy is preserved.');
      await launcherRecovery.capture(process.execPath, app.getVersion());
    },
    recoveryMode: process.argv.includes('--sloth-recovery') || path.resolve(process.execPath).startsWith(launcherRecovery.root + path.sep)
  });

  registerIpc();
  createWindow();
  if (importedLunarSettings) dialog.showMessageBox({type:'info',title:'Lunar settings import',message:importedLunarSettings.deferred ? 'Your Lunar import is waiting for Minecraft to close.' : 'Your compatible Lunar settings were imported.',detail:importedLunarSettings.deferred ? 'Close Minecraft and reopen Sloth to finish the queued import.' : `Your previous settings were backed up. Custom crosshair designs, HUD anchoring and unmatched module options require manual setup.\nBackup and import report: ${importedLunarSettings.backup}`,buttons:['OK']}).catch(() => {});
  setTimeout(() => runAutomaticBackup(), 30000).unref();
  setInterval(() => runAutomaticBackup(), 15 * 60 * 1000).unref();
  setTimeout(() => updater.check(), 4000);
  setInterval(() => updater.check(), 4 * 60 * 60 * 1000).unref();
}).catch(async error => {
  closeSplash();
  try{launcherHealth.fail();}catch{}
  await offerLauncherRecovery('Sloth could not complete startup.');
  log(`Launcher startup failed: ${error.message}`);
  launcherRecovery.status().then(async saved => {
    const tip = saved.available ? `\n\nYour previous launcher is saved here:\n${path.join(launcherRecovery.root, saved.id, 'app', saved.executable)}\nOpen it manually to recover.` : '';
    dialog.showErrorBox('Sloth Client could not start', error.message + tip); app.quit();
  }).catch(() => { dialog.showErrorBox('Sloth Client could not start', error.message); app.quit(); });
});

app.on('window-all-closed', () => app.quit());
