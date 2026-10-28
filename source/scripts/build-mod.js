#!/usr/bin/env node
// Builds the Java pieces the launcher bundles:
//   client-mod/     the Sloth Client Fabric mod (Gradle wrapper)
//   launchwrapper/  the tiny entry point that receives the access token over stdin
// Needs a JDK 21: uses JAVA_HOME if set, otherwise the default Windows JDK 21 location.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const env = { ...process.env };
if (!env.JAVA_HOME) {
  const fallback = 'C:\\Program Files\\Java\\jdk-21.0.12.1';
  if (fs.existsSync(fallback)) env.JAVA_HOME = fallback;
}
if (!env.JAVA_HOME) { console.error('Set JAVA_HOME to a JDK 21 installation.'); process.exit(1); }
const jdkTool = name => path.join(env.JAVA_HOME, 'bin', process.platform === 'win32' ? `${name}.exe` : name);

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, env, stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

// ---- launch wrapper ----
const wrapperDir = path.join(root, 'launchwrapper');
const classes = path.join(wrapperDir, 'build', 'classes');
const wrapperJar = path.join(wrapperDir, 'build', 'sloth-launchwrapper.jar');
fs.rmSync(path.join(wrapperDir, 'build'), { recursive: true, force: true });
fs.mkdirSync(classes, { recursive: true });
run(jdkTool('javac'), ['--release', '21', '-encoding', 'UTF-8', '-d', classes, path.join(wrapperDir, 'src', 'com', 'sloth', 'launch', 'TokenWrapper.java')], root);
run(jdkTool('jar'), ['--create', '--file', wrapperJar, '--date=2026-01-01T00:00:00Z', '-C', classes, '.'], root);
console.log(`Built ${path.relative(root, wrapperJar)}`);

// ---- Sloth Client mod ----
// Absolute wrapper path: Windows may be set to not search the current directory (NoDefaultCurrentDirectoryInExePath),
// and Node refuses to spawn .bat files directly, so go through cmd.exe.
const modDir = path.join(root, 'client-mod');
if (process.platform === 'win32') run('cmd.exe', ['/d', '/c', path.join(modDir, 'gradlew.bat'), 'clean', 'assemble', '-x', 'test', '--console=plain'], modDir);
else run(path.join(modDir, 'gradlew'), ['clean', 'assemble', '-x', 'test', '--console=plain'], modDir);

const libs = path.join(modDir, 'build', 'libs');
const jars = fs.readdirSync(libs).filter(f => /^sloth-client-.*\.jar$/.test(f) && !/-(sources|dev)\.jar$/.test(f));
if (jars.length !== 1) {
  console.error(`Expected exactly one Sloth Client jar in ${libs}, found: ${jars.join(', ') || 'none'}. Delete stale jars and rebuild.`);
  process.exit(1);
}
console.log(`Built ${jars[0]}`);
