const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const tools = require('./file-tools');
class Maintenance {
  constructor(root) { this.root = root; this.plans = new Map(); }
  async scan() {
    const items = []; const cutoff = Date.now() - 86400000;
    for (const name of ['assets', 'libraries', 'versions', 'runtime', 'pack-downloads', 'pack-staging', 'transfer-staging']) {
      const folder = path.join(this.root, name); await tools.guard(this.root, folder, true);
      if (!(await tools.plain(folder, true))) continue;
      for (const file of await tools.walk(folder, '', 100000)) {
        if (file.mtimeMs >= cutoff || !name.endsWith('staging') && !/\.\d+\.part$|\.partial$|\.tmp$/i.test(file.path)) continue;
        const relative = path.join(name, file.path);
        items.push({ id: crypto.createHash('sha256').update(relative).digest('hex').slice(0, 24), relative, bytes: file.size, modified: file.mtimeMs });
        if (items.length >= 1000) break;
      }
      if (items.length >= 1000) break;
    }
    const token = crypto.randomUUID(); this.plans.clear(); this.plans.set(token, { at: Date.now(), items });
    return { token, items, bytes: items.reduce((n, f) => n + f.bytes, 0), limited: items.length >= 1000 };
  }
  async clean({ token, ids }, trash) {
    const plan = this.plans.get(token);
    if (!plan || Date.now() - plan.at > 1800000 || !Array.isArray(ids) || !ids.length || ids.length > 1000) throw new Error('Refresh the cleanup preview and choose files first.');
    let bytes = 0, count = 0;
    for (const id of new Set(ids)) {
      const item = plan.items.find(f => f.id === id); if (!item) throw new Error('Invalid cleanup selection.');
      const file = await tools.guard(this.root, path.join(this.root, item.relative)); const stat = await fs.stat(file);
      if (!stat.isFile() || stat.size !== item.bytes || stat.mtimeMs !== item.modified) throw new Error('A file changed since the preview. Refresh before cleaning.');
      await trash(file); bytes += item.bytes; count++;
    }
    this.plans.delete(token); return { bytes, count };
  }
}
module.exports = { Maintenance };
