const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { execFileSync } = require('node:child_process');

// Migration-only identifiers: never used to connect, seed servers or render branding.
const retiredName = /^(?:ashen(?:[\s_-]*(?:op|prison|server|client))*|sloth\s+op\s+prison)$/i;
function removeRetiredEntries(original) {
  const gzip = original[0] === 31 && original[1] === 139;
  const data = gzip ? zlib.gunzipSync(original, { maxOutputLength: 1024 * 1024 }) : original;
  let at = 0, entries = 0, replacement;
  const take = n => { if (n < 0 || at + n > data.length) throw Error('Invalid server list.'); const p = at; at += n; return p; };
  const byte = () => data[take(1)];
  const int = () => data.readInt32BE(take(4));
  const string = () => { const n = data.readUInt16BE(take(2)); return data.subarray(take(n), at).toString('utf8'); };
  function payload(type, depth, capture = false) {
    if (depth > 32) throw Error('Server list nesting is too deep.');
    if ([1,2,3,4,5,6].includes(type)) { take([0,1,2,4,8,4,8][type]); return; }
    if (type === 8) return string();
    if ([7,11,12].includes(type)) { const n = int(); if (n > 1048576) throw Error('Oversized server list.'); take(n * (type === 7 ? 1 : type === 11 ? 4 : 8)); return; }
    if (type === 9) { const item = byte(), n = int(); if (n < 0 || n > 10000) throw Error('Invalid list size.'); for (let i = 0; i < n; i++) payload(item, depth + 1); return; }
    if (type !== 10) throw Error('Unsupported server list tag.');
    let name;
    for (;;) { const tag = byte(); if (!tag) return name; const key = string(); const value = payload(tag, depth + 1); if (capture && key === 'name' && tag === 8) name = value; }
  }
  if (byte() !== 10) throw Error('Invalid server list root.');
  string();
  for (;;) {
    const tag = byte(); if (!tag) break;
    const key = string();
    if (key !== 'servers' || tag !== 9) { payload(tag, 1); continue; }
    if (replacement) throw Error('Duplicate server list.');
    if (byte() !== 10) throw Error('Invalid server entries.');
    const countAt = at, count = int();
    if (count < 0 || count > 10000) throw Error('Invalid server count.');
    const kept = [];
    for (let i = 0; i < count; i++) { const start = at, name = payload(10, 1, true); if (retiredName.test(name || '')) entries++; else kept.push(data.subarray(start, at)); }
    const length = Buffer.alloc(4); length.writeInt32BE(kept.length);
    replacement = { start: countAt, end: at, bytes: Buffer.concat([length, ...kept]) };
  }
  if (at !== data.length) throw Error('Unexpected server list data.');
  if (!entries) return null;
  const result = Buffer.concat([data.subarray(0,replacement.start), replacement.bytes, data.subarray(replacement.end)]);
  return gzip ? zlib.gzipSync(result) : result;
}

function migrateIndependent(gameRoot) {
  if (process.platform !== 'win32') return;
  const running = execFileSync('powershell.exe', ['-NoProfile','-NonInteractive','-Command', "@(Get-CimInstance Win32_Process | Where-Object { $_.Name -match '^javaw?\\.exe$' -and $_.CommandLine -match 'TokenWrapper|KnotClient|net.minecraft.client.main.Main' }).Count"], { encoding:'utf8',timeout:15000,windowsHide:true }).trim();
  if (!/^\d+$/.test(running) || Number(running)) return;
  const instances = path.join(gameRoot,'instances');
  for (const p of [gameRoot,instances]) if (!fs.existsSync(p) || fs.lstatSync(p).isSymbolicLink()) return;
  for (const entry of fs.readdirSync(instances,{withFileTypes:true})) {
    if (!entry.isDirectory() || !/^[a-z0-9][a-z0-9-]{0,31}$/.test(entry.name)) continue;
    const dir = path.join(instances,entry.name);
    require('./retired-resource-pack').removeRetiredResourcePack(dir);
    const file = path.join(dir,'servers.dat');
    if (fs.existsSync(file) && fs.lstatSync(file).isFile() && fs.statSync(file).size <= 1024 * 1024) {
      try {
        const updated = removeRetiredEntries(fs.readFileSync(file));
        if (updated) {
          fs.copyFileSync(file, `${file}.before-independent-${Date.now()}`, fs.constants.COPYFILE_EXCL);
          const temporary = `${file}.independent-${process.pid}-${Date.now()}`;
          fs.writeFileSync(temporary, updated, {flag:'wx'});
          fs.renameSync(temporary, file);
        }
      } catch { /* Preserve unrecognized or unreadable lists instead of replacing them. */ }
    }
    // Retired waypoint data is archived before removal, with Minecraft closed.
    for (const relative of ['waypoints.json','config/sloth-client/waypoints.json']) {
      const target = path.join(dir,relative);
      let safe = true;
      for (let p = target; p !== dir; p = path.dirname(p)) {
        if (fs.existsSync(p) && fs.lstatSync(p).isSymbolicLink()) { safe = false; break; }
      }
      if (safe && fs.existsSync(target) && fs.lstatSync(target).isFile()) {
        fs.copyFileSync(target,`${target}.before-removal-${Date.now()}`,fs.constants.COPYFILE_EXCL);
        fs.unlinkSync(target);
      }
    }
  }
}
module.exports = { migrateIndependent };
