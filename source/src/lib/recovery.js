const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { createReadStream } = require('node:fs');

const ROOTS = ['saves', 'mods', 'config', 'resourcepacks', 'shaderpacks', 'options.txt', 'session-profiles.json', 'servers.dat', '.sloth-default-resourcepacks.json', '.sloth-modpack.json', 'defaultconfigs', 'kubejs', 'scripts'];
const KEY = /^[a-f0-9-]{36}$/;
async function digest(file) {
  const hash = crypto.createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}
async function plain(file) {
  const stat = await fs.lstat(file);
  if (stat.isSymbolicLink()) throw new Error('Recovery does not follow linked folders or files.');
  return stat;
}
async function walk(root, relative = '') {
  const stat = await plain(path.join(root, relative));
  if (stat.isFile()) return [relative];
  if (!stat.isDirectory()) throw new Error('Unsupported file in recovery data.');
  const files = [];
  for (const name of await fs.readdir(path.join(root, relative))) files.push(...await walk(root, path.join(relative, name)));
  return files;
}
class Recovery {
  constructor(root) { this.root = path.join(root, 'restore-points'); }
  async init() { await fs.mkdir(this.root, { recursive: true }); await plain(this.root); }
  async list() {
    await this.init();
    const points = [];
    for (const id of await fs.readdir(this.root)) {
      if (!KEY.test(id)) continue;
      try {
        const m = await this.read(id);
        points.push({ id, label: m.label, name: m.name, instanceId: m.instanceId, automatic: m.automatic === true, scope: m.scope || 'setup', createdAt: m.createdAt, bytes: m.bytes, groups: [...new Set(m.files.map(f=>String(f.path||f.name||'').split(/[\\/]/)[0]).filter(Boolean))], count: m.files.length });
      } catch { /* Interrupted or damaged snapshots are never offered for restore. */ }
    }
    return points.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  async read(id) {
    if (typeof id !== 'string' || !KEY.test(id)) throw new Error('Invalid restore point.');
    await plain(path.join(this.root, id));
    const file = path.join(this.root, id, 'manifest.json');
    await plain(file);
    const m = JSON.parse(await fs.readFile(file, 'utf8'));
    if (m.schema !== 1 || !Array.isArray(m.files) || !Number.isSafeInteger(m.bytes) || m.bytes < 0 || typeof m.name !== 'string' || typeof m.createdAt !== 'string') throw new Error('Invalid restore point metadata.');
    return m;
  }
  async create(source, instance, label, progress = () => {}, { worldsOnly = false, automatic = false, maxBytes = Infinity, signal, roots } = {}) {
    await this.init();
    await plain(path.dirname(source));
    try { await plain(source); } catch (error) {
      if (error.code === 'ENOENT') throw new Error('This instance has no game data yet. Launch Minecraft first.');
      throw error;
    }
    const planned = [];
    let requiredBytes = 0;
    progress({ label: 'Scanning your setup', done: 0, total: 0 });
    const chosen = roots || (worldsOnly ? ['saves'] : ROOTS);
    for (const name of chosen) {
      const target = path.resolve(source, name);
      if (typeof name !== 'string' || !target.startsWith(path.resolve(source) + path.sep) || !ROOTS.includes(name.split(/[\\/]/)[0])) throw new Error('Invalid snapshot selection.');
      try { await fs.lstat(path.join(source, name)); } catch (error) { if (error.code === 'ENOENT') continue; throw error; }
      for (const relative of await walk(source, name)) {
        planned.push(relative);
        requiredBytes += (await fs.stat(path.join(source, relative))).size;
      }
    }
    if (!planned.length) { const error = new Error(worldsOnly ? 'No local worlds to back up in this instance yet.' : 'This instance has no game data yet. Launch Minecraft first.'); error.code = 'NO_GAME_DATA'; throw error; }
    if (requiredBytes > maxBytes) throw new Error('World data exceeds the automatic backup storage limit. Increase the limit or save a manual restore point.');
    await this.checkSpace(this.root, requiredBytes);
    const id = crypto.randomUUID();
    const stage = path.join(this.root, id + '.partial');
    await fs.mkdir(stage);
    const files = [];
    let bytes = 0;
    try {
      for (const relative of planned) {
        if (signal?.aborted) throw new Error('Cancelled.');
        await plain(path.join(source, relative));
        const target = path.join(stage, 'data', relative);
        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.copyFile(path.join(source, relative), target, 1);
        const size = (await fs.stat(target)).size;
        files.push({ path: relative, size, sha256: await digest(target) });
        bytes += size;
        if (files.length % 20 === 0 || files.length === planned.length) progress({ label: 'Saving restore point', done: files.length, total: planned.length });
      }
    const manifest = { schema: 1, label: String(label || 'Before changes').trim().slice(0, 64), name: instance.name, notes: instance.notes || '', tags: instance.tags || [], instanceId: instance.id, launch: instance.launch || null, scope: worldsOnly ? 'worlds' : 'setup', automatic, createdAt: new Date().toISOString(), gameVersion: instance.gameVersion, mods: instance.mods, pack: instance.pack || null, bytes, files };
    await fs.writeFile(path.join(stage, 'manifest.json'), JSON.stringify(manifest));
    await fs.rename(stage, path.join(this.root, id));
    return id;
    } catch (error) {
      // This exact directory was created by this operation under our recovery root.
      await fs.rm(stage, { recursive: true, force: true }).catch(() => {});
      throw error;
    }
  }
  async checkSpace(folder, bytes) {
    const disk = await fs.statfs(folder);
    if (disk.bavail * disk.bsize < bytes + 64 * 1024 ** 2) throw new Error('Not enough free disk space for this copy. Free up space and try again.');
  }
  async pruneAutomatic({ keep, maxBytes }) {
    const points = (await this.list()).filter(p => p.automatic);
    const counts = new Map(); let bytes = 0;
    for (const point of points) {
      const count = (counts.get(point.instanceId) || 0) + 1;
      counts.set(point.instanceId, count); bytes += point.bytes;
      if (count > keep || bytes > maxBytes) {
        // read validates the UUID and directory; only automatic points can be removed here.
        const m = await this.read(point.id);
        if (m.automatic !== true) continue;
        const target = path.resolve(this.root, point.id);
        if (path.dirname(target) !== path.resolve(this.root)) throw new Error('Invalid backup directory.');
        await fs.rm(target, { recursive: true });
      }
    }
  }
  async restore(id, manager, progress = () => {}) {
    await this.init();
    const m = await this.read(id);
    if (m.gameVersion !== manager.gameVersion) throw new Error('This restore point uses another Minecraft version.');
    const source = path.join(this.root, id, 'data');
    await plain(source);
    // Validate every file before publishing a new instance. The existing instance is never overwritten.
    const actual = new Set(await walk(source));
    let done = 0;
    let bytes = 0;
    for (const file of m.files) {
      if (typeof file.path !== 'string' || !actual.has(file.path) || !ROOTS.includes(file.path.split(/[\\/]/)[0])) throw new Error('Restore point contains an invalid path.');
      if (await digest(path.join(source, file.path)) !== file.sha256) throw new Error('Restore point is damaged. Your current instance is unchanged.');
      actual.delete(file.path);
      bytes += (await fs.stat(path.join(source, file.path))).size;
      done++;
      if (done % 20 === 0 || done === m.files.length) progress({ label: 'Checking restore point', done, total: m.files.length });
    }
    if (actual.size) throw new Error('Restore point contains unexpected files.');
    const newId = 'restored-' + crypto.randomBytes(8).toString('hex');
    const destination = manager.instancePath(newId);
    await plain(path.dirname(destination));
    await this.checkSpace(path.dirname(destination), bytes);
    await fs.mkdir(destination);
    try {
    done = 0;
    for (const file of m.files) {
      const target = path.join(destination, file.path);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.copyFile(path.join(source, file.path), target, 1);
      if (await digest(target) !== file.sha256) throw new Error('A restored file failed verification. The new instance was not activated.');
      done++;
      if (done % 20 === 0 || done === m.files.length) progress({ label: 'Restoring new instance', done, total: m.files.length });
    }
    const item = { id: newId, name: `${m.name.slice(0, 22)} restored`, notes: typeof m.notes === 'string' ? m.notes.slice(0, 2000) : '', tags: Array.isArray(m.tags) ? m.tags.filter(x => typeof x === 'string').slice(0, 8).map(x => x.slice(0, 24)) : [], createdAt: new Date().toISOString(), gameVersion: manager.gameVersion, launch: require('./instances').cleanLaunch(m.launch), pack: require('./instances').cleanPack(m.pack), mods: { ...manager.defaultMods, ...m.mods } };
    const previous = manager.value;
    manager.value = { activeId: newId, instances: [...previous.instances, item] };
    try { manager.save(); } catch (error) { manager.value = previous; throw error; }
    return item;
    } catch (error) {
      await fs.rm(destination, { recursive: true, force: true }).catch(() => {});
      throw error;
    }
  }
}
function diagnose(lines) {
  const rules = [
    [/SELF_SIGNED_CERT_IN_CHAIN|DEPTH_ZERO_SELF_SIGNED_CERT|CERT_HAS_EXPIRED|UNABLE_TO_VERIFY_LEAF_SIGNATURE|PKIX path building failed|unable to find valid certification path/i, 'A secure connection could not verify its certificate', 'Check system date and time, then run Toolbox connection checks. Review VPN/proxy or managed-network certificate settings with the administrator. Unexpected redirects can also come from hosts-file overrides. Keep certificate verification enabled; do not install a certificate from an unknown source.'],
    [/Failed to extract natives|UnsatisfiedLinkError|Native library.*already loaded|being used by another process/i, 'A native game library could not load', 'Close the affected Minecraft session normally and retry. Check Game Log for a locked, missing or incompatible library. Repair managed files after the game is closed. Do not force-close unrelated Java applications.'],
    [/Pixel format not accelerated|Failed to set display mode|Could not set video mode/i, 'The display or graphics mode could not start', 'Try a windowed launch and verify that Minecraft uses the intended GPU. Update drivers from your GPU manufacturer. Do not download replacement native libraries from unofficial fix sites.'],
    [/XSTS.*(?:2148916233|2148916238)|Multiplayer is disabled|multiplayer.*disabled.*account|Minecraft Family Account Required/i, 'Microsoft account permissions need review', 'Review Xbox/Microsoft family and multiplayer permissions with the account owner or family organizer. Signing in again does not bypass these restrictions. Sloth never needs your Microsoft password, recovery code or an email verification code in chat.'],
    [/Checksum mismatch|Size mismatch|Download exceeds size limit|Blocked unsafe artifact|Blocked download from untrusted/i, 'A managed download failed its safety checks', 'Retry from Download Center on a trusted connection, or use Game Care → Repair. Keep integrity and HTTPS checks enabled. An interrupted download may be the cause; this message alone does not prove tampering.'],
    [/Caught error loading resourcepacks|Failed to reload resource packs|Resource reload failed/i, 'A resource pack failed to reload', 'Open Game Care → Resource packs. Disable the most recently added pack and check its version warnings. Minecraft may have automatically deselected the packs.'],
    [/class_10151.*|Shader compilation failed|Could not compile shader/i, 'A shader may be incompatible', 'Check resource-pack core shaders and shader packs against this Minecraft version. A shader error can prevent the entire resource reload.'],
    [/OutOfMemoryError|Java heap space|GC overhead limit/i, 'Minecraft ran out of memory', 'Close other memory-heavy apps, then increase Minecraft memory in Settings if your computer has room.'],
    [/Incompatible mods found|Mod resolution encountered an incompatible mod set|requires version .* which is missing/i, 'A mod dependency or version does not match', 'Check the dependency details in Game Log. Remove the recently added mod or install the Fabric version for this Minecraft release.'],
    [/UnsupportedClassVersionError|compiled by a more recent version/i, 'The selected Java version is too old', 'Clear the custom Java selection in Settings to use the bundled runtime.'],
    [/GLFW error 65542|does not support OpenGL|Failed to create.*OpenGL/i, 'Minecraft could not initialize graphics', 'Update your graphics driver from your GPU manufacturer, restart Windows, then try again.'],
    [/MixinApplyError|MixinTransformerError|InjectionError/i, 'A mod failed while changing game code', 'Try a separate copy of this instance with recent mods removed. The log may identify the failing mod; this does not prove that it is the only cause.'],
    [/There is insufficient memory for the Java Runtime|Could not reserve enough space/i, 'Java could not reserve memory', 'Lower the Minecraft memory allocation in Settings and close background apps.'],
    [/No space left on device|There is not enough space on the disk/i, 'Storage is full', 'Free storage or use Toolbox to preview old temporary downloads. Preserve your worlds and backups.'],
    [/AccessDeniedException|Permission denied/i, 'A file could not be accessed', 'Close other clients and check folder permissions or security software. Do not delete your world to resolve an access error.'],
    [/ZipException|invalid LOC header|zip END header not found/i, 'An archive may be damaged', 'Use Game Care to repair managed downloads. For a personal mod or pack, download a fresh copy from its original provider.'],
    [/Invalid session|Failed to verify username|Authentication servers are down/i, 'Account or authentication connection failed', 'Try signing in again with the account control. If the service is unavailable, wait and use Toolbox connection checks.'],
    [/UnknownHostException|ConnectException|SocketTimeoutException/i, 'A connection could not be completed', 'Run Toolbox connection checks and check the server address. Public services passing does not establish that a particular server is reachable.']
  ];
  const actions = ['toolbox', 'care', 'settings', 'home', 'downloads', 'care', 'care', 'settings', 'mods', 'settings', 'care', 'instances', 'settings', 'toolbox', 'instances', 'care', 'home', 'toolbox'];
  const findings = rules.flatMap(([pattern, title, advice], index) => {
    const matched = lines.find(line => pattern.test(line));
    if (!matched) return [];
    return [{ title, advice, confidence: 'Recognized error pattern', evidence: require('./report-privacy').scrub(matched).slice(0, 240), action: actions[index] }];
  });
  for(const [pattern,title,advice] of [
    [/Duplicate versions? for mod|duplicate mod|non-unique mod id/i,'More than one copy of a mod was found','Open Mod Manager and compare versions. Disable the extra personal copy; keep the original files until the setup works.'],
    [/NoSuchMethodError|NoSuchFieldError|ClassNotFoundException|NoClassDefFoundError/i,'A mod or library may not match this version','Review the named mod and its dependencies in Mod Manager. Test changes in a duplicate instance so your current setup is preserved.'],
    [/EXCEPTION_ACCESS_VIOLATION|A fatal error has been detected by the Java Runtime/i,'Java stopped outside the normal game error handler','Review graphics drivers and the selected Java runtime. Try the managed Java runtime and a duplicate instance without recently added native or rendering mods. This pattern alone does not identify the faulty component.']
  ]) {const line=lines.find(v=>pattern.test(v) && !(
      /\[WARN\]/.test(v) && /Error loading class: mezz\/jei\/fabric\/platform\/RenderHelper \(java\.lang\.ClassNotFoundException: mezz\/jei\/fabric\/platform\/RenderHelper\)/.test(v) &&
      lines.some(context=>/\[WARN\]/.test(context) && /@Mixin target mezz\.jei\.fabric\.platform\.RenderHelper was not found appleskin\.jei\.mixins\.json:JEIRenderHelperMixin from mod appleskin/.test(context))
    ));if(line)findings.push({title,advice,confidence:'Recognized error pattern',evidence:require('./report-privacy').scrub(line).slice(0,240),action:title.startsWith('Java')?'settings':'mods'});}
  return findings;
}
module.exports = { Recovery, diagnose };
