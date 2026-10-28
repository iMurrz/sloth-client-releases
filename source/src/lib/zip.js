const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const zlib = require('node:zlib');
const { safeJoin } = require('./game/paths');

const MAX_ENTRY = 64 * 1024 * 1024; // Buffered reads are bounded to 64 MB per file.
const MAX_TOTAL = 8 * 1024 * 1024 * 1024; // 8 GB per archive

/** Minimal, read-only ZIP reader (stored + deflate, no ZIP64) used for imports and reading game jars. */
async function openZip(file) {
  // Nested mod archives are inspected in memory, without extracting executable files.
  const handle = Buffer.isBuffer(file) ? {
    stat: async () => ({ size: file.length }),
    read: async (out, offset, length, position) => ({ bytesRead: file.copy(out, offset, position, position + length) }),
    close: async () => {}
  } : await fsp.open(file, 'r');
  try {
  const { size } = await handle.stat();
  const tailLen = Math.min(size, 65535 + 22);
  const tail = Buffer.alloc(tailLen);
  await handle.read(tail, 0, tailLen, size - tailLen);
  let eocd = -1;
  for (let i = tailLen - 22; i >= 0; i--) if (tail.readUInt32LE(i) === 0x06054b50 && i + 22 + tail.readUInt16LE(i + 20) === tailLen) { eocd = i; break; }
  if (eocd < 0) { await handle.close(); throw new Error('Not a zip file'); }
  const count = tail.readUInt16LE(eocd + 10);
  const cdSize = tail.readUInt32LE(eocd + 12);
  const cdOffset = tail.readUInt32LE(eocd + 16);
  if (tail.readUInt16LE(eocd + 4) || tail.readUInt16LE(eocd + 6) || tail.readUInt16LE(eocd + 8) !== count) throw new Error('Split ZIP archives are unsupported');
  if (cdOffset === 0xffffffff || count === 0xffff) { await handle.close(); throw new Error('ZIP64 archives are not supported'); }
  if (cdSize > 32 * 1024 * 1024 || cdOffset + cdSize !== size - tailLen + eocd) { throw new Error('Invalid or oversized ZIP directory'); }
  const cd = Buffer.alloc(cdSize);
  await handle.read(cd, 0, cdSize, cdOffset);
  const entries = [];
  let p = 0;
  for (let i = 0; i < count; i++) {
    if (p + 46 > cd.length || cd.readUInt32LE(p) !== 0x02014b50) throw new Error('Truncated ZIP directory');
    const flags = cd.readUInt16LE(p + 8);
    const method = cd.readUInt16LE(p + 10);
    const compressedSize = cd.readUInt32LE(p + 20);
    const uncompressedSize = cd.readUInt32LE(p + 24);
    const nameLen = cd.readUInt16LE(p + 28), extraLen = cd.readUInt16LE(p + 30), commentLen = cd.readUInt16LE(p + 32);
    const offset = cd.readUInt32LE(p + 42);
    if (p + 46 + nameLen + extraLen + commentLen > cd.length || !nameLen || flags & 1 || cd.readUInt16LE(p + 34) || offset + 30 > cdOffset || compressedSize === 0xffffffff || uncompressedSize === 0xffffffff) throw new Error('Invalid or encrypted ZIP entry');
    const name = cd.subarray(p + 46, p + 46 + nameLen).toString(flags & 0x800 ? 'utf8' : 'latin1').replace(/\\/g, '/');
    entries.push({ name, flags, method, compressedSize, uncompressedSize, offset, directory: name.endsWith('/') });
    p += 46 + nameLen + extraLen + commentLen;
  }
  if (p !== cd.length) throw new Error('Unexpected ZIP directory data');

  async function read(entry) {
    if (!entries.includes(entry)) throw new Error('Unknown ZIP entry');
    if (entry.uncompressedSize > MAX_ENTRY || entry.compressedSize > MAX_ENTRY || entry.offset + 30 > size) throw new Error(`${entry.name} is too large or invalid`);
    const header = Buffer.alloc(30);
    await handle.read(header, 0, 30, entry.offset);
    if (header.readUInt32LE(0) !== 0x04034b50) throw new Error(`Corrupt zip entry ${entry.name}`);
    if (header.readUInt16LE(6) !== entry.flags || header.readUInt16LE(8) !== entry.method) throw new Error('ZIP headers disagree');
    const start = entry.offset + 30 + header.readUInt16LE(26) + header.readUInt16LE(28);
    if (start + entry.compressedSize > cdOffset) throw new Error(`Truncated zip entry ${entry.name}`);
    const data = Buffer.alloc(entry.compressedSize);
    await handle.read(data, 0, entry.compressedSize, start);
    const out = entry.method === 0 ? data : entry.method === 8 ? await new Promise((resolve, reject) => zlib.inflateRaw(data, { maxOutputLength: Math.max(1, entry.uncompressedSize) }, (error, bytes) => error ? reject(error) : resolve(bytes))) : null;
    if (!out) throw new Error(`Unsupported compression in ${entry.name}`);
    if (out.length !== entry.uncompressedSize) throw new Error(`Incorrect zip entry size for ${entry.name}`);
    return out;
  }

  /** Extracts entries accepted by `filter` under `dest`, refusing paths that escape it. */
  async function extract(dest, filter = () => true) {
    let total = 0;
    await fsp.mkdir(dest, { recursive: true });
    const root = path.resolve(dest);
    if (path.resolve(await fsp.realpath(root)).toLowerCase() !== root.toLowerCase()) throw new Error('Linked archive destination is unsupported');
    const seen = new Set();
    for (const entry of entries) {
      if (entry.directory || !filter(entry.name)) continue;
      total += entry.uncompressedSize;
      if (total > MAX_TOTAL) throw new Error('Archive is too large to import');
      const target = safeJoin(dest, entry.name);
      const key = target.toLowerCase();
      if (seen.has(key)) throw new Error('Duplicate archive file');
      seen.add(key);
      let parent = root;
      for (const part of path.relative(root, path.dirname(target)).split(path.sep).filter(Boolean)) {
        parent = path.join(parent, part);
        await fsp.mkdir(parent).catch(error => { if (error.code !== 'EEXIST') throw error; });
        const stat = await fsp.lstat(parent);
        if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Linked archive folders are unsupported');
      }
      await fsp.writeFile(target, await read(entry), { flag: 'wx' });
    }
  }

  return { entries, read, extract, close: () => handle.close() };
  } catch (error) {
    await handle.close().catch(() => {});
    throw error;
  }
}

/** Reads one file out of a zip/jar, or null when it isn't there. */
async function readZipEntry(file, name) {
  if (!fs.existsSync(file)) return null;
  const zip = await openZip(file);
  try {
    const entry = zip.entries.find(e => e.name === name);
    return entry ? await zip.read(entry) : null;
  } finally {
    await zip.close();
  }
}

module.exports = { openZip, readZipEntry };
