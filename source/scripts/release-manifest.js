const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { createReadStream } = require('node:fs');
async function inventory(root) {
  const files = [];
  async function walk(dir) {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) throw new Error('Linked release files are unsupported');
      if (entry.isDirectory()) await walk(file);
      else {
        if (!entry.isFile() || files.length >= 10000) throw new Error('Invalid or oversized release inventory');
        const before = await fs.stat(file), hash = crypto.createHash('sha256');
        for await (const chunk of createReadStream(file)) hash.update(chunk);
        const after = await fs.stat(file);
        if (before.size !== after.size || before.mtimeMs !== after.mtimeMs) throw new Error('Release file changed while hashing');
        files.push({ path: path.relative(root, file).split(path.sep).join('/'), bytes: after.size, sha256: hash.digest('hex') });
      }
    }
  }
  await walk(root);
  return files.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
}
async function verifyInventory(root, document, version) {
  if (document.schema !== 1 || document.version !== version || JSON.stringify(document.files) !== JSON.stringify(await inventory(root))) throw new Error('Release content does not match its signed inventory');
}
module.exports = { inventory, verifyInventory };
