#!/usr/bin/env node
// Imports another launcher's game folder (or a .zip of one) into the Sloth instance, outside the launcher UI.
// Usage: node scripts/import-profile.js <folder|zip> [--run] [--worlds=World1,World2]
// Without --run it only reports what it would import.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const config = require('../src/lib/config');
const importer = require('../src/lib/importer');

const source = process.argv[2];
const run = process.argv.includes('--run');
const worldsArg = (process.argv.find(a => a.startsWith('--worlds=')) || '').slice(9).split(',').filter(Boolean);
const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
const gameRoot = path.join(appData, '.sloth');
const instanceDir = path.join(gameRoot, 'instances', 'sloth');
const settingsFile = path.join(appData, 'sloth-launcher', 'sloth-launcher-settings.json');

(async () => {
  if (!source || !fs.existsSync(source)) {
    console.log('Detected sources:');
    for (const s of importer.detectSources()) console.log(`  ${s.name.padEnd(28)} ${s.path}`);
    console.log('\nUsage: node scripts/import-profile.js <folder|zip> [--run]');
    return;
  }
  let dir = source, temp = null;
  if (/\.zip$/i.test(source)) {
    temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sloth-import-'));
    dir = await importer.extractZip(source, temp);
  }
  try {
    const scan = await importer.scan(dir, { gameRoot, gameVersion: config.game.version });
    console.log(`Source: ${source}`);
    console.log(`  Screenshots:    ${scan.screenshots}`);
    console.log(`  Resource packs: ${scan.resourcepacks.join(', ') || '-'}`);
    console.log(`  Shader packs:   ${scan.shaderpacks.join(', ') || '-'}`);
    console.log(`  Mods:           ${scan.mods.length} jar(s)`);
    for (const w of scan.worlds) console.log(`  World:          ${w.title} (${w.version}) ${w.compatible ? 'can be imported' : `made in a newer version: skipped (would corrupt in ${config.game.version})`}`);
    if (!run) { console.log('\nDry run. Add --run to import.'); return; }

    const report = await importer.importFrom(dir, {
      screenshots: true, resourcepacks: true, shaderpacks: true, mods: true,
      worlds: scan.worlds.filter(w => w.compatible || worldsArg.includes(w.folder)).map(w => w.folder)
    }, { instanceDir, gameVersion: config.game.version, onProgress: msg => console.log(`  … ${msg}`) });

    if (report.enableCatalog.length) {
      const settings = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
      for (const slug of report.enableCatalog) settings.mods[slug] = true;
      fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2));
    }
    console.log('\nImported:');
    console.log(`  ${report.screenshots} screenshots`);
    console.log(`  Resource packs: ${report.resourcepacks.join(', ') || '-'}`);
    console.log(`  Shader packs:   ${report.shaderpacks.join(', ') || '-'}`);
    console.log(`  Worlds:         ${report.worlds.join(', ') || '-'}`);
    console.log(`  Turned on in the launcher catalog: ${[...new Set(report.enableCatalog)].join(', ') || '-'}`);
    console.log(`  Installed from Modrinth (${config.game.version}): ${report.mods.join(', ') || '-'}`);
    console.log(`  Not available for ${config.game.version}: ${report.unmatched.join(', ') || '-'}`);
    if (report.skipped.length) console.log(`  Skipped: ${report.skipped.join(', ')}`);
  } finally {
    if (temp) fs.rmSync(temp, { recursive: true, force: true });
  }
})().catch(err => { console.error('Import failed:', err.message); process.exit(1); });
