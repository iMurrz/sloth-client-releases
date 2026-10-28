const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { createReadStream } = require('node:fs');
const { guard, walk } = require('./file-tools');

async function inventory(root) {
  await guard(root, root);
  const result = new Map(); let bytes = 0;
  for (const folder of ['mods', 'config', 'resourcepacks', 'shaderpacks', 'defaultconfigs', 'kubejs', 'scripts']) {
    const target = await guard(root, path.join(root, folder), true);
    try { await fs.access(target); } catch (e) { if (e.code === 'ENOENT') continue; throw e; }
    for (const file of await walk(root, folder, 10000)) {
      if (result.size >= 10000 || file.size > 512 * 1024 ** 2 || (bytes += file.size) > 4 * 1024 ** 3) throw new Error('Comparison exceeds the 10,000-file / 4 GB scan limit.');
      const hash = crypto.createHash('sha256');
      const source = await guard(root, path.join(root, file.path));
      for await (const chunk of createReadStream(source)) hash.update(chunk);
      const after = await fs.stat(source);
      if (after.size !== file.size || after.mtimeMs !== file.mtimeMs) throw new Error('Files changed during comparison. Close other clients and try again.');
      result.set(file.path.replace(/\\/g, '/'), { size: file.size, hash: hash.digest('hex') });
    }
  }
  const options = await guard(root, path.join(root, 'options.txt'), true);
  try {
    const stat = await fs.stat(options);
    if (stat.size > 1024 ** 2) throw new Error('Game options exceed the comparison limit.');
    result.set('options.txt', { size: stat.size, hash: crypto.createHash('sha256').update(await fs.readFile(options)).digest('hex') });
  } catch (e) { if (e.code !== 'ENOENT') throw e; }
  return result;
}
async function compare(manager, request) {
  const left = manager.get(request?.left), right = manager.get(request?.right);
  if (left.id === right.id) throw new Error('Choose two different instances.');
  const a = await inventory(manager.instancePath(left.id)), b = await inventory(manager.instancePath(right.id));
  const rows = [];
  for (const name of [...new Set([...a.keys(), ...b.keys()])].sort()) {
    const x = a.get(name), y = b.get(name);
    if (!x || !y || x.hash !== y.hash) rows.push({ path: name, status: !x ? 'Right only' : !y ? 'Left only' : 'Changed', leftSize: x?.size ?? null, rightSize: y?.size ?? null });
  }
  const settings = [];
  for (const key of ['memoryMb', 'resolution', 'onLaunch', 'performancePreset', 'reminderMinutes']) {
    const x = left.launch?.[key] ?? null, y = right.launch?.[key] ?? null;
    if (JSON.stringify(x) !== JSON.stringify(y)) settings.push({ key, left: x, right: y });
  }
  for (const key of [...new Set([...Object.keys(left.mods || {}), ...Object.keys(right.mods || {})])].sort()) {
    if (left.mods?.[key] !== right.mods?.[key]) settings.push({ key: `Managed mod: ${key}`, left: left.mods?.[key] ?? null, right: right.mods?.[key] ?? null });
  }
  if (JSON.stringify(left.pack) !== JSON.stringify(right.pack)) settings.push({ key: 'Modpack', left: left.pack?.name || 'Regular Sloth', right: right.pack?.name || 'Regular Sloth' });
  return { left: left.name, right: right.name, scanned: a.size + b.size, rows, settings, checkedAt: new Date().toISOString() };
}
module.exports = { compare };
