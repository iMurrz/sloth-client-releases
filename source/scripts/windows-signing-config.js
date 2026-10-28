const fs = require('node:fs');
const path = require('node:path');
const configPath = path.join(__dirname, '..', 'build', 'windows-signing.json');
function loadSigningConfig() {
  if (!fs.existsSync(configPath)) throw new Error('Windows signing is not configured. Follow WINDOWS-SIGNING-SETUP.md and create build/windows-signing.json.');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const allowed = ['endpoint', 'codeSigningAccountName', 'certificateProfileName', 'publisherName', 'profileType'];
  if (Object.keys(config).some(key => !allowed.includes(key))) throw new Error('Signing configuration may contain only public resource names; credentials belong outside the project.');
  if (config.profileType !== 'PublicTrust') throw new Error('A PublicTrust certificate profile is required for the public Windows release.');
  if (!/^https:\/\/(brs|cus|eus|jpe|krc|ncus|neu|plc|scus|swn|wcus|weu|wus|wus2|wus3)\.codesigning\.azure\.net\/?$/.test(config.endpoint || '')) throw new Error('Use a supported Microsoft Artifact Signing HTTPS endpoint.');
  for (const field of ['codeSigningAccountName', 'certificateProfileName']) {
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(config[field] || '') || /REPLACE/i.test(config[field])) throw new Error('Enter the actual Azure resource value for ' + field);
  }
  if (typeof config.publisherName !== 'string' || !config.publisherName.trim() || config.publisherName.length > 200 || /[\r\n\x00]|REPLACE/.test(config.publisherName)) throw new Error('Enter the exact verified certificate publisher name.');
  const { profileType, ...options } = config;
  return { ...options, fileDigest: 'SHA256', timestampDigest: 'SHA256', timestampRfc3161: 'http://timestamp.acs.microsoft.com' };
}
if (require.main === module) {
  try { loadSigningConfig(); console.log('Public signing configuration is ready. Azure identity, permissions and certificate issuance still require service verification.'); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { loadSigningConfig, configPath };
