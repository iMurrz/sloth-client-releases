const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');
const { spawn } = require('node:child_process');
const { expandArguments } = require('./rules');
const { gameEnvironment } = require('./environment');

// The official launcher's default G1 tuning, with the heap size taken from settings.
const GC_FLAGS = ['-XX:+UnlockExperimentalVMOptions', '-XX:+UseG1GC', '-XX:G1NewSizePercent=20', '-XX:G1ReservePercent=20', '-XX:MaxGCPauseMillis=50', '-XX:G1HeapRegionSize=32M'];

const WRAPPER_MAIN = 'com.sloth.launch.TokenWrapper';
const TOKEN_PLACEHOLDER = 'sloth-token-via-stdin';

/**
 * Builds the java command line for a prepared plan.
 * `session` = { name, uuid, accessToken, xuid }. `quickPlay` = "host:port" to join straight into a server.
 * With `wrapperJar`, the real access token is replaced by a placeholder and delivered over stdin by
 * spawnGame, so it never appears in the process command line (which Windows auditing, task managers and
 * JVM crash logs record).
 */
function buildLaunchArgs(plan, { session, memoryMb, resolution, quickPlay, accentHue, wrapperJar, launcherName, launcherVersion, clientId }) {
  const features = {
    is_demo_user: false,
    has_custom_resolution: Boolean(resolution),
    // Direct multiplayer selection does not enable Mojang's optional quick-play history file.
    has_quick_plays_support: false,
    is_quick_play_singleplayer: false,
    is_quick_play_multiplayer: Boolean(quickPlay),
    is_quick_play_realms: false
  };
  const vars = {
    auth_player_name: session.name,
    version_name: plan.profileId,
    game_directory: plan.gameDir,
    assets_root: plan.assetsDir,
    assets_index_name: plan.assetIndex,
    auth_uuid: session.uuid,
    auth_access_token: wrapperJar ? TOKEN_PLACEHOLDER : session.accessToken,
    clientid: clientId,
    auth_xuid: session.xuid || '0',
    user_type: 'msa',
    version_type: plan.versionType,
    resolution_width: resolution?.width,
    resolution_height: resolution?.height,
    quickPlayMultiplayer: quickPlay,
    natives_directory: plan.nativesDir,
    launcher_name: launcherName,
    launcher_version: launcherVersion,
    classpath: (wrapperJar ? [wrapperJar, ...plan.classpath] : plan.classpath).join(path.delimiter),
    classpath_separator: path.delimiter,
    library_directory: plan.librariesDir
  };
  return [
    `-Xms${Math.min(memoryMb, 1024)}M`, `-Xmx${memoryMb}M`, ...GC_FLAGS,
    // The launcher's accent colour, so the in-game menus match it (a plain number: never user text).
    ...(Number.isInteger(accentHue) ? [`-Dsloth.accentHue=${accentHue}`] : []),
    ...expandArguments(plan.jvmArgs, vars, features),
    ...(wrapperJar ? [WRAPPER_MAIN, plan.mainClass] : [plan.mainClass]),
    ...expandArguments(plan.gameArgs, vars, features)
  ];
}

const SECRET_FLAGS = new Set(['--accessToken', '--xuid', '--clientId']);

/** Copy of the command line that is safe to write to logs: no token, Xbox ID or client ID. */
function redactArgs(args) {
  return args.map((arg, i) => (SECRET_FLAGS.has(args[i - 1]) ? '<redacted>' : arg.length > 400 ? `${arg.slice(0, 120)}…(${arg.length} chars)` : arg));
}

/**
 * Starts the game. It is always detached so closing the launcher never takes the game down with it
 * (on Windows, attached children are killed with the parent). With `capture`, stdout/stderr lines are
 * streamed to `onLine`; without it the launcher lets go of the process entirely. `stdinSecret` (the access
 * token) is written once to the launch wrapper's stdin; `child.secretSent` resolves when it's delivered.
 */
function spawnGame(plan, args, { capture = true, stdinSecret, onLine, onExit } = {}) {
  if (!fs.existsSync(plan.javaPath)) throw new Error(`Java not found at ${plan.javaPath}`);
  fs.mkdirSync(plan.gameDir, { recursive: true });
  const child = spawn(plan.javaPath, args, {
    env: gameEnvironment(),
    cwd: plan.gameDir,
    detached: true,
    stdio: [stdinSecret ? 'pipe' : 'ignore', capture ? 'pipe' : 'ignore', capture ? 'pipe' : 'ignore'],
    windowsHide: false
  });
  child.secretSent = stdinSecret
    ? new Promise(resolve => {
      child.stdin.on('error', () => resolve());
      child.stdin.end(`${stdinSecret}\n`, () => resolve());
    })
    : Promise.resolve();
  if (!capture) child.secretSent.then(() => child.unref());
  else {
    for (const stream of [child.stdout, child.stderr]) readline.createInterface({ input: stream }).on('line', line => onLine?.(line));
  }
  child.once('error', err => onExit?.({ code: null, error: err }));
  child.once('exit', (code, signal) => onExit?.({ code, signal }));
  return child;
}

module.exports = { buildLaunchArgs, redactArgs, spawnGame };
