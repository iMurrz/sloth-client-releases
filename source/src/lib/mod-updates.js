const path = require('node:path');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const playerMods = require('./game/player-mods');
const modrinth = require('./modrinth');
const library = require('./library');
const tools = require('./file-tools');
const { runPool, hashFile } = require('./http');
const lock = require('./game/mods-lock.json');
class ModUpdates {
  constructor() { this.plans = new Map(); }
  async review(instanceDir, gameVersion, instanceId, catalogSlugs) {
    const dir = path.join(instanceDir, 'mods'); await tools.guard(path.dirname(instanceDir), dir, true);
    await tools.plain(path.join(dir, '.sloth-player-mods.json'), true);
    const entries = (await playerMods.read(dir)).filter(m => /^[A-Za-z0-9]{8}$/.test(m.projectId || '')).slice(0, 50);
    const rows = [];
    await runPool(entries, 3, async m => {
      const row = { id: m.projectId, title: String(m.title || m.filename).slice(0, 100), current: m.versionId || 'Unknown', state: 'manual' };
      try {
        const stat = await tools.plain(path.join(dir, m.filename), true);
        if (!stat?.isFile()) { row.state = 'disabled'; row.detail = 'Disabled or missing; not offered for automatic update.'; }
        else if (catalogSlugs.has(m.slug) || /^(?:sloth|sloth)-client-/i.test(m.filename) || lock.mods.some(mod => mod.file?.filename.toLowerCase() === m.filename.toLowerCase())) { row.state = 'managed'; row.detail = 'Updated with the launcher performance pack.'; }
        else {
          const current = m.versionId ? await modrinth.version(m.versionId) : null;
          const latest = await modrinth.compatibleVersion(m.projectId, gameVersion, 'fabric');
          const oldDate = Date.parse(current?.date_published), newDate = Date.parse(latest?.date_published);
          row.current = String(current?.version_number || m.versionId || 'Unknown').slice(0, 80);
          if (!latest || latest.version_type !== 'release') { row.state = 'unavailable'; row.detail = 'No compatible stable Fabric release was found.'; }
          else if (latest.id === m.versionId || Number.isFinite(oldDate) && newDate <= oldDate) { row.state = 'current'; row.detail = 'No newer compatible stable release found.'; }
          else if (!Number.isFinite(oldDate) || !Number.isFinite(newDate)) { row.detail = 'Installed version date is unknown. Review this project manually.'; }
          else { row.state = 'available'; row.versionId = latest.id; row.next = String(latest.version_number || latest.name || latest.id).slice(0, 80); row.notes = String(latest.changelog || 'No release notes provided.').slice(0, 12000); row.filename = m.filename; row.fingerprint = await hashFile(path.join(dir, m.filename), 'sha256'); }
        }
      } catch { row.state = 'error'; row.detail = 'Could not check this project. Check connectivity and retry.'; }
      rows.push(row);
    });
    const token = crypto.randomUUID();
    for (const [id, plan] of this.plans) if (Date.now() - plan.created > 1800000) this.plans.delete(id);
    if (this.plans.size >= 20) this.plans.delete(this.plans.keys().next().value);
    this.plans.set(token, { created: Date.now(), instanceId, rows });
    return { token, rows: rows.sort((a, b) => Number(b.state === 'available') - Number(a.state === 'available') || a.title.localeCompare(b.title)), limited: entries.length === 50 };
  }
  async apply({ token, ids }, { manager, recovery, catalogSlugs, progress }) {
    const plan = this.plans.get(token);
    if (!plan || Date.now() - plan.created > 1800000 || plan.instanceId !== manager.get().id) throw new Error('Refresh the update review for this instance before applying it.');
    if (!Array.isArray(ids) || !ids.length || ids.length > 50 || new Set(ids).size !== ids.length) throw new Error('Choose one or more reviewed updates.');
    const rows = ids.map(id => { const row = plan.rows.find(r => r.id === id && r.state === 'available'); if (!row) throw new Error('Invalid update selection.'); return row; });
    const dir = manager.instancePath(); await tools.guard(path.dirname(dir), path.join(dir, 'mods'));
    const tracked = await playerMods.read(path.join(dir, 'mods'));
    for (const row of rows) {
      if (!tracked.some(m => m.projectId === row.id && m.filename === row.filename)) throw new Error('A mod changed since the review. Refresh before updating.');
      const file = path.join(dir, 'mods', row.filename); if (!(await tools.plain(file)).isFile() || await hashFile(file, 'sha256') !== row.fingerprint) throw new Error('A mod file changed after review. Refresh before updating.');
    }
    const restorePoint = await recovery.create(dir, manager.get(), 'Before reviewed mod updates', progress);
    const installed = [];
    try {
      for (const row of rows) {
        await library.install({ id: row.id, type: 'mod', versionId: row.versionId }, { instanceDir: dir, gameVersion: manager.gameVersion, catalogSlugs });
        installed.push(row.title); progress({ label: 'Applying reviewed mod updates', done: installed.length, total: rows.length });
      }
      this.plans.delete(token); return { installed, restorePoint };
    } catch (e) { throw new Error('Update stopped. A full restore point named “Before reviewed mod updates” is available in Recovery. ' + e.message); }
  }
}
module.exports = { ModUpdates };
