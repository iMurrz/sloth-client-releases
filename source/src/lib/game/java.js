const fsp = require('node:fs/promises');
const path = require('node:path');
const { safeJoin } = require('./paths');
const { pinnedJson } = require('./meta');

function platformKey() {
  if (process.platform === 'win32') return { x64: 'windows-x64', arm64: 'windows-arm64', ia32: 'windows-x86' }[process.arch];
  if (process.platform === 'darwin') return process.arch === 'arm64' ? 'mac-os-arm64' : 'mac-os';
  if (process.platform === 'linux') return process.arch === 'ia32' ? 'linux-i386' : 'linux';
  return undefined;
}

function javaExecutable(home) {
  if (process.platform === 'win32') return path.join(home, 'bin', 'javaw.exe');
  if (process.platform === 'darwin') return path.join(home, 'jre.bundle', 'Contents', 'Home', 'bin', 'java');
  return path.join(home, 'bin', 'java');
}

/**
 * Plans Mojang's own Java runtime so players never install Java themselves. The runtime manifest is pinned by
 * sha1 in game-lock.json, and every file in it carries its own sha1, so the whole runtime is hash-verified.
 */
async function planJavaRuntime(runtimeRoot, pinned, signal) {
  const key = platformKey();
  const entry = pinned.manifests[key];
  if (!entry) throw new Error(`This launcher build has no Java runtime for ${key || `${process.platform}/${process.arch}`}`);
  const home = path.join(runtimeRoot, pinned.component);
  const manifest = await pinnedJson(entry.url, path.join(runtimeRoot, `${pinned.component}.manifest.json`), entry.sha1, signal);
  const tasks = [];
  const links = [];
  const executables = [];
  for (const [rel, file] of Object.entries(manifest.files)) {
    const dest = safeJoin(home, rel);
    if (file.type === 'link') { links.push({ dest, target: file.target }); continue; }
    const raw = file.type === 'file' && file.downloads?.raw;
    if (!raw) continue;
    tasks.push({ url: raw.url, dest, sha1: raw.sha1, size: raw.size, group: 'java' });
    if (file.executable) executables.push(dest);
  }
  return {
    javaPath: javaExecutable(home),
    version: entry.version,
    tasks,
    async finalize() {
      if (process.platform === 'win32') return;
      for (const file of executables) await fsp.chmod(file, 0o755).catch(() => {});
      for (const { dest, target } of links) {
        await fsp.rm(dest, { force: true });
        await fsp.symlink(target, dest).catch(() => {});
      }
    }
  };
}

module.exports = { planJavaRuntime };
