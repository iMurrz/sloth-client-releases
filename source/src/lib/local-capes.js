const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { guard } = require('./file-tools');
const catalog = require('./local-cape-catalog.json').entries;
const UUID = /^[0-9a-f]{32}$/;
class LocalCapes {
  constructor(root, image) { this.root = root; this.image = image; this.cache = new Map(); this.pending = new Map(); }
  async read(instance) {
    const file = path.join(instance, 'config', 'sloth-client', 'local-capes.json');
    await guard(this.root, file, true);
    try {
      if ((await fs.stat(file)).size > 65536) throw new Error('Local cape settings exceed their limit.');
      const value = JSON.parse(await fs.readFile(file, 'utf8'));
      if (value.schema !== 1 || !value.accounts || Array.isArray(value.accounts) || Object.keys(value.accounts).length > 100) throw new Error('Unsupported local cape settings.');
      return value;
    } catch (e) { if (e.code === 'ENOENT') return { schema: 1, accounts: {} }; throw e; }
  }
  async list(instance, uuid) {
    if (!UUID.test(uuid)) throw new Error('Choose a signed-in account.');
    const value = await this.read(instance);
    return { selected: catalog.some(c => c.id === value.accounts[uuid]?.id) ? value.accounts[uuid].id : 'account', entries: catalog.map(({ id, name }) => ({ id, name })) };
  }
  async texture(id) {
    const entry = catalog.find(c => c.id === id);
    if (!entry) throw new Error('Choose a cape from the local collection.');
    if (this.cache.has(id)) return this.cache.get(id);
    if (this.pending.has(id)) return this.pending.get(id);
    const job = (async () => {
      const response = await fetch(`https://textures.minecraft.net/texture/${entry.texture}`, { redirect: 'error', signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error('Cape texture is unavailable. Try again later.');
      const chunks = []; let size = 0;
      for await (const chunk of response.body) { size += chunk.length; if (size > 131072) throw new Error('Cape texture exceeds its limit.'); chunks.push(Buffer.from(chunk)); }
      const bytes = Buffer.concat(chunks);
      if (crypto.createHash('sha256').update(bytes).digest('hex') !== entry.sha256) throw new Error('Cape texture did not match the verified collection.');
      if (bytes.length < 24 || bytes.toString('hex', 0, 8) !== '89504e470d0a1a0a' || bytes.readUInt32BE(16) !== 64 || bytes.readUInt32BE(20) !== 32 || this.image.createFromBuffer(bytes).isEmpty()) throw new Error('Unsupported cape image.');
      this.cache.set(id, bytes); return bytes;
    })().finally(() => this.pending.delete(id));
    this.pending.set(id, job); return job;
  }
  async preview(id) { return 'data:image/png;base64,' + (await this.texture(id)).toString('base64'); }
  async write(file, bytes) {
    await guard(this.root, file, true);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await guard(this.root, file, true);
    const temp = path.join(path.dirname(file), `cape-${crypto.randomUUID()}.tmp`);
    try { await fs.writeFile(temp, bytes, { flag: 'wx' }); await fs.rename(temp, file); }
    finally { await fs.unlink(temp).catch(() => {}); }
  }
  async select(instance, uuid, id) {
    if (!UUID.test(uuid)) throw new Error('Choose a signed-in account.');
    const value = await this.read(instance);
    if (id === 'account') delete value.accounts[uuid];
    else {
      const entry = catalog.find(c => c.id === id);
      if (!entry) throw new Error('Choose a cape from the local collection.');
      const bytes = await this.texture(id);
      await this.write(path.join(instance, 'config', 'sloth-client', 'local-capes', entry.sha256 + '.png'), bytes);
      value.accounts[uuid] = { id, sha256: entry.sha256 };
    }
    if (Object.keys(value.accounts).length > 100) throw new Error('Keep local selections for up to 100 accounts per instance.');
    await this.write(path.join(instance, 'config', 'sloth-client', 'local-capes.json'), JSON.stringify(value));
    return this.list(instance, uuid);
  }
}
module.exports = { LocalCapes };
