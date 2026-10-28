const fsp = require('node:fs/promises');
const path = require('node:path');
const { download, fileMatches, runPool } = require('../http');
const { pinnedJson } = require('./meta');
const { allowed, wrongArchNative } = require('./rules');
const { safeJoin, mavenPath, libraryKey, layout } = require('./paths');
const { planJavaRuntime } = require('./java');
const { planMods } = require('./mods');
const gameLock = require('./game-lock.json');
const securityLibraries = require('./security-libraries.json');

const ASSET_HOST = 'https://resources.download.minecraft.net';
const TRUSTED_HOSTS = new Set([
  'piston-data.mojang.com', 'piston-meta.mojang.com', 'launcher.mojang.com', 'launchermeta.mojang.com',
  'libraries.minecraft.net', 'resources.download.minecraft.net', 'maven.fabricmc.net', 'cdn.modrinth.com', 'repo.maven.apache.org'
]);
const HASH = /^([0-9a-f]{40}|[0-9a-f]{128})$/;

/** Every download must come from a known host over HTTPS and carry a pinned hash. */
function assertSafeTask(task) {
  const { protocol, hostname, username, password, port } = new URL(task.url);
  if (protocol !== 'https:' || username || password || port || !TRUSTED_HOSTS.has(hostname)) throw new Error(`Blocked download from untrusted host: ${hostname}`);
  if (!HASH.test(task.sha512 || task.sha1 || '')) throw new Error(`Blocked unpinned download: ${path.basename(task.dest)}`);
}

function planLibraries(dirs, libraries) {
  const seen = new Set();
  const classpath = [];
  const tasks = [];
  // Loader libraries come first so they replace the game's copy of the same library.
  for (const lib of libraries) {
    if (!allowed(lib.rules) || wrongArchNative(lib.name)) continue;
    const key = libraryKey(lib.name);
    if (seen.has(key)) continue;
    seen.add(key);
    const artifact = lib.downloads?.artifact;
    const task = artifact
      ? { url: artifact.url, dest: safeJoin(dirs.libraries, artifact.path || mavenPath(lib.name)), sha1: artifact.sha1, sha512: artifact.sha512, size: artifact.size }
      : { url: `${lib.url.replace(/\/?$/, '/')}${mavenPath(lib.name)}`, dest: safeJoin(dirs.libraries, mavenPath(lib.name)), sha1: lib.sha1, size: lib.size };
    classpath.push(task.dest);
    tasks.push({ ...task, group: 'libraries' });
  }
  return { classpath, tasks };
}

async function planAssets(dirs, vanilla, signal) {
  const idx = vanilla.assetIndex;
  const index = await pinnedJson(idx.url, path.join(dirs.assets, 'indexes', `${idx.id}.json`), idx.sha1, signal);
  const tasks = [];
  const seen = new Set();
  for (const { hash, size } of Object.values(index.objects)) {
    if (!/^[0-9a-f]{40}$/.test(hash) || seen.has(hash)) continue;
    seen.add(hash);
    tasks.push({ url: `${ASSET_HOST}/${hash.slice(0, 2)}/${hash}`, dest: path.join(dirs.assets, 'objects', hash.slice(0, 2), hash), sha1: hash, size, group: 'assets' });
  }
  return tasks;
}

function throttle(fn, ms) {
  let last = 0;
  return (payload, force = false) => {
    const now = Date.now();
    if (force || now - last >= ms) { last = now; fn(payload); }
  };
}

/**
 * Makes sure Minecraft, Fabric, Java and mods are installed and verified, then returns a launch plan.
 * Everything is hash-chained from game-lock.json and mods-lock.json, which ship inside the launcher.
 * Executable content is hashed on every launch. `deep` also hashes non-executable assets.
 */
async function prepareGame({ root, instanceId = 'sloth', gameVersion, loaderVersion, modSettings, bundledMods = [], javaPath, standalone = false, deep = false, signal, onProgress = () => {} }) {
  if (gameLock.gameVersion !== gameVersion || gameLock.fabric.loaderVersion !== loaderVersion) {
    throw new Error(`This launcher build is locked to Minecraft ${gameLock.gameVersion} / Fabric ${gameLock.fabric.loaderVersion}`);
  }
  const dirs = layout(root, instanceId);
  const emit = throttle(onProgress, 100);
  emit({ stage: 'meta', label: 'Fetching game info' }, true);

  // Independent pinned metadata reads can overlap, including first-install downloads.
  const [vanilla, java, mods] = await Promise.all([
    pinnedJson(gameLock.versionJson.url, path.join(dirs.versions, gameVersion, `${gameVersion}.json`), gameLock.versionJson.sha1, signal),
    javaPath ? Promise.resolve(null) : planJavaRuntime(dirs.runtime, gameLock.java, signal),
    standalone ? Promise.resolve({ tasks: [], enabled: ['standalone-modpack'], finalize: async () => {} }) : planMods(dirs.instance, modSettings, bundledMods)
  ]);
  const fabric = gameLock.fabric.profile;
  const clientJar = path.join(dirs.versions, vanilla.id, `${vanilla.id}.jar`);
  const libs = planLibraries(dirs, [...securityLibraries.libraries, ...fabric.libraries, ...vanilla.libraries]);
  const assets = await planAssets(dirs, vanilla, signal);

  const byDest = new Map();
  const client = vanilla.downloads.client;
  for (const task of [
    ...(java?.tasks || []),
    { url: client.url, dest: clientJar, sha1: client.sha1, size: client.size, group: 'client' },
    ...libs.tasks, ...assets, ...mods.tasks
  ]) {
    assertSafeTask(task);
    byDest.set(task.dest, task);
  }
  const tasks = [...byDest.values()];

  let checked = 0;
  const missing = [];
  const checkLabel = deep ? 'Verifying game files' : 'Checking game files';
  const check = async task => {
    if (!(await fileMatches(task.dest, task, deep || task.group !== 'assets'))) missing.push(task);
    checked++;
    emit({ stage: 'check', label: checkLabel, done: checked, total: tasks.length });
  };
  // Asset stat checks and executable hashes use separate bounded lanes.
  if (deep) await runPool(tasks, 8, check, signal);
  else await Promise.all([
    runPool(tasks.filter(task => task.group === 'assets'), 24, check, signal),
    runPool(tasks.filter(task => task.group !== 'assets'), 4, check, signal)
  ]);

  const totalBytes = missing.reduce((sum, task) => sum + (task.size || 0), 0);
  let bytes = 0;
  let files = 0;
  const report = force => emit({ stage: 'download', label: 'Downloading game files', done: files, total: missing.length, bytes, totalBytes }, force);
  if (missing.length) report(true);
  await runPool(missing, 12, async task => {
    await download(task.url, task.dest, {
      sha1: task.sha1, sha512: task.sha512, size: task.size, signal,
      onBytes: n => { bytes += n; report(); }
    });
    files++;
    report();
  }, signal);

  emit({ stage: 'finalize', label: 'Preparing mods' }, true);
  await java?.finalize();
  await mods.finalize();
  await require('./fresh-options').initializeFreshOptions(dirs.instance,{standalone});
  const nativesDir = path.join(dirs.versions, fabric.id, 'natives');
  await fsp.mkdir(nativesDir, { recursive: true });

  return {
    profileId: fabric.id,
    gameVersion: vanilla.id,
    versionType: vanilla.type,
    mainClass: fabric.mainClass,
    javaPath: javaPath || java.javaPath,
    javaVersion: java?.version,
    classpath: [...libs.classpath, clientJar],
    jvmArgs: [...(vanilla.arguments?.jvm || []), ...(fabric.arguments?.jvm || [])],
    gameArgs: [...(vanilla.arguments?.game || []), ...(fabric.arguments?.game || [])],
    assetsDir: dirs.assets,
    assetIndex: vanilla.assetIndex.id,
    librariesDir: dirs.libraries,
    nativesDir,
    gameDir: dirs.instance,
    enabledMods: mods.enabled,
    downloaded: { files: missing.length, bytes }
  };
}

module.exports = { prepareGame };
