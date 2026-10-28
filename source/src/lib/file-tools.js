const fs = require('node:fs/promises');
const path = require('node:path');
async function plain(file, optional = false) {
  try { const stat = await fs.lstat(file); if (stat.isSymbolicLink()) throw new Error('Linked files and folders are not supported by this operation.'); return stat; }
  catch (e) { if (optional && e.code === 'ENOENT') return null; throw e; }
}
async function guard(root, file, optional = false) {
  const base = path.resolve(root), target = path.resolve(file);
  if (target !== base && !target.startsWith(base + path.sep)) throw new Error('Path is outside the selected workspace.');
  await plain(path.dirname(base)); await plain(base, optional);
  let current = base;
  for (const part of path.relative(base, target).split(path.sep).filter(Boolean)) { current = path.join(current, part); await plain(current, optional); }
  return target;
}
async function walk(root, relative = '', limit = 100000) {
  const files = []; let visited = 0;
  async function visit(name) {
    if (++visited > limit) throw new Error('This folder exceeds the bounded scan limit.');
    const s = await plain(path.join(root, name));
    if (s.isDirectory()) { for (const child of await fs.readdir(path.join(root, name))) await visit(path.join(name, child)); }
    else if (s.isFile()) files.push({ path: name, size: s.size, mtimeMs: s.mtimeMs });
  }
  await visit(relative); return files;
}
function name(value) {
  if (typeof value !== 'string' || !value || value === '.' || value === '..' || value !== path.basename(value) || /[<>:"/\\|?*\x00-\x1f]/.test(value)) throw new Error('Invalid folder name.');
  return value;
}
module.exports = { plain, guard, walk, name };
