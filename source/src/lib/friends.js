const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const NAME = /^[A-Za-z0-9_]{3,16}$/;
async function read(file, limit = 32768) {
  const stat = await fs.lstat(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > limit) throw new Error('Invalid friends file');
  return JSON.parse(await fs.readFile(file, 'utf8'));
}
async function folder(root) {
  const base = path.resolve(root);
  await fs.mkdir(base, { recursive: true });
  if (path.resolve(await fs.realpath(base)).toLowerCase() !== base.toLowerCase()) throw new Error('Linked instance is unsupported');
  let dir = base;
  for (const part of ['config', 'sloth-client']) {
    dir = path.join(dir, part); await fs.mkdir(dir).catch(error => { if (error.code !== 'EEXIST') throw error; });
    const stat = await fs.lstat(dir); if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Linked friends folders are unsupported');
  }
  return dir;
}
async function atomic(file, value) {
  const temp = file + '.' + crypto.randomUUID() + '.tmp';
  try { await fs.writeFile(temp, JSON.stringify(value), { flag: 'wx' }); await fs.rename(temp, file); }
  finally { await fs.unlink(temp).catch(() => {}); }
}
class Friends {
  constructor(root) { this.file = path.join(root, 'sloth-friends.json'); this.queue = Promise.resolve(); }
  async records() {
    let data;
    try { data = await read(this.file); } catch (error) { if (error.code === 'ENOENT') return []; throw new Error('The saved friends list could not be read. Its original file was preserved.'); }
    if (data.schema !== 1 || !Array.isArray(data.friends) || data.friends.length > 200 || data.friends.some(x => !NAME.test(x.name || '') || typeof x.favorite !== 'boolean')) throw new Error('Invalid saved friends list');
    return data.friends.map(x => ({ name: x.name, favorite: x.favorite }));
  }
  async publish(instance) {
    const friends = await this.records();
    await atomic(path.join(await folder(instance), 'friends.json'), { schema: 1, friends });
    return friends;
  }
  async change(instance, request) {
    const operation = this.queue.catch(() => {}).then(async () => {
      if (!request || !NAME.test(request.name || '') || !['add', 'remove', 'favorite'].includes(request.action)) throw new Error('Use a Minecraft Java username (3–16 letters, numbers or underscores).');
      const friends = await this.records(), index = friends.findIndex(x => x.name.toLowerCase() === request.name.toLowerCase());
      if (request.action === 'add' && index < 0) { if (friends.length >= 200) throw new Error('Your list can hold 200 friends.'); friends.push({ name: request.name, favorite: false }); }
      if (request.action === 'remove' && index >= 0) friends.splice(index, 1);
      if (request.action === 'favorite' && index >= 0) friends[index].favorite = !friends[index].favorite;
      await atomic(this.file, { schema: 1, friends }); await this.publish(instance);
    });
    this.queue = operation;
    return operation;
  }
  async list(instance, running) {
    const friends = await this.records(); let presence = null;
    try { presence = await read(path.join(await folder(instance), 'presence.json')); } catch { /* unavailable is not offline */ }
    const fresh = running && presence?.schema === 1 && Number.isFinite(presence.at) && Math.abs(Date.now() - presence.at) < 15000 && presence.connected === true && Array.isArray(presence.online) && presence.online.length <= 200;
    const online = new Set(fresh ? presence.online.filter(x => NAME.test(x)).map(x => x.toLowerCase()) : []);
    return { observing: Boolean(fresh), friends: friends.map(friend => ({ ...friend, active: online.has(friend.name.toLowerCase()) })).sort((a, b) => Number(b.active) - Number(a.active) || Number(b.favorite) - Number(a.favorite) || a.name.localeCompare(b.name)) };
  }
}
module.exports = { Friends };
