const { openZip } = require('./zip');
const { satisfies } = require('./game/fabric-versions');
const validId = id => typeof id === 'string' && /^[a-z][a-z0-9_-]{1,63}$/.test(id);
async function loaderLibraries(instanceDir, version) {
  if(!/^\d+\.\d+\.\d+$/.test(version))return [];
  const path=require('node:path');let zip;
  const root=path.resolve(instanceDir,'../..'),file=path.join(root,'libraries','net','fabricmc','fabric-loader',version,'fabric-loader-'+version+'.jar');
  try {
    await require('./file-tools').guard(root,file);
    zip=await openZip(file);const nodes=[];
    for(const entry of zip.entries.filter(e=>/^META-INF\/jars\/[^/]+\.jar$/.test(e.name)).slice(0,16)) {
      if(entry.uncompressedSize>16777216)continue;
      const graph=await readGraph(await zip.read(entry));nodes.push(...graph.nodes);
    }
    return nodes;
  }catch{return [];}finally{await zip?.close();}
}

async function readGraph(file) {
  const nodes = []; let bytes = 0, complete = true;
  async function visit(source, depth) {
    let zip;
    try {
      zip = await openZip(source);
      const entry = zip.entries.find(e => e.name === 'fabric.mod.json');
      if (!entry || entry.uncompressedSize > 262144) throw Error('Unreadable mod metadata');
      const meta = JSON.parse((await zip.read(entry)).toString('utf8'));
      if (!validId(meta.id)) throw Error('Invalid mod ID');
      nodes.push({ id: meta.id, version: String(meta.version || ''), provides: Array.isArray(meta.provides) ? meta.provides.filter(validId).slice(0, 100) : [], environment: meta.environment, topLevel: depth === 0 });
      for (const jar of Array.isArray(meta.jars) ? meta.jars : []) {
        const name = jar?.file;
        const nested = typeof name === 'string' && !name.includes('\\') && !name.split('/').some(p => !p || p === '..' || p === '.') && zip.entries.find(e => e.name === name);
        if (!nested || depth >= 3 || nodes.length >= 128 || nested.uncompressedSize > 16777216 || (bytes += nested.uncompressedSize) > 33554432) { complete = false; continue; }
        await visit(await zip.read(nested), depth + 1);
      }
    } catch { complete = false; }
    finally { await zip?.close(); }
  }
  await visit(file, 0);
  return { nodes, complete };
}

function resolve(mods, builtins, complete) {
  const available = new Map([...builtins].map(([id, version]) => [id, [{ version, name: id, topLevel: true }]]));
  for (const mod of mods.filter(m => m.enabled)) for (const node of mod.graph.nodes.filter(n => n.environment !== 'server')) {
    for (const id of [node.id, ...node.provides]) {
      const list = available.get(id) || []; list.push({ version: node.version, name: mod.name, topLevel: node.topLevel }); available.set(id, list);
    }
  }
  for (const mod of mods.filter(m => m.enabled)) {
    mod.dependencies = Object.entries(mod.meta.depends || {}).slice(0, 100).map(([id, range]) => {
      const found = available.get(id) || [];
      return { id, range: JSON.stringify(range).slice(0, 160), name: found[0]?.name || id,
        state: found.some(n => satisfies(n.version, range)) ? builtins.has(id) ? 'builtin' : 'present' : found.length ? 'mismatch' : complete ? 'missing' : 'unresolved' };
    });
    mod.dependencyNotices = mod.dependencies.filter(d => ['missing', 'unresolved', 'mismatch'].includes(d.state)).map(d =>
      `${d.state === 'missing' ? 'Missing required dependency' : d.state === 'mismatch' ? 'No inspected version matches' : 'Could not fully inspect dependency'}: ${d.id} ${d.range}. Review Mod Manager; Fabric makes the final decision.`);
    mod.blockers = [];
    if (mod.id && mods.filter(m => m.enabled && m.id === mod.id).length > 1) mod.blockers.push(`Duplicate ${mod.id}: disable one copy.`);
    for (const d of mod.dependencies) if (['minecraft','fabricloader'].includes(d.id) && d.state === 'mismatch') mod.blockers.push(`Requires ${d.id} ${d.range}; selected version is ${builtins.get(d.id)}.`);
    // Top-level aliases and built-in components are present just like ordinary mod IDs.
    // Nested candidates may be discarded by Fabric, so they do not create definite conflict blockers here.
    for (const [kind, declared] of [['Incompatible', mod.meta.breaks], ['Declared conflict', mod.meta.conflicts]]) {
      for (const [id, range] of Object.entries(declared || {}).slice(0, 100)) {
        for (const other of (available.get(id) || []).filter(node => node.topLevel && satisfies(node.version, range))) {
          const issue = `${kind}: ${other.name} ${other.version}. Choose compatible versions.`;
          if (!mod.issues.includes(issue)) mod.issues.push(issue);
          if (kind === 'Incompatible') {
            const blocker = `Declared incompatible with ${other.name} ${other.version}.`;
            if (!mod.blockers.includes(blocker)) mod.blockers.push(blocker);
          }
        }
      }
    }
    // Missing/nested version selection remains a warning: Loader overrides and optional nested candidates can alter the graph.
  }
}
module.exports = { readGraph, resolve, loaderLibraries };
