const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { gameEnvironment } = require('../src/lib/game/environment');
const { spawnGame } = require('../src/lib/game/launch');
const { diagnose } = require('../src/lib/recovery');
let passed = 0, root;
async function test(name, fn) { await fn(); passed++; console.log('PASS ' + name); }
(async () => {
  await test('game inherits OS essentials but not credentials or injection options', async () => {
    const source = { Path: 'synthetic-path', SystemRoot: 'synthetic-root', HOME: 'synthetic-home', DISPLAY: ':0', LC_ALL: 'en_US.UTF-8', __GLX_VENDOR_LIBRARY_NAME: 'nvidia', JAVA_TOOL_OPTIONS: '-javaagent:evil.jar', JDK_JAVA_OPTIONS: '-javaagent:evil.jar', _JAVA_OPTIONS: '-javaagent:evil.jar', CLASSPATH: 'evil.jar', NODE_OPTIONS: '--require evil.js', LD_PRELOAD: 'evil.so', LD_LIBRARY_PATH: 'evil', GH_TOKEN: 'secret', AWS_SECRET_ACCESS_KEY: 'secret', CURSEFORGE_API_KEY: 'secret', CUSTOM_SECRET: 'secret', UNLABELLED_PRIVATE_VALUE: 'secret' };
    const result = gameEnvironment(source);
    assert.deepEqual(Object.keys(result).sort(), ['Path', 'SystemRoot', 'HOME', 'DISPLAY', 'LC_ALL', '__GLX_VENDOR_LIBRARY_NAME'].sort());
    assert.equal(JSON.stringify(result).includes('secret'), false); assert.equal(source.GH_TOKEN, 'secret');
  });
  await test('spawned synthetic process receives filtered environment', async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'sloth-env-test-'));
    const names = ['JAVA_TOOL_OPTIONS', 'SLOTH_SYNTHETIC_PRIVATE_VALUE'], saved = names.map(name => process.env[name]);
    process.env.JAVA_TOOL_OPTIONS = '-javaagent:synthetic-not-executed.jar'; process.env.SLOTH_SYNTHETIC_PRIVATE_VALUE = 'synthetic-private';
    try {
      const output = [];
      await new Promise((resolve, reject) => {
        spawnGame({ javaPath: process.execPath, gameDir: root }, ['-e', 'console.log(JSON.stringify({injection:process.env.JAVA_TOOL_OPTIONS,secret:process.env.SLOTH_SYNTHETIC_PRIVATE_VALUE,os:!!process.env.SystemRoot||!!process.env.HOME}))'], { onLine: line => output.push(line), onExit: result => result.code === 0 ? resolve() : reject(new Error('Synthetic process failed')) });
      });
      assert.deepEqual(JSON.parse(output.join('')), { os: true });
    } finally { names.forEach((name, index) => { if (saved[index] === undefined) delete process.env[name]; else process.env[name] = saved[index]; }); }
  });
  const fixtures = [
    ['SELF_SIGNED_CERT_IN_CHAIN', 'toolbox', /Keep certificate verification enabled/],
    ['PKIX path building failed', 'toolbox', /unknown source/],
    ['Failed to extract natives', 'care', /Do not force-close unrelated/],
    ['UnsatisfiedLinkError', 'care', /Repair managed files/],
    ['Pixel format not accelerated', 'settings', /windowed/],
    ['Failed to set display mode', 'settings', /GPU/],
    ['Multiplayer is disabled', 'home', /does not bypass/],
    ['Checksum mismatch', 'downloads', /does not prove tampering/]
  ];
  await test('Java health probe excludes inherited injection options', async () => {
    const java = process.env.SLOTH_TEST_JAVA || 'C:\\Program Files\\Java\\jdk-21.0.12.1\\bin\\java.exe';
    await fs.access(java);
    const saved = process.env.JAVA_TOOL_OPTIONS; process.env.JAVA_TOOL_OPTIONS = '-javaagent:synthetic-not-executed.jar';
    try {
      const report = await require('../src/lib/health').inspect({ root, dir: root, instance: { pack: true }, settings: { memoryMb: 2048, javaPath: java }, totalMb: 8192, wrapper: __filename, bundled: [] });
      const check = report.checks.find(item => item.title === 'Custom Java'); assert.equal(check.level, 'good'); assert.match(check.detail, /Java 21/);
    } finally { if (saved === undefined) delete process.env.JAVA_TOOL_OPTIONS; else process.env.JAVA_TOOL_OPTIONS = saved; }
  });
  for (const [clue, action, advice] of fixtures) await test('actionable support clue: ' + clue, async () => { const result = diagnose([clue]); assert.ok(result.length); assert.equal(result[0].action, action); assert.match(result[0].advice, advice); });
  await test('ordinary output does not become a support diagnosis', async () => { assert.deepEqual(diagnose(['Minecraft loaded normally']), []); });
  await test('connection checks explain TLS failures without relaxing verification', async () => {
    const dns = require('node:dns/promises'), savedLookup = dns.lookup, savedFetch = global.fetch;
    dns.lookup = async () => ({ address: '127.0.0.1', family: 4 });
    global.fetch = async (_url, options) => { assert.equal(options.redirect, 'error'); throw new TypeError('fetch failed', { cause: { code: 'SELF_SIGNED_CERT_IN_CHAIN' } }); };
    try { const report = await require('../src/lib/connection-check').inspect(); assert.equal(report.results.length, 3); for (const result of report.results) { assert.equal(result.state, 'error'); assert.match(result.detail, /Certificate verification failed/); assert.match(result.detail, /Keep certificate verification enabled/); } }
    finally { dns.lookup = savedLookup; global.fetch = savedFetch; }
  });
  await test('twenty sequential callback responses drain and close cleanly', async () => {
    const { browserSignIn } = require('../src/lib/auth/browser-signin'), { flowFor } = require('../src/lib/auth/microsoft');
    for (let attempt = 0; attempt < 20; attempt++) {
      const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 5000); let url;
      const done = browserSignIn(flowFor({ mode: 'azure', clientId: '11111111-2222-3333-4444-555555555555' }), { signal: controller.signal, onPrompt: () => {}, openExternal: async value => { url = new URL(value); } }); done.catch(() => {});
      try {
        while (!url) await new Promise(resolve => setTimeout(resolve, 5));
        const base = url.searchParams.get('redirect_uri').replace('localhost', '127.0.0.1');
        const wrong = await fetch(base + '/?state=wrong', { signal: AbortSignal.timeout(2000) }); assert.equal(wrong.status, 404); await wrong.text();
        const response = await fetch(base + '/?error=access_denied&state=' + url.searchParams.get('state'), { signal: AbortSignal.timeout(2000) }); assert.equal(response.status, 200); assert.match(await response.text(), /Sign-in not completed/);
        await Promise.race([assert.rejects(done, error => error.code === 'cancelled'), new Promise((_, reject) => setTimeout(() => reject(new Error('Callback cleanup stalled')), 2500))]);
        await assert.rejects(fetch(base + '/?state=wrong', { signal: AbortSignal.timeout(500) }));
      } finally { clearTimeout(timeout); controller.abort(); }
    }
  });
  console.log(`${passed}/${passed} support/launch-environment checks passed`);
})().catch(error => { console.error(error.stack); process.exitCode = 1; }).finally(async () => { if (root) await fs.rm(root, { recursive: true, force: true }); });
