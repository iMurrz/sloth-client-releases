const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { InstanceManager } = require('../src/lib/instances');
const { Recovery, diagnose } = require('../src/lib/recovery');
const { preset, inspect } = require('../src/lib/workshop');
const { defaultModSettings } = require('../src/lib/game/mods');

(async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sloth-workshop-'));
  let passed = 0;
  async function test(name, fn) { await fn(); passed++; console.log(`PASS ${name}`); }
  try {
    const manager = new InstanceManager(root, defaultModSettings(), '1.21.11');
    const source = manager.instancePath();
    await fs.mkdir(path.join(source, 'saves', 'Survival'), { recursive: true });
    await fs.writeFile(path.join(source, 'saves', 'Survival', 'level.dat'), 'original world');
    await fs.mkdir(path.join(source, 'mods'));
    await fs.writeFile(path.join(source, 'mods', 'managed.jar'), 'managed');
    await fs.writeFile(path.join(source, 'mods', 'custom.jar'), 'custom');
    await fs.writeFile(path.join(source, 'mods', 'custom.jar.disabled'), 'already disabled');
    await fs.writeFile(path.join(source, 'mods', '.sloth-managed.json'), JSON.stringify({ files: ['managed.jar'] }));
    await fs.writeFile(path.join(source, 'options.txt'), 'resourcePacks:["vanilla"]');
    await fs.writeFile(path.join(source, '.sloth-default-resourcepacks.json'), '{"applied":["Murful.zip"]}');
    await fs.writeFile(path.join(source, 'accounts.json'), 'must not copy');
    const recovery = new Recovery(root);
    let point;
    await test('restore preserves saved world content and original instance', async () => {
      point = await recovery.create(source, manager.get(), 'Before experimenting');
      await fs.writeFile(path.join(source, 'saves', 'Survival', 'level.dat'), 'changed world');
      const restored = await recovery.restore(point, manager);
      assert.equal(await fs.readFile(path.join(manager.instancePath(restored.id), 'saves', 'Survival', 'level.dat'), 'utf8'), 'original world');
      assert.equal(await fs.readFile(path.join(source, 'saves', 'Survival', 'level.dat'), 'utf8'), 'changed world');
      await assert.rejects(fs.access(path.join(manager.instancePath(restored.id), 'accounts.json')));
      assert.equal(await fs.readFile(path.join(manager.instancePath(restored.id), '.sloth-default-resourcepacks.json'), 'utf8'), '{"applied":["Murful.zip"]}');
    });
    await test('damaged backup cannot change active instance or create an instance', async () => {
      const before = structuredClone(manager.value);
      await fs.writeFile(path.join(recovery.root, point, 'data', 'options.txt'), 'tampered');
      await assert.rejects(recovery.restore(point, manager), /damaged/);
      assert.deepEqual(manager.value, before);
    });
    await test('invalid restore identifier cannot leave backup root', async () => {
      await assert.rejects(recovery.restore('../escape', manager), /Invalid restore point/);
    });
    await test('insufficient space rejects copy before publishing snapshot', async () => {
      const before = (await recovery.list()).length;
      const savedCheck = recovery.checkSpace;
      recovery.checkSpace = async () => { throw new Error('Not enough free disk space'); };
      await assert.rejects(recovery.create(source, manager.get(), 'Too large'), /disk space/);
      recovery.checkSpace = savedCheck;
      assert.equal((await recovery.list()).length, before);
    });
    await test('testing copy disables custom mods without replacing an existing disabled file', async () => {
      manager.setActive('sloth');
      const copy = await manager.create('Mod test', { duplicate: true, testing: true });
      const dir = manager.instancePath(copy.id);
      assert.equal(await fs.readFile(path.join(dir, 'mods', 'managed.jar'), 'utf8'), 'managed');
      await assert.rejects(fs.access(path.join(dir, 'mods', 'custom.jar')));
      assert.equal(await fs.readFile(path.join(dir, 'mods', 'custom.jar.disabled'), 'utf8'), 'already disabled');
      assert.equal(await fs.readFile(path.join(dir, 'mods', 'custom.jar.disabled-2'), 'utf8'), 'custom');
      assert.equal(await fs.readFile(path.join(source, 'mods', 'custom.jar'), 'utf8'), 'custom');
    });
    await test('instance names and favourites survive restart', async () => {
      manager.edit(manager.value.activeId, { name: 'Testing collection', favorite: true });
      const reloaded = new InstanceManager(root, defaultModSettings(), '1.21.11');
      assert.equal(reloaded.get().name, 'Testing collection');
      assert.equal(reloaded.list().find(i => i.active).favorite, true);
    });
    await test('presets respect memory cap and shader opt-in', async () => {
      const performance = preset('performance', 6144, 3584);
      assert.ok(performance.memoryMb <= 3584);
      assert.equal(performance.mods.iris, false);
      assert.equal(preset('visual', 32768, 16384).mods.iris, true);
      assert.throws(() => preset('unknown', 32768, 16384));
    });
    await test('storage report counts data and recognizes output capture limitation', async () => {
      const report = await inspect(root, manager.get(), { memoryMb: 4096, onLaunch: 'close', javaPath: '' }, 16384);
      assert.ok(report.groups.find(g => g.name === 'mods').files >= 3);
      assert.equal(report.checks.find(c => c.title === 'Output capture').level, 'warn');
    });
    await test('linked game data is rejected by recovery and skipped by storage scan', async () => {
      const outside = path.join(root, 'outside');
      await fs.mkdir(outside);
      await fs.writeFile(path.join(outside, 'private.txt'), 'private');
      const link = path.join(manager.instancePath(), 'config');
      await fs.symlink(outside, link, process.platform === 'win32' ? 'junction' : 'dir');
      await assert.rejects(recovery.create(manager.instancePath(), manager.get(), 'Linked'), /linked/);
      const report = await inspect(root, manager.get(), { memoryMb: 4096, onLaunch: 'keep', javaPath: '' }, 16384);
      assert.equal(report.groups.find(g => g.name === 'config').skipped, 1);
    });
    await test('launch insights recognize common errors and leave normal output unclassified', async () => {
      assert.ok(diagnose(['java.lang.OutOfMemoryError: Java heap space']).some(f => /memory/.test(f.title)));
      assert.deepEqual(diagnose(['Preparing spawn area: 100%']), []);
    });
    console.log(`${passed} workshop and recovery checks passed.`);
  } finally {
    if (path.dirname(root) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith('sloth-workshop-')) throw new Error('Unsafe test cleanup path');
    await fs.rm(root, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
