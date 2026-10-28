const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

// Small, versioned local journal. Account identities, tokens and raw logs never enter it.
class LaunchHistory {
  constructor(root) { this.file = path.join(root, 'launch-history.json'); }
  list() {
    try {
      const data = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      if (data.schema !== 1) { const error = new Error('Launch history uses an unsupported format; update Sloth Client.'); error.code = 'HISTORY_SCHEMA'; throw error; }
      if (!Array.isArray(data.sessions)) return [];
      return data.sessions.filter(item => item && typeof item.id === 'string' && typeof item.startedAt === 'string').slice(0, 100);
    } catch (error) { if (error.code === 'HISTORY_SCHEMA') throw error; return []; }
  }
  save(sessions) {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const temporary = `${this.file}.${crypto.randomUUID()}.tmp`;
    try {
      fs.writeFileSync(temporary, JSON.stringify({ schema: 1, sessions: sessions.slice(0, 100) }, null, 2), { flag: 'wx', mode: 0o600 });
      fs.renameSync(temporary, this.file);
    } finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
  }
  start(instance, { version, memoryMb, capture }) {
    const entry = { id: crypto.randomUUID(), instanceId: instance.id, instanceName: instance.name, gameVersion: version, memoryMb, startedAt: new Date().toISOString(), status: capture ? 'running' : 'untracked', finishedAt: null, durationSeconds: null, exitCode: null };
    this.save([entry, ...this.list()]);
    return entry.id;
  }
  finish(id, { code, crashed, stopped }) {
    const sessions = this.list(), entry = sessions.find(item => item.id === id);
    if (!entry) return;
    entry.finishedAt = new Date().toISOString();
    entry.durationSeconds = Math.max(0, Math.round((Date.now() - Date.parse(entry.startedAt)) / 1000));
    entry.exitCode = Number.isInteger(code) ? code : null;
    entry.status = stopped ? 'stopped' : crashed ? 'crashed' : code === 0 ? 'completed' : 'interrupted';
    this.save(sessions);
  }
  reconcile() {
    const sessions = this.list();
    for (const entry of sessions) if (entry.status === 'running') entry.status = 'interrupted';
    this.save(sessions);
  }
}

module.exports = { LaunchHistory };
