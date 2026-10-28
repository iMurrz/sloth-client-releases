#!/usr/bin/env node
// Security regression tests: npm run test:security
// Each test states the attack it guards against. Network tests talk to Microsoft but never sign in.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sloth-sec-'));
const results = [];
async function test(name, fn) {
  try { await fn(); results.push([true, name]); }
  catch (err) { results.push([false, name, err]); }
}

(async () => {
  const { signFile, verifyFile } = require('../src/lib/update-signature');
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const pub = publicKey.export({ type: 'spki', format: 'pem' });
  const priv = privateKey.export({ type: 'pkcs8', format: 'pem' });
  const installer = path.join(tmp, 'Sloth-Launcher-Setup-9.9.9.exe');
  fs.writeFileSync(installer, crypto.randomBytes(4096));
  const sig = await signFile(priv, installer, '9.9.9', 'Sloth-Launcher-Setup-9.9.9.exe');

  await test('update: valid signature is accepted', async () => {
    assert.equal(await verifyFile(pub, installer, '9.9.9', 'Sloth-Launcher-Setup-9.9.9.exe', sig), true);
  });
  await test('update: tampered installer is rejected', async () => {
    const bad = path.join(tmp, 'tampered.exe');
    const bytes = fs.readFileSync(installer); bytes[100] ^= 1; fs.writeFileSync(bad, bytes);
    assert.equal(await verifyFile(pub, bad, '9.9.9', 'Sloth-Launcher-Setup-9.9.9.exe', sig), false);
  });
  await test('update: signature replayed for another version is rejected', async () => {
    assert.equal(await verifyFile(pub, installer, '10.0.0', 'Sloth-Launcher-Setup-9.9.9.exe', sig), false);
  });
  await test('update: signature from a different key is rejected', async () => {
    const other = crypto.generateKeyPairSync('ed25519').privateKey.export({ type: 'pkcs8', format: 'pem' });
    const forged = await signFile(other, installer, '9.9.9', 'Sloth-Launcher-Setup-9.9.9.exe');
    assert.equal(await verifyFile(pub, installer, '9.9.9', 'Sloth-Launcher-Setup-9.9.9.exe', forged), false);
  });
  await test('update: garbage signature is rejected', async () => {
    assert.equal(await verifyFile(pub, installer, '9.9.9', 'Sloth-Launcher-Setup-9.9.9.exe', '<html>not found</html>'), false);
  });
  await test('update: shipped public key is Ed25519 and matches the release key when present', async () => {
    const shipped = crypto.createPublicKey(fs.readFileSync(path.join(__dirname, '..', 'src', 'lib', 'update-public-key.pem')));
    assert.equal(shipped.asymmetricKeyType, 'ed25519');
    const keyFile = path.join(os.homedir(), '.sloth-release', 'update-signing-key.pem');
    if (fs.existsSync(keyFile)) {
      const derived = crypto.createPublicKey(fs.readFileSync(keyFile)).export({ type: 'spki', format: 'pem' });
      assert.equal(derived, shipped.export({ type: 'spki', format: 'pem' }));
    }
  });

  // --- metadata and downloads ---
  const server = http.createServer((req, res) => res.end(req.url === '/meta.json' ? '{"poisoned":true}' : 'x'));
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const { pinnedJson } = require('../src/lib/game/meta');
  const { download } = require('../src/lib/http');

  await test('metadata: a response that does not match its pinned sha1 is refused and not cached', async () => {
    const file = path.join(tmp, 'meta.json');
    await assert.rejects(pinnedJson(`${base}/meta.json`, file, 'a'.repeat(40)), /Checksum mismatch/);
    assert.equal(fs.existsSync(file), false);
  });
  await test('metadata: a tampered cached copy is not trusted', async () => {
    const file = path.join(tmp, 'cached.json');
    fs.writeFileSync(file, '{"tampered":true}');
    await assert.rejects(pinnedJson(`${base}/meta.json`, file, 'b'.repeat(40)), /Checksum mismatch/);
  });
  await test('download: non-HTTPS URLs are refused', async () => {
    await assert.rejects(download(`${base}/x`, path.join(tmp, 'x'), { sha1: 'c'.repeat(40) }), /non-HTTPS/);
  });
  await test('download: files without a pinned hash are refused', async () => {
    await assert.rejects(download('https://piston-data.mojang.com/x', path.join(tmp, 'y')), /unverified/);
  });

  // --- settings from a (hypothetically) compromised renderer ---
  const { Settings } = require('../src/lib/settings');
  const settings = new Settings(path.join(tmp, 'settings.json'), { maxMemoryMb: 8192 });
  await test('settings: the renderer cannot point the launcher at an arbitrary java.exe', async () => {
    const after = settings.update({ javaPath: 'C:\\Users\\Public\\evil\\java.exe' });
    assert.equal(after.javaPath, '');
  });
  await test('settings: retired server fields cannot be restored by the renderer', async () => {
    const after = settings.update({ host: '--jvm-evil', port: 25567, autoJoin: true, slothFeatures: true });
    for (const key of ['host', 'port', 'autoJoin', 'slothFeatures']) assert.equal(Object.hasOwn(after, key), false);
  });
  await test('settings: the main-process picker can set Java, and clearing it works from the UI', async () => {
    assert.equal(settings.setJavaPath('C:\\Program Files\\Java\\jdk-21\\bin\\javaw.exe').javaPath.endsWith('javaw.exe'), true);
    assert.equal(settings.update({ javaPath: '' }).javaPath, '');
  });

  // --- launch ---
  const { buildLaunchArgs, redactArgs } = require('../src/lib/game/launch');
  const plan = { profileId: 'p', gameDir: 'g', assetsDir: 'a', assetIndex: '29', versionType: 'release', nativesDir: 'n', librariesDir: 'l', classpath: ['c.jar'], mainClass: 'Main',
    jvmArgs: ['-cp', '${classpath}'], gameArgs: ['--accessToken', '${auth_access_token}', '--xuid', '${auth_xuid}', '--clientId', '${clientid}'] };
  const session = { name: 'Steve', uuid: '0'.repeat(32), accessToken: 'eyJSECRET.TOKEN.VALUE', xuid: '123456' };
  await test('launch: with the wrapper, the access token is not on the command line', async () => {
    const args = buildLaunchArgs(plan, { session, memoryMb: 4096, wrapperJar: 'w.jar', clientId: 'cid', launcherName: 'x', launcherVersion: '1' });
    assert.equal(args.some(a => a.includes('eyJSECRET')), false);
    assert.equal(args.includes('com.sloth.launch.TokenWrapper'), true);
  });
  await test('launch: logged command lines hide token, xuid and client ID', async () => {
    const args = buildLaunchArgs(plan, { session, memoryMb: 4096, clientId: 'cid', launcherName: 'x', launcherVersion: '1' });
    const logged = redactArgs(args).join(' ');
    for (const secret of ['eyJSECRET', '123456', 'cid']) assert.equal(logged.includes(secret), false, secret);
  });

  // --- server data rendered in the UI ---
  const { motdSegments } = require('../src/lib/server-ping');
  await test('server ping: MOTD becomes plain text segments (no markup, capped)', async () => {
    const segs = motdSegments({ text: '<img src=x onerror=alert(1)>', color: 'javascript:alert(1)', extra: Array(500).fill('§cspam') });
    assert.equal(segs.length <= 81, true);
    assert.equal(segs[0].text, '<img src=x onerror=alert(1)>');
    assert.equal(segs[0].color, undefined);
  });

  // --- sign-in ---
  const { flowFor } = require('../src/lib/auth/microsoft');
  const { browserSignIn } = require('../src/lib/auth/browser-signin');
  await test('loopback sign-in: forged callbacks (wrong state) are ignored; only the real one completes', async () => {
    const flow = flowFor({ mode: 'azure', clientId: '11111111-2222-3333-4444-555555555555' });
    let authorizeUrl;
    const done = browserSignIn(flow, { openExternal: async url => { authorizeUrl = new URL(url); }, onPrompt: () => {} });
    done.catch(() => {});
    while (!authorizeUrl) await new Promise(r => setTimeout(r, 20));
    assert.equal(authorizeUrl.searchParams.get('code_challenge_method'), 'S256');
    assert.equal(authorizeUrl.searchParams.get('code_challenge').length, 43);
    const redirect = authorizeUrl.searchParams.get('redirect_uri').replace('localhost', '127.0.0.1');
    const forged = await fetch(`${redirect}/?code=attacker&state=wrong`);
    assert.equal(forged.status, 404);
    await forged.text();
    const state = authorizeUrl.searchParams.get('state');
    const denied = await fetch(`${redirect}/?error=access_denied&state=${state}`);
    assert.equal(denied.status, 200);
    await denied.text();
    await assert.rejects(done, err => err.code === 'cancelled');
    await assert.rejects(fetch(`${redirect}/?state=${state}`, { signal: AbortSignal.timeout(1000) }), 'listener must be closed after one use');
  });
  await test('device-code sign-in: Microsoft accepts our request and polling format (then we cancel)', async () => {
    const flow = flowFor({ mode: 'live', clientId: '00000000402b5328' });
    const controller = new AbortController();
    let prompt;
    const done = browserSignIn(flow, { openExternal: async () => {}, onPrompt: p => { prompt = p; }, signal: controller.signal });
    done.catch(() => {});
    while (!prompt) await new Promise(r => setTimeout(r, 50));
    assert.match(prompt.userCode, /^[A-Z0-9-]{4,16}$/i);
    assert.equal(new URL(prompt.verificationUri).hostname.endsWith('microsoft.com'), true);
    await new Promise(r => setTimeout(r, 6500)); // one poll: an invalid request would reject here instead of staying pending
    controller.abort();
    await assert.rejects(done, err => err.code === 'cancelled');
  });
  await test('loopback sign-in: matching callback is consumed before token exchange finishes', async () => {
    const flow = flowFor({ mode: 'azure', clientId: '11111111-2222-3333-4444-555555555555' });
    const originalFetch = global.fetch; let authorizeUrl, release;
    const controller = new AbortController();
    global.fetch = async (url, options) => String(url) === flow.token ? new Promise(resolve => { release = () => resolve(Response.json({ access_token: 'SYNTHETIC', refresh_token: 'SYNTHETIC', expires_in: 3600 })); }) : originalFetch(url, options);
    const done = browserSignIn(flow, { openExternal: async url => { authorizeUrl = new URL(url); }, onPrompt: () => {}, signal: controller.signal }); done.catch(() => {});
    try {
      while (!authorizeUrl) await new Promise(resolve => setTimeout(resolve, 10));
      const redirect = authorizeUrl.searchParams.get('redirect_uri').replace('localhost', '127.0.0.1');
      const callback = `${redirect}/?code=synthetic&state=${authorizeUrl.searchParams.get('state')}`;
      const first = await originalFetch(callback); assert.equal(first.status, 200); await first.text();
      const repeated = await originalFetch(callback); assert.equal(repeated.status, 404); await repeated.text();
      assert.equal(typeof release, 'function'); release(); await done;
    } finally { release?.(); controller.abort(); global.fetch = originalFetch; }
  });

  server.close();
  fs.rmSync(tmp, { recursive: true, force: true });
  for (const [ok, name, err] of results) console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : `\n    ${err?.stack}\n    cause: ${err?.cause?.code || ''} ${err?.cause?.message || ''}`}`);
  const failed = results.filter(r => !r[0]).length;
  console.log(`\n${results.length - failed}/${results.length} security tests passed`);
  process.exit(failed ? 1 : 0);
})();
