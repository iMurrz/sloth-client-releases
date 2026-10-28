const { openZip } = require('../zip');

// Fabric's version predicates ("*", ">=1.2", "=0.8.14+mc1.21.11", "~1.2", "^1", space-separated AND, arrays OR),
// used to check what a mod's fabric.mod.json really requires.
function semantic(version) {
  // Fabric permits an empty prerelease suffix (e.g. 1.21-) and any number of core components.
  const match = String(version).match(/^(\d+(?:\.\d+)*)(?:-([-0-9A-Za-z]*(?:\.[-0-9A-Za-z]+)*))?(?:\+(.*))?$/);
  return match ? { core: match[1].split('.').map(Number), prerelease: match[2] } : null;
}

function compareVersions(a, b) {
  const pa = semantic(a), pb = semantic(b);
  if (!pa || !pb) return String(a) === String(b) ? 0 : String(a) < String(b) ? -1 : 1;
  for (let i = 0; i < Math.max(pa.core.length, pb.core.length); i++) {
    const difference = (pa.core[i] || 0) - (pb.core[i] || 0);
    if (difference) return difference;
  }
  if (pa.prerelease === pb.prerelease) return 0;
  if (pa.prerelease === undefined) return 1;
  if (pb.prerelease === undefined) return -1;
  const aa = pa.prerelease.split('.'), bb = pb.prerelease.split('.');
  for (let i = 0; i < Math.max(aa.length, bb.length); i++) {
    if (aa[i] === undefined) return -1;
    if (bb[i] === undefined) return 1;
    if (aa[i] === bb[i]) continue;
    const an = /^(?:0|[1-9]\d*)$/.test(aa[i]), bn = /^(?:0|[1-9]\d*)$/.test(bb[i]);
    if (an && bn) return Number(aa[i]) - Number(bb[i]);
    if (an !== bn) return an ? -1 : 1;
    return aa[i] < bb[i] ? -1 : 1;
  }
  return 0;
}

function satisfies(version, predicate) {
  if (predicate == null || predicate === '*') return true;
  if (Array.isArray(predicate)) return predicate.some(p => satisfies(version, p));
  return String(predicate).trim().split(/\s+/).every(part => {
    const m = part.match(/^(>=|<=|>|<|=|~|\^)?(.+)$/);
    if (!m || m[2] === '*') return true;
    // Match numeric components, including prereleases and repeated trailing wildcards (1.x.x).
    const wildcard = m[2].match(/^(\d+(?:\.\d+)*)(?:\.(?:x|X|\*))+$/);
    if ((!m[1] || m[1] === '=') && wildcard) {
      const prefix = wildcard[1].split('.').map(Number), actual = semantic(version);
      return Boolean(actual) && prefix.every((part, index) => (actual.core[index] || 0) === part);
    }
    const actual = semantic(version), required = semantic(m[2]);
    // Non-semantic versions use exact friendly-string equality for inclusive operators in Fabric.
    if (!actual || !required) return !['>', '<'].includes(m[1]) && String(version) === m[2];
    const c = compareVersions(version, m[2]);
    switch (m[1]) {
      case '>=': return c >= 0;
      case '<=': return c <= 0;
      case '>': return c > 0;
      case '<': return c < 0;
      case '~': return c >= 0 && actual.core[0] === required.core[0] && (actual.core[1] || 0) === (required.core[1] || 0);
      case '^': return c >= 0 && actual.core[0] === required.core[0];
      default: return c === 0;
    }
  });
}

/** fabric.mod.json of a jar ({} when missing or unreadable). */
async function readFabricMeta(jarPath) {
  let zip;
  try {
    zip = await openZip(jarPath);
    const entry = zip.entries.find(e => e.name === 'fabric.mod.json');
    return entry ? JSON.parse((await zip.read(entry)).toString('utf8')) : {};
  } catch {
    return {};
  } finally {
    await zip?.close();
  }
}

module.exports = { compareVersions, satisfies, readFabricMeta };
