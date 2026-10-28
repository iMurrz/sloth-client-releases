const fs = require('node:fs/promises');
const path = require('node:path');
const { catalog, defaultModSettings } = require('./game/mods');

const GROUPS = ['saves', 'mods', 'resourcepacks', 'shaderpacks', 'screenshots', 'config', 'defaultconfigs', 'kubejs', 'scripts'];
async function sizeOf(file) {
  let stat;
  try { stat = await fs.lstat(file); } catch (error) { if (error.code === 'ENOENT') return { bytes: 0, files: 0, skipped: 0 }; throw error; }
  if (stat.isSymbolicLink()) return { bytes: 0, files: 0, skipped: 1 };
  if (stat.isFile()) return { bytes: stat.size, files: 1, skipped: 0 };
  const result = { bytes: 0, files: 0, skipped: 0 };
  if (!stat.isDirectory()) return result;
  for (const name of await fs.readdir(file)) {
    const value = await sizeOf(path.join(file, name));
    for (const key of Object.keys(result)) result[key] += value[key];
  }
  return result;
}
function preset(id, totalMb, maxMb) {
  if (!['quiet', 'balanced', 'performance', 'visual'].includes(id)) throw new Error('Unknown setup preset.');
  const mods = defaultModSettings();
  for (const mod of catalog()) {
    if (mod.category === 'performance') mods[mod.slug] = true;
    if (mod.category === 'shader') mods[mod.slug] = false;
    if (id === 'performance' && mod.category === 'optional') mods[mod.slug] = false;
  }
  if (id === 'performance' && Object.hasOwn(mods, 'iris')) mods.iris = false;
  if (id === 'visual' && Object.hasOwn(mods, 'iris')) mods.iris = true;
  const target = totalMb < 8192 ? 3072 : id === 'visual' ? 6144 : 4096;
  return { mods, memoryMb: Math.max(2048, Math.min(maxMb, target)) };
}
async function inspect(root, instance, settings, totalMb) {
  const dir = path.join(root, 'instances', instance.id);
  const groups = [];
  let linked = false;
  try { linked = (await fs.lstat(dir)).isSymbolicLink() || (await fs.lstat(path.dirname(dir))).isSymbolicLink(); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (linked) throw new Error('Storage inspection does not follow linked instance folders.');
  for (const name of GROUPS) groups.push({ name, ...await sizeOf(path.join(dir, name)) });
  const disk = await fs.statfs(root);
  const checks = [
    { title: 'Instance type', level: 'info', detail: instance.pack ? `Modpack: ${instance.pack.name}. Pack files are preserved; Sloth client and managed mods are excluded.` : 'Regular Sloth instance with the configured client and managed performance pack.' },
    { title: 'Memory allocation', level: settings.memoryMb > totalMb * .6 ? 'warn' : 'good', detail: `${Math.round(settings.memoryMb / 1024 * 10) / 10} GB allocated of ${Math.round(totalMb / 1024)} GB installed. Leave room for Windows and background apps.` },
    { title: 'Java runtime', level: settings.javaPath ? 'info' : 'good', detail: settings.javaPath ? 'Custom Java selected. The bundled runtime is the easiest starting point when troubleshooting.' : 'Using Sloth’s bundled Java runtime.' },
    { title: 'Output capture', level: settings.onLaunch === 'close' ? 'warn' : 'good', detail: settings.onLaunch === 'close' ? 'The launcher closes after Play, so Launch Insights cannot capture the full session. Choose Minimize or Keep open in Settings.' : 'The launcher stays available to capture Minecraft output.' },
    { title: 'Free disk space', level: disk.bavail * disk.bsize < 2 * 1024 ** 3 ? 'warn' : 'good', detail: `${(disk.bavail * disk.bsize / 1024 ** 3).toFixed(1)} GB free on the game drive.` }
  ];
  return { groups, checks, freeBytes: disk.bavail * disk.bsize, totalBytes: groups.reduce((sum, group) => sum + group.bytes, 0) };
}
module.exports = { inspect, preset, sizeOf };
