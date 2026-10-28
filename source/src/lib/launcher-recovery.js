const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { createReadStream } = require('node:fs');
const { sizeOf } = require('./workshop');
async function hash(file) { const h = crypto.createHash('sha256'); for await (const data of createReadStream(file)) h.update(data); return h.digest('hex'); }
async function copyTree(source, destination, files, relative = '') {
  const stat = await fs.lstat(path.join(source, relative));
  if (stat.isSymbolicLink()) throw new Error('Launcher recovery does not copy linked files.');
  if (stat.isDirectory()) {
    await fs.mkdir(path.join(destination, relative), { recursive: true });
    for (const name of await fs.readdir(path.join(source, relative))) await copyTree(source, destination, files, path.join(relative, name));
  } else if (stat.isFile()) {
    const target = path.join(destination, relative); await fs.copyFile(path.join(source, relative), target, 1);
    files.push({ path: relative, sha256: await hash(target) });
  }
}
class LauncherRecovery {
  constructor(root) { this.root = path.resolve(root, 'launcher-recovery'); }
  async init() { await fs.mkdir(this.root, { recursive: true }); for (const f of [this.root, path.dirname(this.root)]) if ((await fs.lstat(f)).isSymbolicLink()) throw new Error('Linked recovery storage is not supported.'); }
  async status() {
    await this.init();
    try {
      if ((await fs.lstat(path.join(this.root, 'previous.json'))).isSymbolicLink()) throw new Error('Linked recovery metadata is not supported.');
      const m = JSON.parse(await fs.readFile(path.join(this.root, 'previous.json'), 'utf8'));
      if (!/^[a-f0-9-]{36}$/.test(m.id) || !/^\d+\.\d+\.\d+/.test(m.version) || typeof m.executable !== 'string' || m.executable !== path.basename(m.executable)) throw new Error('Invalid recovery metadata.');
      return { available: true, version: m.version, createdAt: m.createdAt, id: m.id, executable: m.executable };
    } catch (e) { if (e.code === 'ENOENT') return { available: false }; throw e; }
  }
  async capture(executable, version) {
    await this.init();
    const current = await this.status();
    if (current.available && current.version === version) { await this.executable(); return current; }
    const source = path.dirname(executable); const needed = (await sizeOf(source)).bytes;
    const disk = await fs.statfs(this.root);
    if (disk.bavail * disk.bsize < needed + 128 * 1024 ** 2) throw new Error('Not enough space to preserve the previous launcher before updating.');
    const id = crypto.randomUUID(); const stage = path.join(this.root, id + '.partial'); const files = [];
    const pointer=path.join(this.root,'previous.json');let changedPointer=false;
    try {
      await copyTree(source, path.join(stage, 'app'), files);
      const m = { schema: 1, id, version, createdAt: new Date().toISOString(), executable: path.basename(executable), files };
      await fs.writeFile(path.join(stage, 'manifest.json'), JSON.stringify(m));
      await fs.rename(stage, path.join(this.root, id));
      // Verify copied bytes against the source before changing the recovery pointer.
      for(const item of files) if(await hash(path.join(source,item.path))!==item.sha256) throw new Error('Launcher changed while preserving recovery. Retry before installing.');
      if(await fs.lstat(pointer+'.partial').then(s=>s.isSymbolicLink()).catch(e=>{if(e.code==='ENOENT')return false;throw e;}))throw new Error('Linked recovery pointer is unsupported.');
      await fs.writeFile(pointer + '.partial', JSON.stringify(m)); await fs.rename(pointer + '.partial', pointer);
      changedPointer=true;
      await this.executable();
      if (current.available) {
        const old = path.resolve(this.root, current.id);
        if (path.dirname(old) === this.root && !(await fs.lstat(old)).isSymbolicLink()) await fs.rm(old, { recursive: true, force: true }).catch(() => {});
      }
      return { available: true, version, createdAt: m.createdAt };
    } catch (e) {
      let restored=!changedPointer;
      if(changedPointer)try{if(current.available){await fs.writeFile(pointer+'.partial',JSON.stringify(current));await fs.rename(pointer+'.partial',pointer);}else await fs.rm(pointer,{force:true});restored=true;}catch{}
      for(const target of [stage,...(restored?[path.resolve(this.root,id)]:[])])if(path.dirname(target)===this.root&&await fs.lstat(target).then(s=>!s.isSymbolicLink()).catch(()=>false))await fs.rm(target,{recursive:true,force:true}).catch(()=>{});
      throw e;
    }
  }
  async executable() {
    const s = await this.status(); if (!s.available) throw new Error('No previous launcher has been saved yet.');
    const folder = path.join(this.root, s.id);
    if ((await fs.lstat(folder)).isSymbolicLink()) throw new Error('Invalid recovery folder.');
    if ((await fs.lstat(path.join(folder, 'manifest.json'))).isSymbolicLink()) throw new Error('Invalid recovery manifest.');
    const m = JSON.parse(await fs.readFile(path.join(folder, 'manifest.json'), 'utf8'));
    if(m.id!==s.id||m.version!==s.version||m.executable!==s.executable)throw new Error('Recovery metadata does not match the preserved launcher.');
    if (!Array.isArray(m.files) || m.files.length > 20000) throw new Error('Invalid recovery manifest.');
    for (const file of m.files) {
      if (typeof file.path !== 'string') throw new Error('Invalid recovery file.');
      const base = path.resolve(folder, 'app'); const resolved = path.resolve(base, file.path);
      if (!resolved.startsWith(base + path.sep)) throw new Error('Invalid recovery path.');
      let parent = resolved;
      while (parent !== folder) { if ((await fs.lstat(parent)).isSymbolicLink()) throw new Error('Linked recovery files are not allowed.'); parent = path.dirname(parent); }
      if (await hash(resolved) !== file.sha256) throw new Error('Previous launcher files have changed. Recovery was cancelled.');
    }
    if (!m.files.some(f => f.path === s.executable)) throw new Error('Previous executable missing from manifest.');
    return path.join(folder, 'app', s.executable);
  }
}
module.exports = { LauncherRecovery };
