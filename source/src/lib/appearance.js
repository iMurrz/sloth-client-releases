const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { guard, plain } = require('./file-tools');
const UUID = /^[0-9a-f]{32}$/;
const ID = /^[0-9a-f-]{32,36}$/i;
const CAPE_ID = /^[A-Za-z0-9_-]{1,128}$/;
const BASE = 'https://api.minecraftservices.com/minecraft/profile';

async function bounded(response, max) {
  const chunks = []; let size = 0;
  if (!response.body) return Buffer.alloc(0);
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > max) throw new Error('Appearance response exceeds the supported size.');
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}
async function service(token, suffix = '', method = 'GET', body) {
  let response;
  try {
    response = await fetch(BASE + suffix, { method, body, redirect: 'error', signal: AbortSignal.timeout(20000), headers: {
      Authorization: `Bearer ${token}`, Accept: 'application/json', 'User-Agent': 'SlothClient/0.8.2', 'Cache-Control': 'no-cache', ...(typeof body === 'string' ? { 'Content-Type': 'application/json' } : {})
    } });
  } catch { throw new Error(method === 'GET' ? 'Minecraft profile service could not be reached. Try again later.' : 'Minecraft did not confirm this change. Refresh your appearance before trying again.'); }
  const bytes = await bounded(response, 1024 * 1024);
  if (!response.ok) {
    if (response.status === 401) {
      const error = new Error('Your Minecraft session expired. Sign in again.');
      error.code = 'profile-session-expired'; throw error;
    }
    if (response.status === 429) throw new Error('Minecraft is limiting profile changes. Wait before trying again.');
    if (response.status === 403) throw new Error(method === 'GET' ? 'Minecraft denied authenticated profile access. Sign in again to load owned cape choices.' : 'Minecraft refused this profile change. Check account access and cape ownership.');
    throw new Error(`Minecraft profile request failed (${response.status}). Refresh before retrying.`);
  }
  return bytes.length ? JSON.parse(bytes.toString('utf8')) : null;
}
class Appearance {
  constructor(root, image) { this.root = root; this.file = path.join(root, 'skin-loadouts.json'); this.image = image; }
  async publicProfile(uuid) {
    if (!UUID.test(uuid)) throw new Error('Invalid Minecraft account.');
    const response = await fetch(`https://sessionserver.mojang.com/session/minecraft/profile/${uuid}`, { redirect: 'error', signal: AbortSignal.timeout(15000), headers: { 'User-Agent': 'SlothClient/0.8.2', 'Cache-Control': 'no-cache' } });
    if (!response.ok) throw new Error(`Mojang skin lookup failed (${response.status}).`);
    const raw = JSON.parse((await bounded(response, 256 * 1024)).toString('utf8'));
    if (raw.id !== uuid) throw new Error('Mojang returned a different account.');
    const property = raw.properties?.find(p => p.name === 'textures');
    if (typeof property?.value !== 'string' || property.value.length > 128 * 1024) throw new Error('Mojang did not return this account’s skin.');
    const textures = JSON.parse(Buffer.from(property.value, 'base64').toString('utf8')).textures;
    const skin = await this.texture(textures?.SKIN?.url);
    if (!skin) throw new Error('Mojang did not return a skin texture.');
    let equippedCape = null;
    const warnings = [];
    if (textures.CAPE?.url) {
      try { equippedCape = { image: await this.texture(textures.CAPE.url, true), name: 'Currently equipped Java cape', texture: this.textureKey(textures.CAPE.url) }; }
      catch { warnings.push('Mojang reports an equipped cape, but its texture preview could not be downloaded.'); }
    }
    return { uuid, name: String(raw.name || '').slice(0, 16), skin, variant: textures.SKIN.metadata?.model === 'slim' ? 'slim' : 'classic', capeId: '', capes: [], equippedCape, capeEquipped: Boolean(textures.CAPE?.url), ownedCapesLoaded: false, source: 'Mojang public profile', warnings };
  }
  png(bytes, cape = false) {
    if (bytes.length < 24 || bytes.length > 128 * 1024 || bytes.readUInt32BE(0) !== 0x89504e47 || bytes.toString('ascii', 12, 16) !== 'IHDR') throw new Error('Choose a valid Minecraft PNG texture under 128 KB.');
    const w = bytes.readUInt32BE(16), h = bytes.readUInt32BE(20);
    if (cape ? !((w === 64 && h === 32) || (w === 128 && h === 64)) : !(w === 64 && (h === 64 || h === 32))) throw new Error(cape ? 'Unsupported cape texture dimensions.' : 'Skins must be 64×64 or legacy 64×32 pixels.');
    const decoded = this.image.createFromBuffer(bytes);
    if (decoded.isEmpty() || decoded.getSize().width !== w || decoded.getSize().height !== h) throw new Error('The PNG could not be decoded.');
    const canonical = decoded.toPNG();
    if (canonical.length > 128 * 1024) throw new Error('Texture is too large.');
    return `data:image/png;base64,${canonical.toString('base64')}`;
  }
  async texture(value, cape = false) {
    if (!value) return null;
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.hostname !== 'textures.minecraft.net' || url.port || url.username || url.password || !/^\/texture\/[a-f0-9]+$/i.test(url.pathname)) throw new Error('Minecraft returned an unsupported texture address.');
    url.protocol = 'https:';
    const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error('Texture preview is unavailable.');
    return this.png(await bounded(response, 128 * 1024), cape);
  }
  textureKey(value) {
    try { const url = new URL(value); return url.hostname === 'textures.minecraft.net' && /^\/texture\/[a-f0-9]+$/i.test(url.pathname) ? url.pathname.split('/').pop().toLowerCase() : null; }
    catch { return null; }
  }
  async profile(token, uuid) {
    const raw = await service(token);
    if (raw?.id !== uuid || !UUID.test(raw.id)) throw new Error('Minecraft returned a different account. Sign in again.');
    const skin = raw.skins?.find(s => s.state === 'ACTIVE');
    const warnings = [];
    const preview = async (url, cape) => { try { return await this.texture(url, cape); } catch { warnings.push('A texture preview could not be downloaded. Refresh to try again.'); return null; } };
    const capes = [], urls = [];
    for (const cape of (Array.isArray(raw.capes) ? raw.capes : []).slice(0, 50)) {
      if (typeof cape.id !== 'string' || !CAPE_ID.test(cape.id)) { warnings.push('Minecraft returned an unsupported cape identifier. This cape could not be selected.'); continue; }
      capes.push({ id: cape.id, name: String(cape.alias || cape.name || `Minecraft cape ${cape.id.slice(0, 6)}`).slice(0, 80), active: String(cape.state || '').toUpperCase() === 'ACTIVE', image: null, texture: this.textureKey(cape.url) }); urls.push(cape.url);
    }
    for (let i = 0; i < capes.length; i += 4) await Promise.all(capes.slice(i, i + 4).map(async (cape, offset) => { cape.image = await preview(urls[i + offset], true); }));
    let skinImage = await preview(skin?.url, false);
    let variant = String(skin?.variant || '').toLowerCase() === 'slim' ? 'slim' : 'classic';
    if (!skinImage) {
      try { const publicSkin = await this.publicProfile(uuid); skinImage = publicSkin.skin; variant = publicSkin.variant; }
      catch { warnings.push('Skin preview is unavailable. Your online appearance was not changed.'); }
    }
    let activeCape = capes.find(c => c.active);
    let equippedCape = activeCape ? { image: activeCape.image, name: activeCape.name, texture: activeCape.texture } : null;
    let capeEquipped = Boolean(activeCape);
    if (!activeCape) {
      try {
        const publicAppearance = await this.publicProfile(uuid);
        equippedCape = publicAppearance.equippedCape; capeEquipped = publicAppearance.capeEquipped;
        if (equippedCape) {
          const match = capes.find(c => c.texture && c.texture === equippedCape.texture);
          if (match) { match.active = true; activeCape = match; equippedCape.name = match.name; }
          else warnings.push('An equipped Java cape is visible in your public profile but missing from Minecraft’s authenticated cape list. Its preview is shown; selecting it requires Minecraft to return its owned cape ID.');
        }
      } catch { /* The authenticated ownership list remains usable without the public preview. */ }
    }
    return { uuid, name: String(raw.name || '').slice(0, 16), skin: skinImage, variant, capeId: activeCape?.id || '', capes, equippedCape, capeEquipped, ownedCapesLoaded: true, source: 'Minecraft account profile', warnings: [...new Set(warnings)] };
  }
  async list(uuid) {
    if (!UUID.test(uuid)) throw new Error('Choose a signed-in account.');
    await guard(this.root, this.file, true);
    try {
      const stat = await fs.stat(this.file); if (stat.size > 20 * 1024 ** 2) throw new Error('Skin loadout storage exceeds its limit.');
      const data = JSON.parse(await fs.readFile(this.file, 'utf8'));
      if (data.schema !== 1 || !Array.isArray(data.items) || data.items.length > 100) throw new Error('Skin loadout format is unsupported or damaged.');
      return data.items.filter(i => i.uuid === uuid).map(i => this.clean(i));
    } catch (e) { if (e.code === 'ENOENT') return []; throw e; }
  }
  clean(i) {
    if (!ID.test(i.id || '') || !UUID.test(i.uuid || '') || !['classic', 'slim'].includes(i.variant) || typeof i.skin !== 'string' || !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(i.skin) || i.skin.length > 180000 || !(i.cape === 'keep' || i.cape === '' || CAPE_ID.test(i.cape || ''))) throw new Error('A saved skin loadout is invalid.');
    const bytes = Buffer.from(i.skin.split(',')[1], 'base64');
    const skin = this.png(bytes);
    if (i.variant === 'slim' && bytes.readUInt32BE(20) === 32) throw new Error('Legacy 64×32 skins require Classic arms. Choose Classic or use a modern 64×64 skin.');
    return { id: i.id, uuid: i.uuid, name: String(i.name || 'Skin loadout').replace(/[\p{Cc}]/gu, '').trim().slice(0, 40) || 'Skin loadout', variant: i.variant, skin, cape: i.cape, createdAt: String(i.createdAt || '').slice(0, 30) };
  }
  async save(uuid, input) {
    await this.list(uuid);
    let items = [];
    try { items = JSON.parse(await fs.readFile(this.file, 'utf8')).items; } catch (e) { if (e.code !== 'ENOENT') throw e; }
    if (items.length >= 100 || items.filter(i => i.uuid === uuid).length >= 30) throw new Error('Keep up to 30 loadouts per account and 100 overall.');
    const item = this.clean({ ...input, id: crypto.randomUUID(), uuid, createdAt: new Date().toISOString() });
    items.unshift(item); await this.write(items); return this.list(uuid);
  }
  async write(items) {
    await guard(this.root, this.file, true);
    const temp = path.join(this.root, `skin-loadouts-${crypto.randomUUID()}.tmp`);
    try { await fs.writeFile(temp, JSON.stringify({ schema: 1, items }), { flag: 'wx' }); await fs.rename(temp, this.file); }
    finally { await fs.unlink(temp).catch(() => {}); }
  }
  async remove(uuid, id) {
    await this.list(uuid);
    const data = JSON.parse(await fs.readFile(this.file, 'utf8'));
    await this.write(data.items.filter(i => !(i.uuid === uuid && i.id === id))); return this.list(uuid);
  }
  async importFile(file) {
    const stat = await plain(file);
    if (!stat.isFile() || stat.size > 128 * 1024 || !/\.png$/i.test(file)) throw new Error('Choose a PNG skin under 128 KB.');
    return this.png(await fs.readFile(file));
  }
  async cape(token, profile, id) {
    if (id !== '' && !profile.capes.some(c => c.id === id)) throw new Error('That cape is not owned by this account.');
    await service(token, '/capes/active', id ? 'PUT' : 'DELETE', id ? JSON.stringify({ capeId: id }) : undefined);
  }
  async apply(token, uuid, id) {
    const item = (await this.list(uuid)).find(i => i.id === id);
    if (!item) throw new Error('That loadout no longer exists.');
    const profile = await this.profile(token, uuid);
    if (item.cape !== 'keep' && item.cape !== '' && !profile.capes.some(c => c.id === item.cape)) throw new Error('This loadout refers to a cape the account no longer owns.');
    const form = new FormData(); form.set('variant', item.variant); form.set('file', new Blob([Buffer.from(item.skin.split(',')[1], 'base64')], { type: 'image/png' }), 'skin.png');
    await service(token, '/skins', 'POST', form);
    if (item.cape !== 'keep') {
      try { await this.cape(token, profile, item.cape); }
      catch (e) { throw new Error(`Skin upload succeeded, but cape selection was not confirmed. ${e.message}`); }
    }
  }
}
module.exports = { Appearance, service };
