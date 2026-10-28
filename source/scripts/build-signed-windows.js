const { build } = require('electron-builder');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
async function main() {
  const azureSignOptions = require('./windows-signing-config').loadSigningConfig();
  const pkg = require('../package.json');
  await build({ win: ['nsis'], publish: 'never', config: {
    forceCodeSigning: true,
    extraMetadata: { slothDevelopmentUpdates: false },
    win: { signExecutable: true, azureSignOptions },
    publish: pkg.build.publish.map(provider => ({ ...provider, publisherName: [azureSignOptions.publisherName] }))
  } });
  const verification = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-File', path.join(__dirname, 'verify-windows-signing.ps1')], { stdio: 'inherit', windowsHide: true });
  if (verification.error || verification.status !== 0) throw new Error('Signed build failed Windows trust or publisher verification. Do not publish.');
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
