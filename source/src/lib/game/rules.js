const os = require('node:os');

const OS_NAME = { win32: 'windows', darwin: 'osx', linux: 'linux' }[process.platform];

function ruleMatches(rule, features) {
  if (rule.os) {
    if (rule.os.name && rule.os.name !== OS_NAME) return false;
    // Mojang's "x86" means a 32-bit JVM.
    if (rule.os.arch && !(rule.os.arch === 'x86' ? process.arch === 'ia32' : rule.os.arch === process.arch)) return false;
    if (rule.os.version && !new RegExp(rule.os.version).test(os.release())) return false;
  }
  if (rule.features) {
    for (const [key, value] of Object.entries(rule.features)) if (Boolean(features[key]) !== value) return false;
  }
  return true;
}

/** Mojang rule lists: no rules means allowed; otherwise the last matching rule decides. */
function allowed(rules, features = {}) {
  if (!Array.isArray(rules) || rules.length === 0) return true;
  let result = false;
  for (const rule of rules) if (ruleMatches(rule, features)) result = rule.action === 'allow';
  return result;
}

/** Natives for other CPU architectures are allowed by the rules but never loaded; skip downloading them. */
function wrongArchNative(name) {
  const classifier = name.split(':')[3] || '';
  if (!classifier.startsWith('natives-')) return false;
  if (classifier.endsWith('-arm64')) return process.arch !== 'arm64';
  if (classifier.endsWith('-x86')) return process.arch !== 'ia32';
  return false;
}

/** Expands an `arguments.game` / `arguments.jvm` list into strings, applying rules and ${} substitutions. */
function expandArguments(list, vars, features) {
  const out = [];
  const sub = value => value.replace(/\$\{([a-zA-Z_]+)\}/g, (match, key) => (key in vars ? String(vars[key]) : match));
  for (const entry of list || []) {
    if (typeof entry === 'string') { out.push(sub(entry)); continue; }
    if (!allowed(entry.rules, features)) continue;
    for (const value of [].concat(entry.value)) out.push(sub(value));
  }
  return out;
}

module.exports = { allowed, expandArguments, wrongArchNative, OS_NAME };
