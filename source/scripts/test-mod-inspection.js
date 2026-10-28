const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { archive } = require('./fixtures/zip.cjs');
const { inspect } = require('../src/lib/mod-manager');
const { diagnose } = require('../src/lib/recovery');

(async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sloth-inspection-'));
  try {
    assert.ok(await inspect(root, '1.21.11', '0.18.4'));
    await fs.mkdir(path.join(root, 'mods'));
    await fs.writeFile(path.join(root, 'mods', 'fixture.jar'), archive([
      ['fabric.mod.json', JSON.stringify({schemaVersion: 1, id: 'inspection_fixture', version: '1.0.0', depends: { java: '>=21' }})]
    ]));
    const defaults = await inspect(root, '1.21.11', '0.18.4');
    assert.equal(defaults.mods[0].issues.length, 0);
    const oldJava = await inspect(root, '1.21.11', '0.18.4', {javaVersion: '17', standalone: true});
    assert.ok(oldJava.mods[0].issues.some(issue => /Requires java/.test(issue)));
    const currentJava = await inspect(root, '1.21.11', '0.18.4', {javaVersion: '21'});
    assert.equal(currentJava.mods[0].issues.length, 0);
    await fs.writeFile(path.join(root, 'mods', 'rei-fixture.jar'), archive([
      ['fabric.mod.json', JSON.stringify({schemaVersion:1,id:'roughlyenoughitems',version:'21.11.816',depends:{minecraft:'~1.21-',architectury:'>=15.0.2'},jars:[{file:'META-INF/jars/library.jar'}]})],
      ['META-INF/jars/library.jar', archive([['fabric.mod.json', JSON.stringify({schemaVersion:1,id:'architectury',version:'19.0.1'})]])]
    ]));
    const rei = (await inspect(root, '1.21.11', '0.19.5')).mods.find(mod => mod.id === 'roughlyenoughitems');
    assert.equal(rei.compatibility.state, 'checked');
    assert.equal(rei.dependencyNotices.length, 0);
    assert.equal(rei.dependencies.find(dep => dep.id === 'architectury').state, 'present');
    const wrongGame = (await inspect(root, '1.22', '0.19.5')).mods.find(mod => mod.id === 'roughlyenoughitems');
    assert.equal(wrongGame.compatibility.state, 'incompatible');
    assert.ok(wrongGame.blockers.length);
    await fs.writeFile(path.join(root, 'mods', 'alias-provider.jar'), archive([
      ['fabric.mod.json', JSON.stringify({schemaVersion:1,id:'real_library',name:'real_library',provides:['library_alias'],version:'2.0.0'})]
    ]));
    await fs.writeFile(path.join(root, 'mods', 'alias-consumer.jar'), archive([
      ['fabric.mod.json', JSON.stringify({schemaVersion:1,id:'consumer',name:'consumer',version:'1.0.0',depends:{library_alias:'>=2'},breaks:{minecraft:'>=1.21',library_alias:'>=2'},conflicts:{java:'>=21'}})]
    ]));
    const conflictReport = await inspect(root, '1.21.11', '0.19.5');
    const consumer = conflictReport.mods.find(mod => mod.id === 'consumer');
    assert.ok(consumer.blockers.some(issue => /minecraft/.test(issue)));
    assert.ok(consumer.blockers.some(issue => /real_library/.test(issue)));
    assert.ok(consumer.issues.some(issue => /Declared conflict: java/.test(issue)));
    assert.equal(consumer.blockers.some(issue => /java/.test(issue)), false);
    assert.ok(conflictReport.mods.find(mod => mod.id === 'real_library').requiredBy.includes('consumer'));
    await fs.writeFile(path.join(root, 'mods', 'nested-consumer.jar'), archive([
      ['fabric.mod.json', JSON.stringify({schemaVersion:1,id:'nested_consumer',name:'nested_consumer',version:'1.0.0',depends:{architectury:'>=19'}})]
    ]));
    const impacts = await inspect(root, '1.21.11', '0.19.5');
    assert.ok(impacts.mods.find(mod => mod.id === 'roughlyenoughitems').requiredBy.includes('nested_consumer'));
    const warning = '[WARN] Error loading class: mezz/jei/fabric/platform/RenderHelper (java.lang.ClassNotFoundException: mezz/jei/fabric/platform/RenderHelper)';
    const context = '[WARN] @Mixin target mezz.jei.fabric.platform.RenderHelper was not found appleskin.jei.mixins.json:JEIRenderHelperMixin from mod appleskin';
    assert.deepEqual(diagnose([warning, context]), []);
    assert.ok(diagnose([warning]).length);
    assert.ok(diagnose([warning.replace('[WARN]', '[ERROR]'), context]).length);
    assert.ok(diagnose([warning, context, 'java.lang.NoClassDefFoundError: example/RequiredClass']).length);
    console.log('PASS Java and REI inspection, alias/nested disable impact, built-in/alias conflicts, and narrow AppleSkin diagnostics');
  } finally { await fs.rm(root, {recursive: true, force: true}); }
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
