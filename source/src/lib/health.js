const fs = require('node:fs/promises');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const packs = require('./resource-packs');
const modManager = require('./mod-manager');
const lock = require('./game/game-lock.json');
const { gameEnvironment } = require('./game/environment');

async function javaVersion(file) {
  const executable = /javaw\.exe$/i.test(file) ? file.replace(/javaw\.exe$/i, 'java.exe') : file;
  const result = await promisify(execFile)(executable, ['-version'], { env: gameEnvironment(), timeout: 10000, windowsHide: true, maxBuffer: 65536 });
  const version = `${result.stdout}\n${result.stderr}`.match(/version\s+"(?:1\.)?(\d+)/)?.[1];
  if (!version) throw new Error('Cannot identify the selected Java version.');
  return Number(version);
}
async function inspect({ root, dir, instance, settings, totalMb, wrapper, bundled }) {
  const checks = []; const add = (level, title, detail, action) => checks.push({ level, title, detail, action });
  try {
    for (const p of [root, path.dirname(dir), dir, ...['mods', 'saves', 'config', 'shaderpacks', 'options.txt'].map(x => path.join(dir, x))]) {
      const s = await fs.lstat(p).catch(e => { if (e.code === 'ENOENT') return null; throw e; });
      if (s?.isSymbolicLink()) {
        add('error', 'Linked instance data', 'Move linked files or folders into this instance before preparing or repairing it.', 'workshop');
        return { checkedAt: new Date().toISOString(), checks, blocked: true, warnings: 0 };
      }
    }
    const disk = await fs.statfs(root);
    const free = disk.bavail * disk.bsize;
    add(free < 1024 ** 3 ? 'error' : free < 5 * 1024 ** 3 ? 'warn' : 'good', 'Free disk space', `${(free / 1024 ** 3).toFixed(1)} GB available. First-time downloads and large packs may require more.`, 'workshop');
  } catch (error) { add('error', 'Instance storage', error.message, 'workshop'); }
  add(settings.memoryMb > totalMb * .6 ? 'warn' : 'good', 'Memory', `${settings.memoryMb} MB allocated; ${totalMb} MB installed.`, 'settings');
  if (!instance.pack && !bundled.length) add('error', 'Sloth client missing', 'The bundled client is missing. Reinstall this launcher build.', 'updates');
  try { await fs.access(wrapper); } catch { add('error', 'Launch helper missing', 'Reinstall Sloth to restore the launch helper.', 'updates'); }
  let selectedJava=21;
  if (settings.javaPath) {
    try { const v = await javaVersion(settings.javaPath); selectedJava=v; add(v < 21 ? 'error' : 'good', 'Custom Java', `Java ${v} selected; Minecraft requires Java 21 or newer.`, 'settings'); }
    catch (e) { add('error', 'Custom Java', e.message, 'settings'); }
  } else {
    const runtime = lock.java.manifests[process.platform === 'win32' ? `windows-${process.arch}` : process.platform === 'darwin' ? (process.arch === 'arm64' ? 'mac-os-arm64' : 'mac-os') : 'linux'];
    add('info', 'Java runtime', `Pinned Mojang Java ${runtime?.version || 'runtime'} is hash-checked during game preparation. A pinned version does not guarantee that all later security fixes are included.`, 'settings');
  }
  const jar = path.join(root, 'versions', lock.gameVersion, `${lock.gameVersion}.jar`);
  try { await fs.access(jar); add('good', 'Minecraft files', 'Game archive is present. Preparation verifies managed executable hashes on every launch; Repair also hashes ordinary assets.', 'care'); }
  catch { add('info', 'Minecraft download needed', 'Managed files will be downloaded before launch.', 'care'); }
  try {
    const report = await modManager.inspect(dir, lock.gameVersion, lock.fabric.loaderVersion, { standalone: Boolean(instance.pack), javaVersion: String(selectedJava) });
    for (const m of report.mods.filter(m => m.enabled && m.issues.length)) add('warn', m.name, m.issues.join(' '), 'mods');
    const summary=modManager.compatibilitySummary(report);
    add(summary.level, 'Mod metadata', summary.detail, 'mods');
  } catch (e) { add('error', 'Mod inspection failed', e.message, 'mods'); }
  try {
    const report = await packs.inspect(dir);
    for (const p of report.packs.filter(p => p.selected && p.issues.length)) add(p.damaged || p.issues.some(x => x.includes('fail the entire')) ? 'error' : 'warn', p.name, p.issues.join(' '), 'care');
    for (const p of report.missing) add('warn', 'Selected pack missing', p.slice(5), 'care');
    if (!report.missing.length && !report.packs.some(p => p.selected && p.issues.length)) add('good', 'Selected resource packs', 'Selected pack metadata has no recognized compatibility problem.', 'care');
  } catch (e) { add('error', 'Resource-pack inspection failed', e.message, 'care'); }
  return { checkedAt: new Date().toISOString(), checks, blocked: checks.some(c => c.level === 'error'), warnings: checks.filter(c => c.level === 'warn').length };
}
module.exports = { inspect, javaVersion };
