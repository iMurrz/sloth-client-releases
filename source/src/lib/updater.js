const fs = require('node:fs');
const path = require('node:path');
const { app } = require('electron');
const config = require('./config');
const { request } = require('./http');
const { verifyFile } = require('./update-signature');

const PUBLIC_KEY = fs.readFileSync(path.join(__dirname, 'update-public-key.pem'), 'utf8');
const SAFE_FILE = /^[A-Za-z0-9._-]+\.exe$/;
const SAFE_VERSION = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;
async function readLimitedText(response, maxBytes) {
  const chunks = []; let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > maxBytes) { await response.body.cancel().catch(() => {}); throw new Error('Signature file exceeds its size limit.'); }
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf8');
}

/**
 * Launcher self-updates from GitHub Releases. electron-updater checks the SHA-512 from latest.yml while
 * downloading; before installing, this also requires an Ed25519 signature (made with the release key that
 * never leaves the developer's PC) over the exact version and file. Unsigned or tampered updates are
 * discarded. A running game is never interrupted because the game process is detached from the launcher.
 */
function createUpdater({ send, log, beforeInstall = async () => {}, openManual = async () => { throw new Error('Manual download opener is unavailable.'); }, confirmDevelopmentInstall = async () => false, launchDevelopmentInstaller = async () => { throw new Error('Installer handoff is unavailable.'); }, recoveryMode = false, channel = 'stable' }) {
  const { owner, repo } = config.updates;
  if (recoveryMode) return { check: async () => send({ state: 'recovery' }), install: () => { throw new Error('Updates are paused in the recovered launcher. Open the normally installed launcher to update.'); } };
  if (!app.isPackaged) return { check: async () => send({ state: 'dev' }), install: () => {} };
  if (!owner || owner.startsWith('REPLACE_')) return { check: async () => send({ state: 'unconfigured' }), install: () => {} };

  const { autoUpdater } = require('electron-updater');
  autoUpdater.autoDownload = true;
  // Installation is explicit so preserving the current launcher cannot be bypassed on quit.
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.allowDowngrade = false;
  autoUpdater.channel = channel === 'preview' ? 'beta' : 'latest';
  autoUpdater.allowPrerelease = channel === 'preview';
  autoUpdater.allowDowngrade = false; // Setting channel enables downgrades in electron-updater; explicitly keep them off.
  autoUpdater.disableWebInstaller = true;
  autoUpdater.logger = { info: log, warn: log, error: log, debug: () => {} };

  const verifyWindowsSignature = autoUpdater.verifyUpdateCodeSignature.bind(autoUpdater);
  let verifiedDownload = null;
  let pending = null, checking = null, downloading = false;
  let ready = false;
  let manualRelease = null;
  let developmentPrepared = null,developmentController=null;
  const developmentMode = require('../../package.json').slothDevelopmentUpdates === true;
  const { prepareDevelopmentUpdate, verifyPreparedUpdate } = require('./development-update');
  const showDevelopmentReady = () => send({ state: 'development-ready', version: developmentPrepared.manifest.version, notes: releaseNotes });
  let releaseNotes = '', releaseVersion = '';
  const notes = info => {
    const raw = Array.isArray(info.releaseNotes) ? info.releaseNotes.map(x => x.note || '').join('\n') : String(info.releaseNotes || '');
    return raw.replace(/<[^>]*>/g, '').slice(0, 12000);
  };
  autoUpdater.verifyUpdateCodeSignature = async (publisherNames, file) => {
    try {
      if (!Array.isArray(publisherNames) || !publisherNames.length) return 'Windows publisher identity is missing';
      const windowsError = await verifyWindowsSignature(publisherNames, file);
      if (windowsError) return windowsError;
      if (!pending || !SAFE_VERSION.test(pending.version) || !SAFE_FILE.test(pending.fileName || '')) return 'update metadata is not valid';
      const url = `https://github.com/${owner}/${repo}/releases/download/v${pending.version}/${pending.fileName}.sig`;
      const signature = await readLimitedText(await request(url, { timeout: 15000 }), 1024);
      if (await verifyFile(PUBLIC_KEY, file, pending.version, pending.fileName, signature)) {
        verifiedDownload = { file, version: pending.version, fileName: pending.fileName, signature };
        log(`Update ${pending.version} signature verified`);
        return null;
      }
      return 'the release signature does not match';
    } catch (err) {
      return `the release signature could not be checked (${err.message})`;
    }
  };

  autoUpdater.on('checking-for-update', () => send({ state: 'checking' }));
  autoUpdater.on('update-available', info => {
    ready = false; verifiedDownload = null;
    downloading = true;
    releaseNotes = notes(info); releaseVersion = info.version;
    pending = { version: info.version, fileName: info.path || info.files?.[0]?.url };
    send({ state: 'downloading', version: info.version, notes: releaseNotes, percent: 0 });
  });
  autoUpdater.on('update-not-available', () => send({ state: 'current' }));
  autoUpdater.on('download-progress', progress => send({ state: 'downloading', version: releaseVersion, notes: releaseNotes, percent: Math.round(progress.percent) }));
  autoUpdater.on('update-downloaded', async info => {
    ready = false;
    try {
      // electron-updater renames the temporary download, and can reuse a cached
      // download without invoking its download-time signature callback.
      const error = !info.downloadedFile ? 'Missing downloaded installer path' : await autoUpdater.verifySignature(info.downloadedFile);
      if (error) throw new Error(error);
      ready = true;
      send({ state: 'ready', version: info.version, notes: releaseNotes });
    } catch (error) {
      verifiedDownload = null;
      log(`Cached update rejected: ${error.message}`);
      send({ state: 'error', message: 'The downloaded update could not pass both signature checks.' });
    } finally { downloading = false; }
  });
  autoUpdater.on('error', err => {
    ready = false;
    verifiedDownload = null;
    downloading = false;
    log(`Update failed: ${err?.message || err}`);
    const rejected = err?.code === 'ERR_UPDATER_INVALID_SIGNATURE';
    send({ state: 'error', message: rejected ? 'An update was rejected because its signature is invalid.' : 'Could not check for launcher updates.' });
  });

  return {
    cancel:()=>{if(!developmentController)throw Error('No cancellable launcher download is active.');developmentController.abort();},
    check: () => {
      if (developmentPrepared) { showDevelopmentReady(); return Promise.resolve(); }
      if (ready || downloading) return Promise.resolve();
      if (!checking) checking = (async () => {
        send({ state: 'checking' });
        manualRelease = null;
        {
          const release = await require('./release-discovery').discoverRelease(app.getVersion());
          if (!release.newer) { send({ state: 'current' }); return; }
          if (developmentMode && release.hasDevelopmentUpdate) {
            downloading = true; releaseNotes = release.notes;developmentController=new AbortController();
            try {
              send({ state: 'downloading', version: release.version, notes: releaseNotes, percent: 0, cancelable:true });
              developmentPrepared = await prepareDevelopmentUpdate(release, app.getPath('userData'), percent => send({ state: 'downloading', version: release.version, notes: releaseNotes, percent, cancelable:true }),developmentController.signal);
              await verifyPreparedUpdate(developmentPrepared);
              showDevelopmentReady();
            } catch (error) { developmentPrepared = null;if(developmentController.signal.aborted){send({state:'cancelled',version:release.version,message:'Update download cancelled. Check again to retry.'});return;}throw error; }
            finally { downloading = false;developmentController=null; }
            return;
          }
          if (!release.hasFeed) {
            manualRelease = release;
            send({ state: 'manual', version: release.version, notes: release.notes, message: release.newer ? `Sloth Client ${release.version} is available as a manual download. Windows publisher signing is pending. Close Minecraft and the client before installing.` : app.getVersion() === release.version ? `You have the latest Sloth release (${release.version}). This development release uses manual downloads while Windows publisher signing is pending.` : `Installed version: ${app.getVersion()}. Public Sloth release: ${release.version}. Install manually to move to the new numbering series.` });
            return;
          }
        }
        await autoUpdater.checkForUpdates();
      })().catch(error => { log(`Update check failed: ${error.message}`); send({ state: 'error', message: 'Could not reach the release service. Check your connection and try again.' }); }).finally(() => { checking = null; });
      return checking;
    },
    install: async () => {
      if (developmentPrepared) {
        try { await verifyPreparedUpdate(developmentPrepared); }
        catch (error) { developmentPrepared = null; send({ state: 'error', message: error.message }); throw error; }
        if (!await confirmDevelopmentInstall(developmentPrepared.manifest.version)) { showDevelopmentReady(); return; }
        await beforeInstall();
        try { await verifyPreparedUpdate(developmentPrepared); }
        catch (error) { developmentPrepared = null; send({ state: 'error', message: error.message }); throw error; }
        await launchDevelopmentInstaller(developmentPrepared.file);
        return;
      }
      if (manualRelease) { await openManual(manualRelease.url); return; }
      if (!ready) throw new Error('No verified update is ready to install.');
      await beforeInstall();
      // Recheck after the preservation step, immediately before handing off to NSIS.
      if (!verifiedDownload || !await verifyFile(PUBLIC_KEY, verifiedDownload.file, verifiedDownload.version, verifiedDownload.fileName, verifiedDownload.signature)) {
        ready = false;
        throw new Error('The downloaded installer changed. Download the update again.');
      }
      autoUpdater.quitAndInstall(false, true);
    }
  };
}

module.exports = { createUpdater };
