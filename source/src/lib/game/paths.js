const path = require('node:path');

/** Joins a metadata-supplied relative path under `base`, rejecting anything that escapes it. */
function safeJoin(base, rel) {
  // Apply Windows restrictions on every platform so portable archives stay safe on Windows too.
  if (typeof rel !== 'string' || !rel || /^[\\/]/.test(rel) || /[\x00-\x1f\x7f:]/.test(rel) ||
      rel.split(/[\\/]/).filter(Boolean).some(part => part === '.' || part === '..' || /[. ]$/.test(part) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) {
    throw new Error(`Unsafe path in game metadata: ${rel}`);
  }
  const root = path.resolve(base);
  const full = path.resolve(root, rel);
  if (full !== root && !full.startsWith(root + path.sep)) throw new Error(`Unsafe path in game metadata: ${rel}`);
  return full;
}

const COORD_PART = /^[A-Za-z0-9_.+-]+$/;

/** "group:artifact:version[:classifier][@ext]" → "group/path/artifact/version/artifact-version[-classifier].ext" */
function mavenPath(name) {
  const [coords, ext = 'jar'] = name.split('@');
  const [group, artifact, version, classifier] = coords.split(':');
  for (const part of [group, artifact, version, ext, classifier].filter(Boolean)) {
    if (!COORD_PART.test(part) || part.includes('..')) throw new Error(`Bad library coordinate: ${name}`);
  }
  if (!group || !artifact || !version) throw new Error(`Bad library coordinate: ${name}`);
  return `${group.replace(/\./g, '/')}/${artifact}/${version}/${artifact}-${version}${classifier ? `-${classifier}` : ''}.${ext}`;
}

/** Library identity without the version, so a loader's library replaces the game's copy of the same one. */
function libraryKey(name) {
  const [group, artifact, , classifier] = name.split('@')[0].split(':');
  return `${group}:${artifact}${classifier ? `:${classifier}` : ''}`;
}

function layout(root, instanceId = 'sloth') {
  if (!/^[a-z0-9][a-z0-9-]{0,31}$/.test(instanceId)) throw new Error('Invalid game instance id.');
  return {
    root,
    versions: path.join(root, 'versions'),
    libraries: path.join(root, 'libraries'),
    assets: path.join(root, 'assets'),
    runtime: path.join(root, 'runtime'),
    instance: path.join(root, 'instances', instanceId)
  };
}

module.exports = { safeJoin, mavenPath, libraryKey, layout };
