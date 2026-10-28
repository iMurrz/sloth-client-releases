const zlib = require('node:zlib');

// Minimal read-only NBT parser: enough to read a world's level.dat (gzip) and find its game version.
function parse(buffer) {
  let p = 0;
  let nodes = 0;
  const u8 = () => buffer[p++];
  const i16 = () => { const v = buffer.readInt16BE(p); p += 2; return v; };
  const u16 = () => { const v = buffer.readUInt16BE(p); p += 2; return v; };
  const i32 = () => { const v = buffer.readInt32BE(p); p += 4; return v; };
  const str = () => { const n = u16(); if (p + n > buffer.length) throw new Error('Truncated NBT string'); const s = buffer.toString('utf8', p, p + n); p += n; return s; };
  const skipArray = width => { const n = i32(); if (n < 0 || n * width > buffer.length - p) throw new Error('Invalid NBT array'); p += n * width; return null; };
  function payload(type, depth) {
    if (depth > 64) throw new Error('NBT nested too deeply');
    if (++nodes > 1000000 || p > buffer.length) throw new Error('NBT exceeds the inspection limit');
    switch (type) {
      case 1: return buffer.readInt8(p++);
      case 2: return i16();
      case 3: return i32();
      case 4: { const v = buffer.readBigInt64BE(p); p += 8; return v; }
      case 5: { const v = buffer.readFloatBE(p); p += 4; return v; }
      case 6: { const v = buffer.readDoubleBE(p); p += 8; return v; }
      case 7: return skipArray(1);
      case 8: return str();
      case 9: { const t = u8(); const n = i32(); if (n < 0 || n > 1000000) throw new Error('Invalid NBT list'); const list = []; for (let i = 0; i < n; i++) list.push(payload(t, depth + 1)); return list; }
      case 10: {
        const obj = Object.create(null);
        for (;;) {
          const t = u8();
          if (t === 0) return obj;
          const name = str();
          obj[name] = payload(t, depth + 1);
        }
      }
      case 11: return skipArray(4);
      case 12: return skipArray(8);
      default: throw new Error(`Unknown NBT tag ${type}`);
    }
  }
  const rootType = u8();
  if (rootType !== 10) throw new Error('NBT root is not a compound');
  str();
  return payload(10, 0);
}

/** { name, dataVersion } of a world from its level.dat bytes. */
function worldVersion(levelDat) {
  const root = parse(zlib.gunzipSync(levelDat, { maxOutputLength: 64 * 1024 * 1024 }));
  const data = root.Data || {};
  return { name: data.Version?.Name ?? null, dataVersion: typeof data.DataVersion === 'number' ? data.DataVersion : null, levelName: data.LevelName ?? null };
}

module.exports = { parse, worldVersion };
