// Owner-only development artifact. Production signing requirements remain unchanged.
const { build } = require('electron-builder');
build({ win: ['nsis'], publish: 'never', config: {
  forceCodeSigning: false,
  win: { signExecutable: false },
  directories: { output: 'release/sloth-development' },
  extraMetadata: { slothDevelopmentUpdates: true }
} }).then(() => require('./verify-development').verifyDevelopment())
  .catch(error => { console.error(error.message); process.exit(1); });
