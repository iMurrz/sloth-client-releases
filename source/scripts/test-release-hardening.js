const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const { openZip } = require('../src/lib/zip');
let root, passed = 0;
function fixture(compressed = false) {
  const name = Buffer.from('hello.txt'), bytes = Buffer.from('hello'), data = compressed ? zlib.deflateRawSync(bytes) : bytes;
  const local = Buffer.alloc(30), central = Buffer.alloc(46), end = Buffer.alloc(22);
  local.writeUInt32LE(0x04034b50); local.writeUInt16LE(compressed ? 8 : 0, 8); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(bytes.length, 22); local.writeUInt16LE(name.length, 26);
  central.writeUInt32LE(0x02014b50); central.writeUInt16LE(compressed ? 8 : 0, 10); central.writeUInt32LE(data.length, 20); central.writeUInt32LE(bytes.length, 24); central.writeUInt16LE(name.length, 28);
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10); end.writeUInt32LE(central.length + name.length, 12); end.writeUInt32LE(local.length + name.length + data.length, 16);
  return Buffer.concat([local, name, data, central, name, end]);
}
async function test(label, fn) { await fn(); console.log('PASS ' + label); passed++; }
async function using(bytes, fn) {
  const file = path.join(root, String(Math.random()) + '.zip'); await fs.writeFile(file, bytes);
  const zip = await openZip(file); try { return await fn(zip); } finally { await zip.close(); }
}
(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'sloth-release-security-'));
  for (const compressed of [false, true]) await test('valid ' + (compressed ? 'deflated' : 'stored') + ' entry', () => using(fixture(compressed), async zip => assert.equal((await zip.read(zip.entries[0])).toString(), 'hello')));
  for (const [label, mutate] of [
    ['split archives', b => b.writeUInt16LE(1, b.length - 18)],
    ['incorrect directory count', b => { b.writeUInt16LE(2, b.length - 14); b.writeUInt16LE(2, b.length - 12); }],
    ['truncated name', b => b.writeUInt16LE(65535, b.readUInt32LE(b.length - 6) + 28)],
    ['encrypted entry', b => b.writeUInt16LE(1, b.readUInt32LE(b.length - 6) + 8)],
    ['directory overlapping footer', b => b.writeUInt32LE(1, b.length - 10)],
    ['false end comment size', b => b.writeUInt16LE(1, b.length - 2)]
  ]) await test('reject ' + label, async () => { const bytes = fixture(); mutate(bytes); await assert.rejects(using(bytes, () => {})); });
  await test('reject local/central compression mismatch', () => { const bytes = fixture(); bytes.writeUInt16LE(8, 8); return using(bytes, zip => assert.rejects(zip.read(zip.entries[0]), /disagree/)); });
  await test('reject oversized buffered reads before allocation', () => using(fixture(), zip => { zip.entries[0].uncompressedSize = 64 * 1024 * 1024 + 1; return assert.rejects(zip.read(zip.entries[0]), /too large/); }));
  await test('reject forged entry object', () => using(fixture(), zip => assert.rejects(zip.read({ ...zip.entries[0] }), /Unknown/)));
  await test('public release readiness fails closed', async () => {
    const { problems, assertReady } = require('./release-readiness'); assert.ok(problems().length); assert.throws(assertReady, /Public release blocked/);
    assert.match(require('../package.json').version, /^\d+[.]\d+[.]\d+(?:-beta[.]\d+)?$/); assert.equal(require('../package.json').build.forceCodeSigning, true);
  });
  console.log(`${passed}/${passed} release hardening checks passed`);
})().catch(error => { console.error(error.stack); process.exitCode = 1; }).finally(async () => { if (root) await fs.rm(root, { recursive: true, force: true }); });
