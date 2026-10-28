const fs = require('node:fs');
const path = require('node:path');
const { securePersistence } = require('../secret-storage');

const UUID = /^[0-9a-f]{32}$/;

/**
 * Minecraft accounts on this PC. Public details (name, skin) are plain JSON; tokens are encrypted with the
 * OS keychain via Electron safeStorage (DPAPI on Windows). If encryption is unavailable, tokens live only in
 * memory and players sign in again next launch — they are never written in plain text.
 */
class AccountStore {
  constructor(file, safeStorage) {
    this.file = file;
    this.safe = safeStorage;
    this.memorySecrets = new Map();
    this.data = { activeId: null, accounts: [] };
    try {
      const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (Array.isArray(saved.accounts)) {
        this.data.accounts = saved.accounts.filter(a => a && UUID.test(a.uuid) && typeof a.name === 'string').slice(0,100).map(a => ({
          uuid:a.uuid, name:a.name.slice(0,32),
          ...(typeof a.skin==='string'&&a.skin.length<=256*1024?{skin:a.skin}:{}),
          ...(typeof a.secret==='string'&&a.secret.length<=128*1024?{secret:a.secret}:{}),
          ...(a.skinVariant==='slim'?{skinVariant:'slim'}:{}),
          ...(a.needsReauth?{needsReauth:true}:{}),
          ...(Number.isFinite(a.updatedAt)?{updatedAt:a.updatedAt}:{})
        }));
        this.data.activeId = this.data.accounts.some(a => a.uuid === saved.activeId) ? saved.activeId : this.data.accounts[0]?.uuid ?? null;
      }
    } catch (error) {
      // No file means first run. A damaged file is kept aside so the next save cannot silently erase the accounts.
      if (error instanceof SyntaxError) { try { fs.renameSync(file, `${file}.corrupt-${Date.now()}`); } catch { /* continue without it */ } }
    }
  }

  get canPersist() {
    return securePersistence(this.safe);
  }

  save() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
    fs.renameSync(tmp, this.file);
  }

  find(uuid) { return this.data.accounts.find(a => a.uuid === uuid) || null; }
  active() { return this.find(this.data.activeId); }

  /** What the renderer is allowed to see: no tokens. */
  list() {
    return this.data.accounts.map(a => ({ uuid: a.uuid, name: a.name, skin: a.skin || null, skinVariant: a.skinVariant === 'slim' ? 'slim' : 'classic', active: a.uuid === this.data.activeId, needsReauth: Boolean(a.needsReauth) }));
  }

  secret(uuid) {
    const account = this.find(uuid);
    if (!account) return null;
    if (account.secret && this.canPersist) {
      try { return JSON.parse(this.safe.decryptString(Buffer.from(account.secret, 'base64'))); }
      catch { return null; }
    }
    return this.memorySecrets.get(uuid) || null;
  }

  setSecret(uuid, secret) {
    const account = this.find(uuid);
    if (!account) return;
    if (this.canPersist) {
      account.secret = this.safe.encryptString(JSON.stringify(secret)).toString('base64');
      this.memorySecrets.delete(uuid);
    } else {
      delete account.secret;
      this.memorySecrets.set(uuid, secret);
    }
    delete account.needsReauth;
    this.save();
  }

  upsert({ uuid, name, skin }, secret) {
    let account = this.find(uuid);
    if (!account) {
      account = { uuid };
      this.data.accounts.push(account);
    }
    Object.assign(account, { name, skin: skin || account.skin || null, updatedAt: Date.now() });
    this.data.activeId = uuid;
    this.setSecret(uuid, secret);
  }

  updateProfile(uuid, { name, skin, variant }) {
    const account = this.find(uuid);
    if (!account) return;
    if (name) account.name = name;
    if (skin) account.skin = skin;
    if (['classic', 'slim'].includes(variant)) account.skinVariant = variant;
    this.save();
  }

  markReauth(uuid) {
    const account = this.find(uuid);
    if (!account) return;
    account.needsReauth = true;
    delete account.secret;
    this.memorySecrets.delete(uuid);
    this.save();
  }

  setActive(uuid) {
    if (!this.find(uuid)) return false;
    this.data.activeId = uuid;
    this.save();
    return true;
  }

  remove(uuid) {
    this.data.accounts = this.data.accounts.filter(a => a.uuid !== uuid);
    this.memorySecrets.delete(uuid);
    if (this.data.activeId === uuid) this.data.activeId = this.data.accounts[0]?.uuid ?? null;
    this.save();
  }
}

module.exports = { AccountStore };
