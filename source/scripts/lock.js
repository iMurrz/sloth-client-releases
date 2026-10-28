#!/usr/bin/env node
// Pins everything the launcher downloads, so what players install is decided by this signed release rather
// than by whatever an upstream server returns on the day:
//   src/lib/game/game-lock.json  Minecraft version JSON (sha1), the full Fabric profile with every library
//                                hash-checked against Maven, and Mojang's Java runtime manifests (sha1).
//   src/lib/game/mods-lock.json  Modrinth mods: exact files + sha512.
// Everything else (libraries, client jar, assets, Java files) is hash-chained from these pinned values.
// Run `npm run lock` when bumping the game, loader or mods.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const config = require('../src/lib/config');

const API = 'https://api.modrinth.com/v2';
const GAME = config.game.version;
const LOADER = config.game.fabricLoader;
const CATALOG = [
  { slug: 'fabric-api', category: 'required', name: 'Fabric API', description: 'Library the Sloth Client mod is built on.' },
  { slug: 'sodium', category: 'performance', defaultEnabled: true, name: 'Sodium', description: 'Modern rendering engine. Usually doubles FPS or more.' },
  { slug: 'lithium', category: 'performance', defaultEnabled: true, name: 'Lithium', description: 'Faster game logic, physics and chunk handling.' },
  { slug: 'ferrite-core', category: 'performance', defaultEnabled: true, name: 'FerriteCore', description: 'Cuts memory use substantially.' },
  { slug: 'immediatelyfast', category: 'performance', defaultEnabled: true, name: 'ImmediatelyFast', description: 'Speeds up HUD, text and entity rendering.' },
  { slug: 'entityculling', category: 'performance', defaultEnabled: true, name: 'Entity Culling', description: 'Skips rendering entities and block entities you cannot see.' },
  { slug: 'dynamic-fps', category: 'performance', defaultEnabled: true, name: 'Dynamic FPS', description: 'Lowers FPS while the game is in the background.' },
  { slug: 'sodium-extra', category: 'performance', defaultEnabled: true, name: 'Sodium Extra', description: 'More video options: fog, particles, animations, FPS counter.' },
  { slug: 'reeses-sodium-options', category: 'performance', defaultEnabled: true, name: "Reese's Sodium Options", description: 'A cleaner, searchable video settings screen.' },
  { slug: 'moreculling', category: 'performance', defaultEnabled: true, name: 'More Culling', description: 'Skips rendering more hidden faces (leaves, glass, item frames).' },
  { slug: 'viafabricplus', category: 'optional', defaultEnabled: true, name: 'ViaFabricPlus', description: 'Join servers on any Minecraft version (1.8, 1.12, Bedrock...). Pick a version, or Auto, with the button in Multiplayer.' },
  { slug: 'appleskin', category: 'optional', defaultEnabled: true, name: 'AppleSkin', description: 'Shows hunger and saturation restored by food.' },
  { slug: 'continuity', category: 'optional', defaultEnabled: true, name: 'Continuity', description: 'Connected textures for resource packs that support them.' },
  { slug: 'betterf3', category: 'optional', defaultEnabled: false, name: 'BetterF3', description: 'A cleaner, colourful, customizable F3 debug screen.' },
  { slug: '3dskinlayers', category: 'optional', defaultEnabled: false, name: '3D Skin Layers', description: 'Renders the outer skin layer in 3D.' },
  { slug: 'iris', category: 'optional', defaultEnabled: false, name: 'Iris Shaders', description: 'Shader pack support. Switches Sodium to the build Iris supports. Heavy on GPUs.' },
  { slug: 'modmenu', category: 'optional', defaultEnabled: false, name: 'Mod Menu', description: 'Adds a Mods button to browse and configure mods.' },
  { slug: 'rei', category: 'optional', defaultEnabled: false, name: 'Roughly Enough Items', description: 'Item list with recipes and search next to your inventory.' },
  { slug: 'litematica', category: 'optional', defaultEnabled: false, name: 'Litematica', description: 'Schematic overlays for building (with MaLiLib).' },
  { slug: 'krypton', category: 'optional', defaultEnabled: false, name: 'Krypton', description: 'Optimizes the networking stack.' },
  { slug: 'simple-voice-chat', category: 'optional', defaultEnabled: false, name: 'Simple Voice Chat', description: 'Proximity voice chat (the server needs the plugin too).' },
  { slug: 'replaymod', category: 'optional', defaultEnabled: false, name: 'Replay Mod', description: 'Record and replay your gameplay.' },
  { slug: 'worldedit-cui', category: 'optional', defaultEnabled: true, name: 'WorldEdit CUI', description: 'Shows WorldEdit selection outlines. Requires WorldEdit on the server and permission to use it. Configure colors through Mod Menu.' },
  { slug: 'flat-items', category: 'optional', defaultEnabled: true, name: '2D Items · Flat Items', description: 'Dropped items face the camera in a flat retro style. Configure billboard and 3D-model options through Mod Menu.' },
  { slug: 'complementary-reimagined', kind: 'shader', category: 'shader', defaultEnabled: false, name: 'Complementary Reimagined', description: 'Beautiful, balanced shaders. Turns on Iris.', dependencies: ['iris'] },
  { slug: 'makeup-ultra-fast-shaders', kind: 'shader', category: 'shader', defaultEnabled: false, name: 'MakeUp Ultra Fast', description: 'Lightweight shaders for lower-end PCs. Turns on Iris.', dependencies: ['iris'] },
  { slug: 'faithful-64x', kind: 'resourcepack', category: 'resourcepack', defaultEnabled: false, name: 'Faithful 64x', description: 'Classic textures in 64x detail. Select it in Options > Resource Packs.' }
];
const LOADER_FOR = { mod: 'fabric', shader: 'iris', resourcepack: 'minecraft' };
const JAVA_INDEX = 'https://launchermeta.mojang.com/v1/products/java-runtime/2ec0cc96c44e5a76b9c8b7c39df7210883d12871/all.json';
const JAVA_PLATFORMS = ['windows-x64', 'windows-arm64', 'mac-os', 'mac-os-arm64', 'linux'];

const ua = { 'User-Agent': 'sloth-launcher/lock (community launcher)' };
async function get(url) {
  const res = await fetch(url, { headers: ua });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res;
}
const getJson = async url => (await get(url)).json();
const getText = async url => (await get(url)).text();
const getBytes = async url => Buffer.from(await (await get(url)).arrayBuffer());
const sha = (algo, data) => crypto.createHash(algo).update(data).digest('hex');
const write = (name, data) => {
  const out = path.join(__dirname, '..', 'src', 'lib', 'game', name);
  fs.writeFileSync(out, `${JSON.stringify(data, null, 2)}\n`);
  return path.relative(process.cwd(), out);
};

// ---------- game: Minecraft + Fabric + Java ----------
function mavenPath(name) {
  const [group, artifact, version, classifier] = name.split(':');
  return `${group.replace(/\./g, '/')}/${artifact}/${version}/${artifact}-${version}${classifier ? `-${classifier}` : ''}.jar`;
}

async function lockGame() {
  const manifest = await getJson('https://piston-meta.mojang.com/mc/game/version_manifest_v2.json');
  const entry = manifest.versions.find(v => v.id === GAME);
  if (!entry) throw new Error(`Minecraft ${GAME} not found`);
  const versionText = await getText(entry.url);
  if (sha('sha1', versionText) !== entry.sha1) throw new Error('Version JSON hash mismatch');
  const version = JSON.parse(versionText);

  const profile = await getJson(`https://meta.fabricmc.net/v2/versions/loader/${GAME}/${LOADER}/profile/json`);
  if (profile.inheritsFrom !== GAME) throw new Error(`Fabric profile is for ${profile.inheritsFrom}`);
  for (const lib of profile.libraries) {
    const url = `${lib.url.replace(/\/?$/, '/')}${mavenPath(lib.name)}`;
    if (!url.startsWith('https://maven.fabricmc.net/')) throw new Error(`Unexpected Fabric library host: ${url}`);
    const bytes = await getBytes(url);
    const actual = sha('sha1', bytes);
    const published = (await getText(`${url}.sha1`)).trim().slice(0, 40);
    if (published !== actual || (lib.sha1 && lib.sha1 !== actual)) throw new Error(`Hash mismatch for ${lib.name}`);
    Object.assign(lib, { sha1: actual, size: bytes.length });
    console.log(`fabric lib       ${lib.name.padEnd(44)} ${actual}`);
  }

  const javaIndex = await getJson(JAVA_INDEX);
  const component = version.javaVersion?.component;
  const java = { component, manifests: {} };
  for (const platform of JAVA_PLATFORMS) {
    const runtime = javaIndex[platform]?.[component]?.[0];
    if (runtime) java.manifests[platform] = { url: runtime.manifest.url, sha1: runtime.manifest.sha1, version: runtime.version.name };
  }
  if (!java.manifests['windows-x64']) throw new Error(`No ${component} runtime for windows-x64`);
  console.log(`java runtime     ${component} ${java.manifests['windows-x64'].version}`);

  const lock = {
    gameVersion: GAME,
    generatedAt: new Date().toISOString(),
    versionJson: { url: entry.url, sha1: entry.sha1 },
    fabric: { loaderVersion: LOADER, profile },
    java
  };
  console.log(`minecraft        ${GAME} (${entry.sha1})\nWrote ${write('game-lock.json', lock)}\n`);
}

// ---------- mods: Modrinth ----------
async function latestVersion(idOrSlug, kind = 'mod') {
  const q = `loaders=${encodeURIComponent(JSON.stringify([LOADER_FOR[kind]]))}&game_versions=${encodeURIComponent(JSON.stringify([GAME]))}`;
  const versions = await getJson(`${API}/project/${idOrSlug}/version?${q}`);
  const pick = versions.find(v => v.version_type === 'release') || versions[0];
  if (!pick) throw new Error(`No ${LOADER_FOR[kind]} ${GAME} build for ${idOrSlug}`);
  return pick;
}

const fileInfo = file => ({ url: file.url, filename: file.filename, sha512: file.hashes.sha512, size: file.size });

async function lockMods() {
  const resolved = new Map(); // project_id -> entry

  async function resolve(idOrSlug, meta) {
    const kind = meta?.kind || 'mod';
    let version;
    try {
      version = await latestVersion(idOrSlug, kind);
    } catch (err) {
      if (meta && meta.category !== 'required') { console.warn(`  skip: ${idOrSlug} (${err.message})`); return null; }
      throw err;
    }
    if (resolved.has(version.project_id)) {
      const existing = resolved.get(version.project_id);
      if (meta) Object.assign(existing, meta);
      return existing;
    }
    const project = await getJson(`${API}/project/${version.project_id}`);
    const entry = {
      slug: project.slug,
      kind,
      name: meta?.name || project.title,
      description: meta?.description || project.description,
      category: meta?.category || 'dependency',
      defaultEnabled: meta?.defaultEnabled ?? true,
      version: version.version_number,
      versionId: version.id,
      file: fileInfo(version.files.find(f => f.primary) || version.files[0]),
      dependencies: [...(meta?.dependencies || [])]
    };
    resolved.set(version.project_id, entry);
    for (const dep of version.dependencies || []) {
      if (dep.dependency_type !== 'required' || !dep.project_id || kind !== 'mod') continue;
      const child = await resolve(dep.project_id);
      if (!child) continue;
      entry.dependencies.push(child.slug);
      // A dependency pinned to an exact build (e.g. Iris → the Sodium build it supports). The launcher swaps
      // that build in only while this mod is enabled, so everyone else keeps the newest version.
      if (dep.version_id && dep.version_id !== child.versionId) {
        const pinned = await getJson(`${API}/version/${dep.version_id}`);
        entry.pins = { ...entry.pins, [child.slug]: { version: pinned.version_number, versionId: pinned.id, file: fileInfo(pinned.files.find(f => f.primary) || pinned.files[0]) } };
      }
    }
    return entry;
  }

  for (const item of CATALOG) {
    const { slug, ...meta } = item;
    const entry = await resolve(slug, meta);
    if (entry) console.log(`${entry.slug.padEnd(26)} ${entry.version.slice(0, 30).padEnd(31)} ${entry.file.filename}`);
  }
  await pinCompanions(resolved);
  for (const entry of resolved.values()) {
    if (entry.category === 'dependency') console.log(`  dependency: ${entry.slug} ${entry.version}`);
    for (const [slug, pin] of Object.entries(entry.pins || {})) console.log(`  pin: ${entry.slug} uses ${slug} ${pin.version} while enabled`);
    for (const file of [entry.file, ...Object.values(entry.pins || {}).map(p => p.file)]) {
      if (!/^https:\/\/cdn\.modrinth\.com\//.test(file.url)) throw new Error(`Unexpected download host for ${entry.slug}`);
    }
  }
  const lock = { gameVersion: GAME, loader: 'fabric', generatedAt: new Date().toISOString(), mods: [...resolved.values()] };
  console.log(`Wrote ${lock.mods.length} mods to ${write('mods-lock.json', lock)}`);
}

// ---------- companion pins ----------
// When a mod pins an older dependency (Iris -> Sodium 0.8.7), other mods that depend on that dependency may need
// older builds too. Read each jar's real fabric.mod.json constraint and pin the newest build that fits.
const os = require('node:os');
const { openZip } = require('../src/lib/zip');
const { satisfies } = require('../src/lib/game/fabric-versions');

async function fabricMeta(file) {
  const tmp = path.join(os.tmpdir(), `sloth-lock-${file.hashes.sha512.slice(0, 16)}.jar`);
  if (!fs.existsSync(tmp)) {
    const bytes = await getBytes(file.url);
    if (sha('sha512', bytes) !== file.hashes.sha512) throw new Error(`Hash mismatch for ${file.filename}`);
    fs.writeFileSync(tmp, bytes);
  }
  const zip = await openZip(tmp);
  try {
    const entry = zip.entries.find(e => e.name === 'fabric.mod.json');
    return entry ? JSON.parse((await zip.read(entry)).toString('utf8')) : {};
  } finally {
    await zip.close();
  }
}

async function pinCompanions(resolved) {
  const entries = [...resolved.values()];
  for (const owner of entries) {
    for (const [pinnedSlug, pin] of Object.entries(owner.pins || {})) {
      const pinnedMeta = await fabricMeta({ url: pin.file.url, filename: pin.file.filename, hashes: { sha512: pin.file.sha512 } });
      const modId = pinnedMeta.id, pinnedVersion = pinnedMeta.version;
      for (const other of entries) {
        if (other === owner || other.slug === pinnedSlug || (other.kind || 'mod') !== 'mod') continue;
        const meta = await fabricMeta({ url: other.file.url, filename: other.file.filename, hashes: { sha512: other.file.sha512 } });
        const constraint = meta.depends?.[modId];
        if (constraint === undefined || satisfies(pinnedVersion, constraint)) continue;
        const q = `loaders=${encodeURIComponent('["fabric"]')}&game_versions=${encodeURIComponent(JSON.stringify([GAME]))}`;
        let found = null;
        for (const v of await getJson(`${API}/project/${other.slug}/version?${q}`)) {
          if (v.version_type !== 'release') continue;
          const file = v.files.find(f => f.primary) || v.files[0];
          if (satisfies(pinnedVersion, (await fabricMeta(file)).depends?.[modId])) { found = { v, file }; break; }
        }
        if (!found) throw new Error(`No ${other.slug} build works with ${modId} ${pinnedVersion} (needed while ${owner.slug} is on)`);
        owner.pins[other.slug] = { version: found.v.version_number, versionId: found.v.id, file: fileInfo(found.file) };
      }
    }
  }
}

(async () => {
  const only = process.argv[2];
  if (only !== 'mods') await lockGame();
  if (only !== 'game') await lockMods();
})().catch(err => { console.error(err); process.exit(1); });
