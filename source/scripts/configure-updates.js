const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const [owner, repo = 'sloth-launcher-releases'] = process.argv.slice(2);
if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(owner || '') || !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/.test(repo)) {
  console.error('Usage: npm run updates:configure -- GITHUB_OWNER [REPOSITORY]');
  process.exit(1);
}
const configFile = path.join(root, 'src', 'lib', 'config.js');
const original = fs.readFileSync(configFile, 'utf8');
const pattern = /updates:\s*\{\s*owner:\s*'[^']*',\s*repo:\s*'[^']*'\s*\}/;
if (!pattern.test(original)) throw new Error('The update configuration format changed. No files were edited.');
const pkgFile = path.join(root, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8'));
pkg.build.publish[0].owner = owner;
pkg.build.publish[0].repo = repo;
fs.writeFileSync(configFile, original.replace(pattern, `updates: {\n    owner: '${owner}',\n    repo: '${repo}'\n  }`));
fs.writeFileSync(pkgFile, JSON.stringify(pkg, null, 2) + '\n');
console.log(`Update repository configured: ${owner}/${repo}. Rebuild the installer before publishing.`);
