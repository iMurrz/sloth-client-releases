const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const TYPES = new Set(['mod', 'resourcepack', 'shader', 'modpack', 'datapack']);
function clean(value) {
  if (!value || !/^[A-Za-z0-9]{8}$/.test(value.id) || !TYPES.has(value.type) || !/^[a-z0-9-_.]{1,64}$/i.test(value.slug || '')) throw new Error('Invalid saved project.');
  return { id: value.id, type: value.type, slug: value.slug, title: String(value.title || value.slug).slice(0, 80), author: String(value.author || '').slice(0, 40), description: String(value.description || '').slice(0, 240), categories: [], icon: null, downloads: 0, updated: '' };
}
class Shelf {
  constructor(root) { this.file = path.join(root, 'saved-projects.json'); }
  list() {
    if (!fs.existsSync(this.file)) return [];
    if (fs.lstatSync(this.file).isSymbolicLink()) throw new Error('Linked saved-project files are not supported.');
    const data = JSON.parse(fs.readFileSync(this.file, 'utf8'));
    if (data.schema !== 1 || !Array.isArray(data.projects)) throw new Error('Saved projects use an unsupported or damaged format.');
    return data.projects.slice(0, 300).map(clean);
  }
  toggle(input) {
    const value = clean(input); const projects = this.list();
    const index = projects.findIndex(p => p.id === value.id && p.type === value.type);
    if (index >= 0) projects.splice(index, 1);
    else { if (projects.length >= 300) throw new Error('Your shelf is full. Remove a saved project first.'); projects.unshift(value); }
    const temp = this.file + '.' + crypto.randomUUID() + '.tmp';
    try { fs.writeFileSync(temp, JSON.stringify({ schema: 1, projects }, null, 2), { flag: 'wx' }); fs.renameSync(temp, this.file); }
    finally { if (fs.existsSync(temp)) fs.unlinkSync(temp); }
    return projects;
  }
}
module.exports = { Shelf };
