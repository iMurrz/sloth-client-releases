const fs = require('node:fs/promises');
const { createReadStream } = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { openZip } = require('./zip');
const tools = require('./file-tools');
const { cleanLaunch, cleanPack } = require('./instances');
const ROOTS = ['mods', 'resourcepacks', 'shaderpacks', 'options.txt', 'session-profiles.json', 'saves', 'screenshots', 'config', 'defaultconfigs', 'kubejs', 'scripts'];
const SECRET = /(?:^|[\\/])(?:accounts?(?:\.[^\\/]+)?|credentials?(?:\.[^\\/]+)?|tokens?(?:\.[^\\/]+)?|secrets?(?:\.[^\\/]+)?|\.env(?:\.[^\\/]+)?|[^\\/]+\.(?:pem|key|p12|pfx))$/i;
const MAX = 3800 * 1024 ** 2;
const crcTable = Array.from({ length: 256 }, (_, value) => { let c = value; for (let n = 0; n < 8; n++) c = c & 1 ? 0xedb88320 ^ c >>> 1 : c >>> 1; return c >>> 0; });
function crc(c, data) { for (const byte of data) c = crcTable[(c ^ byte) & 255] ^ c >>> 8; return c >>> 0; }
function safeRelative(value) {
  if (typeof value !== 'string' || value.includes('\\') || value.includes(':') || value.startsWith('/') || value.split('/').some(x => x === '.' || x === '..' || !x) || !ROOTS.includes(value.split('/')[0]) || SECRET.test(value)) throw new Error('Archive contains an unsupported or sensitive path.');
  return value;
}
async function exportArchive({ root, instance, file, choices = {}, world, progress = () => {} }) {
  await tools.guard(path.dirname(root), root);
  let selected = world ? [`saves/${tools.name(world)}`] : ROOTS.filter(x => x === 'options.txt' || (x==='session-profiles.json'?choices.config===true:choices[x]===true));
  const planned = [];
  for (const relative of selected) {
    await tools.guard(root, path.join(root, relative), true);
    if (!(await tools.plain(path.join(root, relative), true))) continue;
    planned.push(...(await tools.walk(root, relative, 65000)).filter(f => !SECRET.test(f.path)));
  }
  if (!planned.length) throw new Error('There are no selected files to export.');
  if (planned.length > 65000 || planned.some(f => f.size > 512 * 1024 ** 2) || planned.reduce((sum, f) => sum + f.size, 0) > MAX) throw new Error('Export exceeds the portable ZIP limit (3.8 GB total, 512 MB per file, 65,000 files). Use a folder copy for larger setups.');
  const disk = await fs.statfs(path.dirname(file));
  if (disk.bavail * disk.bsize < planned.reduce((sum, f) => sum + f.size, 0) + 64 * 1024 ** 2) throw new Error('Not enough free space at the export destination.');
  const temp = file + '.' + crypto.randomUUID() + '.partial'; const handle = await fs.open(temp, 'wx');
  let offset = 0; const directory = [], checksums = [];
  async function write(buffer) { let n = 0; while (n < buffer.length) n += (await handle.write(buffer, n, buffer.length - n, offset + n)).bytesWritten; offset += buffer.length; }
  async function entry(name, chunks, modified = Date.now()) {
    const nameBuffer = Buffer.from(name); const start = offset; const local = Buffer.alloc(30);
    const date = new Date(modified); const dosDate = (Math.max(1980, Math.min(2107, date.getFullYear())) - 1980) << 9 | (date.getMonth() + 1) << 5 | date.getDate(); const dosTime = date.getHours() << 11 | date.getMinutes() << 5 | Math.floor(date.getSeconds() / 2);
    local.writeUInt32LE(0x04034b50); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x808, 6); local.writeUInt16LE(nameBuffer.length, 26);
    local.writeUInt16LE(dosTime, 10); local.writeUInt16LE(dosDate, 12);
    await write(local); await write(nameBuffer);
    let checksum = 0xffffffff, size = 0; const hash = crypto.createHash('sha256');
    for await (const chunk of chunks) { size += chunk.length; if (size > 512 * 1024 ** 2 || offset + chunk.length > MAX + 32 * 1024 ** 2) throw new Error('Files changed or archive exceeds the export limit.'); checksum = crc(checksum, chunk); hash.update(chunk); await write(chunk); }
    checksum = (checksum ^ 0xffffffff) >>> 0;
    const descriptor = Buffer.alloc(16); descriptor.writeUInt32LE(0x08074b50); descriptor.writeUInt32LE(checksum, 4); descriptor.writeUInt32LE(size, 8); descriptor.writeUInt32LE(size, 12); await write(descriptor);
    const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(0x808, 8); central.writeUInt32LE(checksum, 16); central.writeUInt32LE(size, 20); central.writeUInt32LE(size, 24); central.writeUInt16LE(nameBuffer.length, 28); central.writeUInt32LE(start, 42);
    central.writeUInt16LE(dosTime, 12); central.writeUInt16LE(dosDate, 14);
    directory.push(Buffer.concat([central, nameBuffer])); return { path: name, size, sha256: hash.digest('hex') };
  }
  try {
    for (const item of planned) {
      const relative = safeRelative(item.path.split(path.sep).join('/')); const source = path.join(root, item.path);
      await tools.guard(root, source); const before = await fs.stat(source);
      checksums.push(await entry(relative, createReadStream(source), before.mtimeMs));
      const after = await fs.stat(source); if (before.size !== after.size || before.mtimeMs !== after.mtimeMs) throw new Error('A file changed during export. Close Minecraft before exporting.');
      progress({ label: 'Exporting personal archive', done: checksums.length, total: planned.length });
    }
    const manifest = { schema: 1, gameVersion: instance.gameVersion, name: instance.name, launch: cleanLaunch(instance.launch), pack: world ? null : cleanPack(instance.pack), mods: world ? {} : instance.mods, createdAt: new Date().toISOString(), files: checksums };
    const metadata = Buffer.from(JSON.stringify(manifest)); if (metadata.length > 16 * 1024 ** 2) throw new Error('Export manifest exceeds the portable inspection limit. Choose fewer files.');
    await entry('sloth-export.json', [metadata]);
    const start = offset; for (const record of directory) await write(record);
    const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50); end.writeUInt16LE(directory.length, 8); end.writeUInt16LE(directory.length, 10); end.writeUInt32LE(offset - start, 12); end.writeUInt32LE(start, 16); await write(end);
    await handle.sync(); await handle.close(); await fs.rename(temp, file);
    return { files: planned.length, bytes: offset };
  } catch (e) { await handle.close().catch(() => {}); await fs.rm(temp, { force: true }).catch(() => {}); throw e; }
}
async function importArchive(file, manager, progress = () => {}) {
  let zip; const staging = path.join(manager.root, 'transfer-staging');
  await tools.guard(manager.root, staging, true); await fs.mkdir(staging, { recursive: true });
  const stage = path.join(staging, crypto.randomUUID()); await fs.mkdir(stage);
  try {
    zip = await openZip(file);
    const metadata = zip.entries.find(e => e.name === 'sloth-export.json');
    if (!metadata || metadata.uncompressedSize > 16 * 1024 ** 2 || metadata.compressedSize > 16 * 1024 ** 2) throw new Error('Choose an Sloth portable archive with its export manifest.');
    const m = JSON.parse((await zip.read(metadata)).toString());
    if (m.schema !== 1 || m.gameVersion !== manager.gameVersion || !Array.isArray(m.files) || m.files.length > 65000) throw new Error('Unsupported archive version or Minecraft version.');
    const needed = m.files.reduce((sum, item) => sum + (Number.isSafeInteger(item.size) && item.size >= 0 ? item.size : MAX + 1), 0);
    const disk = await fs.statfs(staging); if (needed > MAX || disk.bavail * disk.bsize < needed * 2 + 64 * 1024 ** 2) throw new Error('Not enough free space for checked import and its new instance, or archive exceeds the transfer limit.');
    const seen = new Set(); let bytes = 0, done = 0;
    for (const item of m.files) {
      const relative = safeRelative(item.path);
      if (seen.has(relative) || !/^[a-f0-9]{64}$/.test(item.sha256 || '') || !Number.isSafeInteger(item.size) || item.size < 0 || item.size > 512 * 1024 ** 2) throw new Error('Invalid archive manifest.');
      seen.add(relative); bytes += item.size; if (bytes > MAX) throw new Error('Archive exceeds the transfer limit.');
      const entry = zip.entries.find(e => e.name === relative);
      if (!entry || entry.directory || entry.uncompressedSize !== item.size || entry.compressedSize > 512 * 1024 ** 2) throw new Error('Archive file is missing or has an invalid size.');
      const buffer = await zip.read(entry); if (crypto.createHash('sha256').update(buffer).digest('hex') !== item.sha256) throw new Error('Archive file failed its integrity check.');
      const dest = path.join(stage, relative); await fs.mkdir(path.dirname(dest), { recursive: true }); await fs.writeFile(dest, buffer, { flag: 'wx' });
      progress({ label: 'Checking and importing archive', done: ++done, total: m.files.length });
    }
    if (zip.entries.some(e => !e.directory && e.name !== 'sloth-export.json' && !seen.has(e.name))) throw new Error('Archive has unexpected files.');
    const item = await manager.create(`${String(m.name || 'Transferred').slice(0, 22)} imported`, { sourceDir: stage, pack: cleanPack(m.pack) });
    manager.setLaunch(item.id, cleanLaunch(m.launch) || manager.get().launch || {});
    manager.setMods(item.id, m.mods && typeof m.mods === 'object' ? m.mods : manager.defaultMods);
    return item;
  } finally { await zip?.close(); const target = path.resolve(stage); if (path.dirname(target) === path.resolve(staging)) await fs.rm(target, { recursive: true, force: true }); }
}
module.exports = { exportArchive, importArchive };
