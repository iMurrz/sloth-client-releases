#!/usr/bin/env node
// Developer smoke test: runs the real installer headless (plain Node, no Electron) and optionally boots the
// game to the title screen with a throwaway offline session to prove the classpath, natives and mods load.
// Not shipped in the app. Usage: node scripts/smoke-install.js [--deep] [--launch] [--mods=iris,modmenu]
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const config = require('../src/lib/config');
const { prepareGame } = require('../src/lib/game/installer');
const { buildLaunchArgs, redactArgs, spawnGame } = require('../src/lib/game/launch');
const { defaultModSettings } = require('../src/lib/game/mods');

const flags = new Set(process.argv.slice(2).filter(a => !a.includes('=')));
const extraMods = (process.argv.find(a => a.startsWith('--mods=')) || '').slice(7).split(',').filter(Boolean);
const root = path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), '.sloth');
const bundledDir = path.join(__dirname, '..', 'client-mod', 'build', 'libs');
const bundled = fs.existsSync(bundledDir) ? fs.readdirSync(bundledDir).filter(f => /^sloth-client-.*\.jar$/.test(f) && !f.includes('sources')).map(f => path.join(bundledDir, f)) : [];

(async () => {
  const started = Date.now();
  let lastLine = '';
  const modSettings = { ...defaultModSettings(), ...Object.fromEntries(extraMods.map(m => [m, true])) };
  const plan = await prepareGame({
    root, instanceId: (process.argv.find(a=>a.startsWith('--instance='))||'--instance=sloth').slice(11), gameVersion: config.game.version, loaderVersion: config.game.fabricLoader, modSettings, bundledMods: bundled,
    deep: flags.has('--deep'),
    onProgress: p => {
      const line = p.stage === 'download'
        ? `${p.label}: ${p.done}/${p.total} files, ${(p.bytes / 1e6).toFixed(1)}/${(p.totalBytes / 1e6).toFixed(1)} MB`
        : `${p.label}${p.total ? `: ${p.done}/${p.total}` : ''}`;
      if (line !== lastLine && (p.stage !== 'check' || p.done === p.total)) { console.log(line); lastLine = line; }
    }
  });
  console.log(`\nReady in ${((Date.now() - started) / 1000).toFixed(1)}s. Downloaded ${plan.downloaded.files} files (${(plan.downloaded.bytes / 1e6).toFixed(1)} MB).`);
  console.log(`Java: ${plan.javaPath} (${plan.javaVersion})\nProfile: ${plan.profileId}\nClasspath entries: ${plan.classpath.length}\nMods: ${plan.enabledMods.join(', ')}\nBundled: ${bundled.map(b => path.basename(b)).join(', ') || '(none built yet)'}`);

  if (!flags.has('--launch')) return;
  // A recognizable fake token: the check below proves it never reaches the process command line.
  const fakeToken = `SMOKE-SECRET-${Date.now()}`;
  const wrapperJar = path.join(__dirname, '..', 'launchwrapper', 'build', 'sloth-launchwrapper.jar');
  const args = buildLaunchArgs(plan, {
    session: { name: 'SlothSmoke', uuid: '00000000000000000000000000000000', accessToken: fakeToken },
    memoryMb: 3072, wrapperJar,
    launcherName: config.launcherName, launcherVersion: 'smoke', clientId: 'smoke'
  });
  // Dev self-check in the Sloth Client: audit all mixins and screenshot each in-game screen.
  if (flags.has('--devcheck')) args.splice(args.indexOf('com.sloth.launch.TokenWrapper'), 0, '-Dsloth.devCheck=true');
  if (flags.has('--polish')) args.splice(args.indexOf('com.sloth.launch.TokenWrapper'), 0, '-Dsloth.devCheckPolish=true');
  // --world=<save folder>: DevCheck also opens that world and checks the in-game cosmetics and pause menu.
  const world = (process.argv.find(a => a.startsWith('--world=')) || '').slice(8);
  if (world && /^[A-Za-z0-9 _-]{1,64}$/.test(world)) args.splice(args.indexOf('com.sloth.launch.TokenWrapper'), 0, `-Dsloth.devCheckWorld=${world}`);
  console.log('\nLaunching (offline title-screen smoke test):\n', redactArgs(args).filter(a => !a.includes(path.delimiter)).join(' '));
  const log = fs.createWriteStream(path.join(os.tmpdir(), 'sloth-smoke-game.log'));
  setTimeout(() => {
    if (process.platform !== 'win32') return;
    const { execFileSync } = require('node:child_process');
    const cmd = execFileSync('powershell', ['-NoProfile', '-Command', `(Get-CimInstance Win32_Process -Filter "ProcessId=${child.pid}").CommandLine`], { encoding: 'utf8' });
    console.log(`  check> process command line: ${cmd.length} chars, contains token: ${cmd.includes(fakeToken)}, contains placeholder: ${cmd.includes('sloth-token-via-stdin')}`);
  }, 15000);
  const child = spawnGame(plan, args, {
    stdinSecret: fakeToken,
    onLine: line => { log.write(`${line}\n`); if (/Loading \d+ mods|Sloth Client|DEVCHECK|ERROR|Exception|Sound engine started|Created: .*textures\/atlas\/blocks/.test(line)) console.log('  game>', line.slice(0, 220)); },
    onExit: ({ code, error }) => { console.log(`Game exited (${error ? error.message : `code ${code}`})`); process.exit(0); }
  });
  const seconds = Number(process.env.SMOKE_SECONDS || 75);
  setTimeout(() => { console.log(`Stopping game after ${seconds}s`); child.kill(); }, seconds * 1000);
})().catch(err => { console.error('SMOKE FAILED:', err); process.exit(1); });
